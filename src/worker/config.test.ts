import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import type { Env } from './env';
import { assertRepositoryAllowed, compileOriginPattern, isAllowedOrigin, loadAllowLists } from './config';
import { app } from './index';

const lists = (vars: Partial<Env> = {}) =>
  loadAllowLists({ ...env, ENVIRONMENT: 'production', IPL_ALLOWED_ORIGINS: 'https://ipl.example', ALLOWED_REPOSITORIES: 'InternetPublicLibrary/en-US,InternetPublicLibrary/pt-BR', ...vars } as Env);

describe('origin allow-list', () => {
  it('matches exact origins only', () => {
    const allowed = lists();

    expect(isAllowedOrigin('https://ipl.example', allowed)).toBe(true);
    expect(isAllowedOrigin('https://ipl.example.attacker.net', allowed)).toBe(false);
    expect(isAllowedOrigin('https://evil.ipl.example', allowed)).toBe(false);
    expect(isAllowedOrigin('http://ipl.example', allowed)).toBe(false);
    expect(isAllowedOrigin(undefined, allowed)).toBe(false);
  });

  it('anchors patterns: one label in place of *, nothing before or after', () => {
    const allowed = lists({ IPL_ORIGIN_PATTERNS: 'https://*.ipl-preview.pages.dev' });

    expect(isAllowedOrigin('https://pr-12.ipl-preview.pages.dev', allowed)).toBe(true);
    expect(isAllowedOrigin('https://a.b.ipl-preview.pages.dev', allowed)).toBe(false);
    expect(isAllowedOrigin('https://pr-12.ipl-preview.pages.dev.attacker.net', allowed)).toBe(false);
    expect(isAllowedOrigin('https://attacker.net/?https://pr-12.ipl-preview.pages.dev', allowed)).toBe(false);
  });

  it.each(['ipl\\.example', 'https://ipl.example/*', 'http://*.example', '*'])('rejects the unsafe pattern %j', (pattern) => {
    expect(() => compileOriginPattern(pattern)).toThrow(expect.objectContaining({ code: 'NOT_CONFIGURED' }));
  });

  it('denies by default when nothing is configured', () => {
    expect(() => lists({ IPL_ALLOWED_ORIGINS: '' })).toThrow(expect.objectContaining({ code: 'NOT_CONFIGURED' }));
    expect(() => lists({ ALLOWED_REPOSITORIES: '' })).toThrow(expect.objectContaining({ code: 'NOT_CONFIGURED' }));
  });
});

describe('repository allow-list', () => {
  it('accepts IPL repositories case-insensitively and rejects others', () => {
    expect(assertRepositoryAllowed('internetpubliclibrary/PT-br', lists())).toBe('internetpubliclibrary/PT-br');
    expect(() => assertRepositoryAllowed('someone/blog', lists())).toThrow(expect.objectContaining({ code: 'REPO_NOT_ALLOWED', status: 403 }));
    expect(() => assertRepositoryAllowed('', lists())).toThrow(expect.objectContaining({ code: 'BAD_REQUEST' }));
  });
});

describe('origin guard on /api/*', () => {
  const call = (init: RequestInit) => app.request('https://discuss.example/api/health', init, env);

  it('answers a foreign origin with 403 origin-not-allowed', async () => {
    const response = await call({ headers: { origin: 'https://evil.example' } });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: 'ORIGIN_NOT_ALLOWED', reason: 'origin-not-allowed' } });
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('allows an IPL origin with credentialed CORS for that origin only', async () => {
    const response = await call({ headers: { origin: 'http://localhost:4000' } });

    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:4000');
    expect(response.headers.get('access-control-allow-credentials')).toBe('true');
  });

  it('allows the widget itself (same origin) without CORS headers', async () => {
    const response = await call({ headers: { origin: 'https://discuss.example' } });

    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('rejects a write without an Origin header', async () => {
    const response = await app.request('https://discuss.example/api/health', { method: 'POST' }, env);

    expect(response.status).toBe(403);
  });

  it('answers preflights from IPL origins', async () => {
    const response = await call({ method: 'OPTIONS', headers: { origin: 'http://localhost:4000', 'access-control-request-method': 'POST' } });

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-methods')).toContain('POST');
  });

  it('lets GitHub reach the webhook without an IPL origin', async () => {
    const response = await app.request('https://discuss.example/api/webhook', { method: 'POST', headers: { origin: 'https://github.com' } }, env);

    expect(response.status).not.toBe(403);
  });
});
