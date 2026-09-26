import {
  ConnectionError,
  MailryError,
  RateLimitError,
  TimeoutError,
  createApiError,
  parseRetryAfter,
} from './errors';
import type { FetchLike, MailryOptions, RequestOptions } from './types';
import { VERSION } from './version';

export const DEFAULT_BASE_URL = 'https://api.mailry.co';
export const DEFAULT_TIMEOUT = 60_000;
export const DEFAULT_MAX_RETRIES = 2;

type QueryValue = string | number | boolean | null | undefined;

export interface HttpRequest {
  method: 'GET' | 'POST';
  path: string;
  query?: Record<string, QueryValue>;
  body?: FormData;
  options?: RequestOptions;
}

export class HttpClient {
  readonly baseUrl: string;
  readonly timeout: number;
  readonly maxRetries: number;
  private readonly apiKey: string;
  private readonly defaultHeaders: Record<string, string>;
  private readonly fetchImpl: FetchLike;

  constructor(options: MailryOptions) {
    const apiKey = options.apiKey ?? readEnv('MAILRY_API_KEY');
    if (!apiKey) {
      throw new MailryError(
        'Missing API key. Pass it as `new Mailry("your_api_key")` or set the MAILRY_API_KEY environment variable.',
      );
    }

    const fetchImpl = options.fetch ?? globalThis.fetch;
    if (typeof fetchImpl !== 'function') {
      throw new MailryError(
        'No fetch implementation found. Use Node.js 18 or later, or pass a `fetch` function in the options.',
      );
    }

    this.apiKey = apiKey;
    this.baseUrl = (options.baseUrl ?? readEnv('MAILRY_BASE_URL') ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.timeout = options.timeout ?? DEFAULT_TIMEOUT;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.defaultHeaders = options.headers ?? {};
    this.fetchImpl = fetchImpl.bind(globalThis);
  }

  async request<T>(req: HttpRequest): Promise<T> {
    const maxRetries = req.options?.maxRetries ?? this.maxRetries;
    let attempt = 0;

    while (true) {
      try {
        return await this.send<T>(req);
      } catch (error) {
        if (attempt >= maxRetries || !this.shouldRetry(req, error)) throw error;
        attempt += 1;
        await sleep(this.retryDelay(attempt, error), req.options?.signal);
      }
    }
  }

  private async send<T>(req: HttpRequest): Promise<T> {
    const url = this.buildUrl(req.path, req.query);
    const timeout = req.options?.timeout ?? this.timeout;
    const controller = new AbortController();
    const userSignal = req.options?.signal;
    let timedOut = false;

    const onAbort = () => controller.abort(userSignal?.reason);
    if (userSignal) {
      if (userSignal.aborted) throw userSignal.reason ?? new MailryError('Request aborted');
      userSignal.addEventListener('abort', onAbort, { once: true });
    }
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeout);

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: req.method,
        headers: this.buildHeaders(req.options?.headers),
        body: req.body,
        signal: controller.signal,
      });
    } catch (error) {
      if (timedOut) throw new TimeoutError(`Request timed out after ${timeout}ms`, { cause: error });
      if (userSignal?.aborted) throw error;
      throw new ConnectionError(`Unable to reach the Mailry API at ${this.baseUrl}`, { cause: error });
    } finally {
      clearTimeout(timer);
      userSignal?.removeEventListener('abort', onAbort);
    }

    const body = await parseBody(response);
    if (!response.ok) throw createApiError(response.status, body, response.headers);
    return body as T;
  }

  private buildUrl(path: string, query?: Record<string, QueryValue>): string {
    const url = new URL(this.baseUrl + path);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
    }
    return url.toString();
  }

  private buildHeaders(extra?: Record<string, string>): Record<string, string> {
    return {
      Accept: 'application/json',
      'User-Agent': `mailry-js/${VERSION}`,
      ...this.defaultHeaders,
      ...extra,
      Authorization: `Bearer ${this.apiKey}`,
    };
  }

  private shouldRetry(req: HttpRequest, error: unknown): boolean {
    if (req.options?.signal?.aborted) return false;
    if (error instanceof RateLimitError) return true;
    if (req.method !== 'GET') return false;
    if (error instanceof ConnectionError) return true;
    if (error instanceof MailryError && error.status !== undefined) {
      return error.status === 408 || error.status >= 500;
    }
    return false;
  }

  private retryDelay(attempt: number, error: unknown): number {
    const retryAfter = error instanceof MailryError ? parseRetryAfter(error.headers) : undefined;
    if (retryAfter !== undefined && retryAfter <= 60_000) return retryAfter;
    const base = Math.min(500 * 2 ** (attempt - 1), 8_000);
    return base * (0.75 + Math.random() * 0.5);
  }
}

async function parseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('json')) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  return text;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function readEnv(name: string): string | undefined {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  const value = env?.[name]?.trim();
  return value ? value : undefined;
}
