import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AuthenticationError,
  BadRequestError,
  ConnectionError,
  DEFAULT_BASE_URL,
  Mailry,
  MailryError,
  RateLimitError,
  TimeoutError,
} from '../src';
import { json, mockFetch } from './helpers';

const page = (data: unknown[], currentPage: number, totalPage: number) =>
  json({ data, pagination: { currentPage, totalPage, totalData: data.length }, status_code: 200, message: 'ok' });

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('Mailry client', () => {
  it('accepts an api key string', () => {
    expect(() => new Mailry('mk_test')).not.toThrow();
  });

  it('reads the api key from the environment', () => {
    vi.stubEnv('MAILRY_API_KEY', 'mk_env');
    expect(() => new Mailry()).not.toThrow();
  });

  it('throws a helpful error without an api key', () => {
    vi.stubEnv('MAILRY_API_KEY', '');
    expect(() => new Mailry()).toThrow(/Missing API key/);
  });

  it('sends the bearer token and user agent to the default base url', async () => {
    const { fetch, calls } = mockFetch(page([], 1, 0));
    await new Mailry('mk_test', { fetch }).domains.list();

    expect(calls[0]!.url.origin + calls[0]!.url.pathname).toBe(`${DEFAULT_BASE_URL}/public/domain`);
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer mk_test');
    expect(headers['User-Agent']).toMatch(/^mailry-js\//);
  });

  it('honours a custom base url', async () => {
    const { fetch, calls } = mockFetch(page([], 1, 0));
    await new Mailry({ apiKey: 'k', baseUrl: 'http://localhost:4000/', fetch }).domains.list();
    expect(calls[0]!.url.toString()).toBe('http://localhost:4000/public/domain');
  });
});

describe('domains', () => {
  it('passes search and pagination as query params', async () => {
    const { fetch, calls } = mockFetch(page([{ id: 'd1' }], 2, 3));
    const res = await new Mailry('k', { fetch }).domains.list({ search: 'acme', page: 2, limit: 5 });

    expect(Object.fromEntries(calls[0]!.url.searchParams)).toEqual({ search: 'acme', page: '2', limit: '5' });
    expect(res.data).toEqual([{ id: 'd1' }]);
    expect(res.pagination.totalPage).toBe(3);
  });

  it('iterates through every page with listAll', async () => {
    const { fetch, calls } = mockFetch(page([{ id: 'a' }, { id: 'b' }], 1, 2), page([{ id: 'c' }], 2, 2));
    const ids: string[] = [];
    for await (const domain of new Mailry('k', { fetch }).domains.listAll({ limit: 2 })) ids.push(domain.id);

    expect(ids).toEqual(['a', 'b', 'c']);
    expect(calls.map((c) => c.url.searchParams.get('page'))).toEqual(['1', '2']);
  });
});

describe('emailAccounts', () => {
  it('filters by domain id', async () => {
    const { fetch, calls } = mockFetch(page([], 1, 0));
    await new Mailry('k', { fetch }).emailAccounts.list({ domainId: 'dom-1' });
    expect(calls[0]!.url.pathname).toBe('/public/email');
    expect(calls[0]!.url.searchParams.get('domainId')).toBe('dom-1');
  });
});

describe('inbox.send', () => {
  it('posts multipart form data', async () => {
    const { fetch, calls } = mockFetch(json({ data: {}, status_code: 200, message: 'Success! Email sent successfully.' }, 201));
    const res = await new Mailry('k', { fetch }).inbox.send({
      emailId: 'mbx-1',
      to: ['a@example.com', 'b@example.com'],
      subject: 'Hello',
      htmlBody: '<p>Hi</p>',
      attachments: [
        { filename: 'notes.txt', content: 'hello world' },
        { filename: 'report.pdf', content: new Uint8Array([37, 80, 68, 70]) },
      ],
    });

    expect(res.message).toMatch(/sent/);
    expect(calls[0]!.init.method).toBe('POST');
    expect(calls[0]!.url.pathname).toBe('/public/inbox/send');

    const form = calls[0]!.init.body as FormData;
    expect(form.get('emailId')).toBe('mbx-1');
    expect(form.get('to')).toBe('a@example.com, b@example.com');
    expect(form.get('plainBody')).toBeNull();

    const files = form.getAll('attachments') as File[];
    expect(files.map((f) => f.name)).toEqual(['notes.txt', 'report.pdf']);
    expect(files[0]!.type).toBe('text/plain');
    expect(files[1]!.type).toBe('application/pdf');
    expect(await files[0]!.text()).toBe('hello world');
  });

  it('validates required fields before calling the api', async () => {
    const { fetch } = mockFetch();
    const mailry = new Mailry('k', { fetch });

    await expect(mailry.inbox.send({ emailId: '', to: 'a@b.c', subject: 's', plainBody: 'x' })).rejects.toThrow(/emailId/);
    await expect(mailry.inbox.send({ emailId: 'id', to: 'a@b.c', subject: 's' })).rejects.toThrow(/plainBody/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not retry a failed send on server errors', async () => {
    const { fetch } = mockFetch(json({ message: 'boom' }, 500));
    await expect(
      new Mailry('k', { fetch }).inbox.send({ emailId: 'id', to: 'a@b.c', subject: 's', plainBody: 'x' }),
    ).rejects.toMatchObject({ status: 500 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe('inbox.uploadAttachment', () => {
  it('uploads a file and returns its id', async () => {
    const { fetch, calls } = mockFetch(
      json({ data: { id: 'att-1', fileName: 'a.docx', fileSize: 3 }, status_code: 200, message: 'ok' }, 201),
    );
    const res = await new Mailry('k', { fetch }).inbox.uploadAttachment(
      new File([new Uint8Array([1, 2, 3])], 'a.docx'),
    );

    expect(res.data.id).toBe('att-1');
    const file = (calls[0]!.init.body as FormData).get('file') as File;
    expect(file.name).toBe('a.docx');
    expect(file.type).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  });
});

describe('errors', () => {
  it('maps 401 to AuthenticationError', async () => {
    const { fetch } = mockFetch(json({ message: 'Unauthorized', statusCode: 401 }, 401));
    const error = await new Mailry('bad', { fetch }).domains.list().catch((e) => e);
    expect(error).toBeInstanceOf(AuthenticationError);
    expect(error).toBeInstanceOf(MailryError);
    expect(error.status).toBe(401);
  });

  it('keeps every validation message from the api', async () => {
    const { fetch } = mockFetch(json({ message: ['emailId must be a UUID', 'bad'], error: 'Bad Request', statusCode: 400 }, 400));
    const error = await new Mailry('k', { fetch }).emailAccounts.list().catch((e) => e);
    expect(error).toBeInstanceOf(BadRequestError);
    expect(error.details).toEqual(['emailId must be a UUID', 'bad']);
    expect(error.message).toBe('emailId must be a UUID; bad');
  });

  it('reads nested error messages', async () => {
    const { fetch } = mockFetch(json({ message: { message: 'Oops! Something went wrong' } }, 400));
    const error = await new Mailry('k', { fetch }).domains.list().catch((e) => e);
    expect(error.message).toBe('Oops! Something went wrong');
  });

  it('retries rate limited requests using retry-after', async () => {
    const { fetch } = mockFetch(json({ message: 'Too Many Requests' }, 429, { 'retry-after': '0' }), page([], 1, 0));
    await new Mailry('k', { fetch }).domains.list();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('throws RateLimitError once retries are exhausted', async () => {
    const { fetch } = mockFetch(json({ message: 'Too Many Requests' }, 429, { 'retry-after': '7' }));
    const error = await new Mailry('k', { fetch, maxRetries: 0 }).domains.list().catch((e) => e);
    expect(error).toBeInstanceOf(RateLimitError);
    expect(error.retryAfter).toBe(7000);
  });

  it('wraps network failures in ConnectionError', async () => {
    const { fetch } = mockFetch(new TypeError('fetch failed'));
    const error = await new Mailry('k', { fetch, maxRetries: 0 }).domains.list().catch((e) => e);
    expect(error).toBeInstanceOf(ConnectionError);
  });

  it('times out slow requests', async () => {
    const fetch = vi.fn((_: unknown, init?: RequestInit) =>
      new Promise<Response>((_, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))),
    );
    const error = await new Mailry('k', { fetch, timeout: 10, maxRetries: 0 }).domains.list().catch((e) => e);
    expect(error).toBeInstanceOf(TimeoutError);
  });
});
