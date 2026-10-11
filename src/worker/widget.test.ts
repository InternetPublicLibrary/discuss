import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import type { Env } from './env';
import { app } from './index';

const assets = { fetch: async () => new Response('<!doctype html><main id="discuss"></main>', { headers: { 'content-type': 'text/html' } }) } as unknown as Fetcher;
const request = (vars: Partial<Env> = {}) => app.request('https://discuss.example/widget?repo=o/r&term=x', {}, { ...env, ASSETS: assets, ...vars });

describe('GET /widget (#7)', () => {
  it('serves the widget with a strict CSP that needs no unsafe sources', async () => {
    const response = await request();
    const csp = response.headers.get('content-security-policy') ?? '';

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('id="discuss"');
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("style-src 'self'");
    expect(csp).toContain("default-src 'none'");
    expect(csp).not.toMatch(/unsafe-(inline|eval)/);
  });

  it('lets only IPL origins frame it', async () => {
    expect((await request()).headers.get('content-security-policy')).toContain('frame-ancestors http://localhost:4000');
    expect((await request({ IPL_ORIGIN_PATTERNS: 'https://*.ipl-preview.pages.dev' })).headers.get('content-security-policy')).toContain(
      'frame-ancestors http://localhost:4000 https://*.ipl-preview.pages.dev',
    );
  });

  it('can be embedded by pages with COEP and is kept out of search indexes', async () => {
    const response = await request();

    expect(response.headers.get('cross-origin-resource-policy')).toBe('cross-origin');
    expect(response.headers.get('cross-origin-embedder-policy')).toBe('credentialless');
    expect(response.headers.get('x-robots-tag')).toBe('noindex');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
  });
});
