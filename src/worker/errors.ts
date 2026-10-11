import type { Context } from 'hono';

import type { Reason } from '../shared/reasons';

/**
 * One error shape for every route:
 *   { "error": { "code", "reason", "message", "details"? }, "requestId" }
 * `code` is precise (for logs and tests); `reason` is the stable, user-facing category (issue #23) the widget
 * translates and client.js forwards as `discuss:error`. GitHub's own error text never reaches the browser.
 */
export const ERROR_STATUS = {
  BAD_REQUEST: 400,
  INVALID_JSON: 400,
  UNKNOWN_FIELDS: 400,
  EMPTY_TERM: 400,
  UNAUTHENTICATED: 401,
  INVALID_SIGNATURE: 401,
  FORBIDDEN: 403,
  ORIGIN_NOT_ALLOWED: 403,
  REPO_NOT_ALLOWED: 403,
  NOT_FOUND: 404,
  REPO_NOT_FOUND: 404,
  DISCUSSION_NOT_FOUND: 404,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  CATEGORY_MISMATCH: 422,
  VALIDATION_FAILED: 422,
  RATE_LIMITED: 429,
  INTERNAL: 500,
  GITHUB_ERROR: 502,
  GITHUB_AUTH: 502,
  GITHUB_RATE_LIMITED: 503,
  GITHUB_UNAVAILABLE: 503,
  NOT_CONFIGURED: 503,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;

const REASON_BY_CODE: Record<ErrorCode, Reason> = {
  BAD_REQUEST: 'invalid-request',
  INVALID_JSON: 'invalid-request',
  UNKNOWN_FIELDS: 'invalid-request',
  EMPTY_TERM: 'empty-term',
  UNAUTHENTICATED: 'signed-out',
  INVALID_SIGNATURE: 'invalid-request',
  FORBIDDEN: 'invalid-request',
  ORIGIN_NOT_ALLOWED: 'origin-not-allowed',
  REPO_NOT_ALLOWED: 'repo-not-allowed',
  NOT_FOUND: 'invalid-request',
  REPO_NOT_FOUND: 'repo-not-found',
  DISCUSSION_NOT_FOUND: 'discussion-not-found',
  PAYLOAD_TOO_LARGE: 'invalid-request',
  UNSUPPORTED_MEDIA_TYPE: 'invalid-request',
  CATEGORY_MISMATCH: 'category-mismatch',
  VALIDATION_FAILED: 'invalid-request',
  RATE_LIMITED: 'rate-limited',
  INTERNAL: 'internal',
  GITHUB_ERROR: 'github-unavailable',
  GITHUB_AUTH: 'github-unavailable',
  GITHUB_RATE_LIMITED: 'rate-limited',
  GITHUB_UNAVAILABLE: 'github-unavailable',
  NOT_CONFIGURED: 'github-unavailable',
};

export const reasonOf = (code: ErrorCode): Reason => REASON_BY_CODE[code];

type ErrorStatus = (typeof ERROR_STATUS)[ErrorCode];

export class AppError extends Error {
  readonly status: ErrorStatus;

  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
    readonly retryAfter?: number,
    /** Logged, never sent to the browser (e.g. GitHub's own error text). */
    readonly internal?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
    this.status = ERROR_STATUS[code];
  }
}

export interface ErrorBody {
  error: { code: ErrorCode; reason: Reason; message: string; details?: Record<string, unknown> };
  requestId: string;
}

export function requestIdOf(request: Request): string {
  return request.headers.get('cf-ray') ?? crypto.randomUUID();
}

export function errorResponse(c: Context, error: AppError): Response {
  const body: ErrorBody = {
    error: { code: error.code, reason: reasonOf(error.code), message: error.message, ...(error.details ? { details: error.details } : {}) },
    requestId: requestIdOf(c.req.raw),
  };
  if (error.retryAfter !== undefined) c.header('Retry-After', String(error.retryAfter));
  return c.json(body, error.status);
}

/** Hono onError: AppErrors keep their status; anything else is a logged 500 that leaks no internals. */
export function handleError(error: Error, c: Context): Response {
  if (error instanceof AppError) {
    if (error.status >= 500) log('error', c, { code: error.code, message: error.message, details: error.details, internal: error.internal });
    // Configuration problems name settings and values: logged for maintainers, never sent to callers.
    if (error.code === 'NOT_CONFIGURED') return errorResponse(c, new AppError('NOT_CONFIGURED', 'Comments are not available right now.'));
    return errorResponse(c, error);
  }
  log('error', c, { code: 'INTERNAL', name: error.name, message: error.message });
  return errorResponse(c, new AppError('INTERNAL', 'Something went wrong on our side. Please try again later.'));
}

export function handleNotFound(c: Context): Response {
  return errorResponse(c, new AppError('NOT_FOUND', `No route for ${c.req.method} ${new URL(c.req.url).pathname}.`));
}

/** Default request body limit (issue #6); routes may pass a smaller or larger one. */
export const MAX_BODY_BYTES = 256 * 1024;

/** Parse a JSON body; too large is a 413, malformed or non-object JSON a 400, never a 500. */
export async function readJsonObject(request: Request, maxBytes = MAX_BODY_BYTES): Promise<Record<string, unknown>> {
  const type = request.headers.get('content-type') ?? '';
  if (!type.toLowerCase().startsWith('application/json')) {
    throw new AppError('UNSUPPORTED_MEDIA_TYPE', 'Send the body as application/json.');
  }
  const tooLarge = () => new AppError('PAYLOAD_TOO_LARGE', `The request body is larger than ${Math.round(maxBytes / 1024)} KB.`);
  if (Number(request.headers.get('content-length') ?? 0) > maxBytes) throw tooLarge();
  // Read as a stream and stop as soon as the limit is passed, whatever Content-Length claimed.
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (request.body) {
    const reader = request.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw tooLarge();
      }
      chunks.push(value);
    }
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new AppError('INVALID_JSON', 'The request body is not valid JSON.');
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new AppError('INVALID_JSON', 'The request body must be a JSON object.');
  }
  return value as Record<string, unknown>;
}

/**
 * Map a failed GitHub API response to an AppError without assuming its body is JSON.
 * 401 / bad credentials → GITHUB_AUTH; rate limits → GITHUB_UNAVAILABLE with Retry-After; others → GITHUB_ERROR.
 */
export async function gitHubError(response: Response, operation: string): Promise<AppError> {
  const text = await response.text().catch(() => '');
  let githubMessage = text.slice(0, 300);
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && 'message' in parsed && typeof parsed.message === 'string') {
      githubMessage = parsed.message;
    }
  } catch {
    // Non-JSON error bodies (HTML error pages, plain text) are reported as text.
  }
  const details = { operation, githubStatus: response.status };
  const internal = { githubMessage };
  const remaining = response.headers.get('x-ratelimit-remaining');
  const retryAfterHeader = response.headers.get('retry-after');
  const rateLimited =
    response.status === 429 ||
    (response.status === 403 && (remaining === '0' || retryAfterHeader !== null || /rate limit/i.test(githubMessage)));

  if (rateLimited) {
    const reset = Number(response.headers.get('x-ratelimit-reset'));
    const retryAfter = retryAfterHeader !== null
      ? Number(retryAfterHeader)
      : Number.isFinite(reset) && reset > 0 ? Math.max(1, reset - Math.floor(Date.now() / 1000)) : 60;
    return new AppError('GITHUB_RATE_LIMITED', 'Comments are temporarily unavailable. Please try again later.', details, retryAfter, internal);
  }
  if (response.status === 401) {
    return new AppError('GITHUB_AUTH', 'The service could not authenticate with GitHub.', details, undefined, internal);
  }
  if (response.status >= 500) {
    return new AppError('GITHUB_UNAVAILABLE', 'GitHub is unavailable right now. Please try again later.', details, 30, internal);
  }
  return new AppError('GITHUB_ERROR', `GitHub rejected the request (${operation}).`, details, undefined, internal);
}

type LogLevel = 'info' | 'warn' | 'error';

/** Structured log line for Workers Logs. Never pass tokens, e-mails or request bodies. */
export function log(level: LogLevel, c: Context, fields: Record<string, unknown>): void {
  const line = JSON.stringify({
    level,
    requestId: requestIdOf(c.req.raw),
    route: `${c.req.method} ${new URL(c.req.url).pathname}`,
    ...fields,
  });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}
