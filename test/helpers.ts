import { vi } from 'vitest';
import type { FetchLike } from '../src';

export interface RecordedCall {
  url: URL;
  init: RequestInit;
}

export function mockFetch(...responses: Array<Response | Error>) {
  const calls: RecordedCall[] = [];
  const fetch = vi.fn<FetchLike>(async (input, init) => {
    calls.push({ url: new URL(String(input)), init: init ?? {} });
    const next = responses.shift();
    if (!next) throw new Error('No mocked response left');
    if (next instanceof Error) throw next;
    return next;
  });
  return { fetch, calls };
}

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}
