import { Hono } from 'hono';
import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { REASONS } from '../shared/reasons';
import { AppError, ERROR_STATUS, type ErrorCode, gitHubError, handleError, reasonOf } from './errors';
import { app } from './index';

function probe() {
  const hono = new Hono();
  hono.onError(handleError);
  hono.get('/throw/:code', (c) => {
    throw new AppError(c.req.param('code') as ErrorCode, 'probe');
  });
  hono.get('/github', async () => {
    throw await gitHubError(Response.json({ message: 'Secret internal GitHub detail' }, { status: 422 }), 'create discussion');
  });
  return hono;
}

describe('error responses', () => {
  it.each(Object.entries(ERROR_STATUS))('%s answers %i with a documented reason', async (code, status) => {
    const response = await probe().request(`/throw/${code}`);
    const body = (await response.json()) as { error: { code: string; reason: string } };

    expect(response.status).toBe(status);
    expect(body.error.code).toBe(code);
    expect(REASONS).toContain(body.error.reason);
  });

  it.each([
    ['EMPTY_TERM', 'empty-term'],
    ['REPO_NOT_FOUND', 'repo-not-found'],
    ['CATEGORY_MISMATCH', 'category-mismatch'],
    ['ORIGIN_NOT_ALLOWED', 'origin-not-allowed'],
    ['GITHUB_RATE_LIMITED', 'rate-limited'],
    ['GITHUB_UNAVAILABLE', 'github-unavailable'],
    ['UNAUTHENTICATED', 'signed-out'],
  ] as const)('maps %s to %s (#23)', (code, reason) => {
    expect(reasonOf(code)).toBe(reason);
  });

  it('never sends GitHub’s own error text to the browser (#23)', async () => {
    const response = await probe().request('/github');
    const text = await response.text();

    expect(response.status).toBe(502);
    expect(text).toContain('"reason":"github-unavailable"');
    expect(text).not.toContain('Secret internal GitHub detail');
  });

  it('answers unknown API routes with the same shape', async () => {
    const response = await app.request('/api/nowhere', {}, env);

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: 'NOT_FOUND', reason: 'invalid-request' } });
  });
});
