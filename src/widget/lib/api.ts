import type { Reason } from '../../shared/reasons';

/** An API error as the widget sees it: HTTP status plus the stable reason (issue #23). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly reason: Reason,
    message: string,
    readonly retryAfter?: number,
  ) {
    super(message);
  }
}

export async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { credentials: 'same-origin', ...init });
  } catch {
    throw new ApiError(0, 'github-unavailable', 'Network error');
  }
  const body = (await response.json().catch(() => ({}))) as { error?: { reason?: Reason; message?: string } };
  if (!response.ok) {
    const retryAfter = Number(response.headers.get('retry-after'));
    throw new ApiError(response.status, body.error?.reason ?? 'internal', body.error?.message ?? response.statusText, Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined);
  }
  return body as T;
}
