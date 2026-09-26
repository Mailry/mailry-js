export interface MailryErrorOptions {
  status?: number;
  body?: unknown;
  headers?: Headers;
  cause?: unknown;
}

export class MailryError extends Error {
  readonly status: number | undefined;
  readonly body: unknown;
  readonly headers: Headers | undefined;

  constructor(message: string, options: MailryErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = new.target.name;
    this.status = options.status;
    this.body = options.body;
    this.headers = options.headers;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class MailryApiError extends MailryError {
  readonly details: string[];

  constructor(message: string, options: MailryErrorOptions & { details?: string[] } = {}) {
    super(message, options);
    this.details = options.details ?? [message];
  }
}

export class BadRequestError extends MailryApiError {}

export class AuthenticationError extends MailryApiError {}

export class PermissionDeniedError extends MailryApiError {}

export class NotFoundError extends MailryApiError {}

export class PayloadTooLargeError extends MailryApiError {}

export class RateLimitError extends MailryApiError {
  get retryAfter(): number | undefined {
    return parseRetryAfter(this.headers);
  }
}

export class InternalServerError extends MailryApiError {}

export class ConnectionError extends MailryError {}

export class TimeoutError extends ConnectionError {}

export function parseRetryAfter(headers: Headers | undefined): number | undefined {
  if (!headers) return undefined;
  const value = headers.get('retry-after');
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, date - Date.now());
}

export function createApiError(status: number, body: unknown, headers: Headers): MailryApiError {
  const details = extractMessages(body, status);
  const message = details.join('; ');
  const options = { status, body, headers, details };

  switch (status) {
    case 400:
    case 422:
      return new BadRequestError(message, options);
    case 401:
      return new AuthenticationError(message, options);
    case 403:
      return new PermissionDeniedError(message, options);
    case 404:
      return new NotFoundError(message, options);
    case 413:
      return new PayloadTooLargeError(message, options);
    case 429:
      return new RateLimitError(message, options);
    default:
      if (status >= 500) return new InternalServerError(message, options);
      return new MailryApiError(message, options);
  }
}

function extractMessages(body: unknown, status: number): string[] {
  if (typeof body === 'string' && body.trim()) return [body.trim()];
  if (body && typeof body === 'object') {
    const record = body as Record<string, unknown>;
    const candidate = record.message ?? record.error;
    if (Array.isArray(candidate)) {
      const messages = candidate.filter((item): item is string => typeof item === 'string');
      if (messages.length) return messages;
    }
    if (typeof candidate === 'string' && candidate) return [candidate];
    if (candidate && typeof candidate === 'object') return extractMessages(candidate, status);
  }
  return [`Request failed with status ${status}`];
}
