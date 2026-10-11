import { env } from 'cloudflare:workers';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import type { Env } from '../env';
import { handleError } from '../errors';
import { FakeGitHub } from '../test/fake-github';
import { seal, unseal } from './crypto';
import { randomToken } from './pkce';
import { authRoutes } from './routes';
import { githubToken, readSession, SESSION_COOKIE } from './sessions';

const SELF = 'https://discuss.example';
const vars: Partial<Env> = {
  GITHUB_CLIENT_ID: 'Iv1.app',
  GITHUB_CLIENT_SECRET: 'secret',
  ORCID_CLIENT_ID: 'APP-1',
  ORCID_CLIENT_SECRET: 'orcid-secret',
  SESSION_SECRET: 'x'.repeat(40),
};

function providers() {
  return new FakeGitHub()
    .on('POST', /^\/login\/oauth\/access_token$/, (call) =>
      Response.json(String(call.body).includes('code=good')
        ? { access_token: 'ghu_reader_token', expires_in: 28800, refresh_token: 'ghr_refresh', refresh_token_expires_in: 15_897_600 }
        : String(call.body).includes('grant_type=refresh_token') ? { access_token: 'ghu_renewed', expires_in: 28800, refresh_token: 'ghr_next' } : { error: 'bad_verification_code' }),
    )
    .on('GET', /^\/user$/, { id: 583231, login: 'octocat', name: 'The Octocat', avatar_url: 'https://avatars.githubusercontent.com/u/583231' })
    .on('POST', /^\/oauth\/token$/, { access_token: 'orcid-token', orcid: '0000-0002-1825-0097', name: 'Josiah Carberry' });
}

/** Token requests are form-encoded; record them as text. */
const textBodies = (fake: FakeGitHub): typeof fetch => async (input, init) =>
  fake.fetch(input, { ...init, ...(init?.body instanceof URLSearchParams ? { body: JSON.stringify(init.body.toString()) } : {}) });

function setup(fake = providers()) {
  const app = new Hono<{ Bindings: Env }>();
  app.onError(handleError);
  app.route('/api', authRoutes(textBodies(fake)));
  app.get('/api/probe-token', async (c) => {
    const found = await readSession(c);
    return c.text(found ? await githubToken(c, found, textBodies(fake)) : 'none');
  });
  return { fake, request: (path: string, init: RequestInit = {}) => app.request(`${SELF}${path}`, init, { ...env, ...vars }) };
}

const setCookies = (response: Response) => response.headers.getSetCookie();
const cookieValue = (response: Response, name: string) => (setCookies(response).find((value) => value.startsWith(`${name}=`) && !value.startsWith(`${name}=;`)) ?? '').split(';')[0] ?? '';
const fragment = (response: Response) => new URLSearchParams(new URL(response.headers.get('location') ?? '', SELF).hash.slice(1));

async function signIn(request: ReturnType<typeof setup>['request'], provider = 'github', code = 'good') {
  const nonce = randomToken();
  const start = await request(`/api/oauth/${provider}/start?nonce=${nonce}`);
  const state = new URL(start.headers.get('location') ?? '').searchParams.get('state') ?? '';
  const callback = await request(`/api/oauth/${provider}/callback?code=${code}&state=${state}`, { headers: { cookie: cookieValue(start, '__Host-discuss_state') } });
  return { nonce, start, callback, ticket: fragment(callback).get('ticket') ?? '' };
}

const exchange = (request: ReturnType<typeof setup>['request'], ticket: string, nonce: string, origin = SELF) =>
  request('/api/session/exchange', { method: 'POST', body: JSON.stringify({ ticket, nonce }), headers: { 'content-type': 'application/json', origin } });

describe('popup sign-in (#6, #17)', () => {
  it('ends in a partitioned session cookie with no token anywhere in URLs or responses', async () => {
    const { request } = setup();
    const { nonce, callback, ticket } = await signIn(request);
    const session = await exchange(request, ticket, nonce);
    const body = await session.text();

    expect(callback.headers.get('location')).toMatch(/^\/oauth\/done\.html#ticket=[A-Za-z0-9_-]{43}$/);
    expect(callback.headers.get('location')).not.toContain('ghu_');
    expect(JSON.parse(body)).toEqual({
      identity: { provider: 'github', id: '583231', login: 'octocat', name: 'The Octocat', profileUrl: 'https://github.com/octocat', avatarUrl: 'https://avatars.githubusercontent.com/u/583231' },
      csrfToken: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
    });
    expect(body).not.toContain('ghu_');
    const cookie = setCookies(session).find((value) => value.startsWith(`${SESSION_COOKIE}=`)) ?? '';
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/Secure/);
    expect(cookie).toMatch(/SameSite=None/);
    expect(cookie).toMatch(/Partitioned/);
    expect(cookie).toMatch(/Max-Age=2592000/);
  });

  it('keeps the GitHub token sealed in KV, not in plain text', async () => {
    const { request } = setup();
    const { nonce, ticket } = await signIn(request);
    const session = await exchange(request, ticket, nonce);
    const id = cookieValue(session, SESSION_COOKIE).split('=')[1] ?? '';

    expect(await env.DISCUSS_KV.get(`session:${id}`)).not.toContain('ghu_reader_token');
    expect(await (await request('/api/probe-token', { headers: { cookie: cookieValue(session, SESSION_COOKIE) } })).text()).toBe('ghu_reader_token');
  });

  it('refuses a ticket without the nonce of the widget that started the sign-in (login CSRF)', async () => {
    const { request } = setup();
    const { ticket } = await signIn(request);

    expect((await exchange(request, ticket, randomToken())).status).toBe(401);
  });

  it('uses each ticket once', async () => {
    const { request } = setup();
    const { nonce, ticket } = await signIn(request);
    await exchange(request, ticket, nonce);

    expect((await exchange(request, ticket, nonce)).status).toBe(401);
  });

  it('accepts the exchange only from the widget origin', async () => {
    const { request } = setup();
    const { nonce, ticket } = await signIn(request);

    expect((await exchange(request, ticket, nonce, 'https://evil.example')).status).toBe(403);
  });

  it('sends a callback without the browser’s state cookie to an error, not a ticket', async () => {
    const { request } = setup();
    const nonce = randomToken();
    const start = await request(`/api/oauth/github/start?nonce=${nonce}`);
    const state = new URL(start.headers.get('location') ?? '').searchParams.get('state') ?? '';
    const callback = await request(`/api/oauth/github/callback?code=good&state=${state}`);

    expect(fragment(callback).get('error')).toBe('expired');
  });

  it('reports a refused code and a cancelled sign-in to the popup page', async () => {
    const { request } = setup();

    expect(fragment((await signIn(request, 'github', 'bad')).callback).get('error')).toBe('failed');
  });

  it('requires a nonce to start', async () => {
    const { request } = setup();

    expect((await request('/api/oauth/github/start')).status).toBe(400);
  });

  it('signs in with ORCID (sandbox) without a GitHub token', async () => {
    const { request } = setup();
    const { nonce, start, ticket } = await signIn(request, 'orcid');
    const session = await exchange(request, ticket, nonce);

    expect(start.headers.get('location')).toMatch(/^https:\/\/sandbox\.orcid\.org\/oauth\/authorize\?/);
    expect(await session.json()).toMatchObject({ identity: { provider: 'orcid', id: '0000-0002-1825-0097', name: 'Josiah Carberry' } });
  });
});

describe('session lifecycle', () => {
  async function signedIn() {
    const context = setup();
    const { nonce, ticket } = await signIn(context.request);
    const response = await exchange(context.request, ticket, nonce);
    const { csrfToken } = (await response.json()) as { csrfToken: string };
    return { ...context, cookie: cookieValue(response, SESSION_COOKIE), csrfToken };
  }

  it('returns the identity, and 401 without a session', async () => {
    const { request, cookie } = await signedIn();

    expect(await (await request('/api/session', { headers: { cookie } })).json()).toMatchObject({ identity: { login: 'octocat' } });
    expect((await request('/api/session')).status).toBe(401);
  });

  it('signs out server-side: the old session id is rejected afterwards', async () => {
    const { request, cookie, csrfToken } = await signedIn();
    const logout = await request('/api/session/logout', { method: 'POST', headers: { cookie, origin: SELF, 'x-csrf-token': csrfToken } });

    expect(logout.status).toBe(204);
    expect((await request('/api/session', { headers: { cookie } })).status).toBe(401);
  });

  it('refuses sign-out without the CSRF token', async () => {
    const { request, cookie } = await signedIn();

    expect((await request('/api/session/logout', { method: 'POST', headers: { cookie, origin: SELF } })).status).toBe(403);
  });

  it('renews an expired GitHub token with the refresh token', async () => {
    const { request, cookie } = await signedIn();
    const id = cookie.split('=')[1] ?? '';
    const stored = (await env.DISCUSS_KV.get<{ github: string }>(`session:${id}`, 'json')) as { github: string };
    const tokens = (await unseal<Record<string, unknown>>(vars.SESSION_SECRET, stored.github)) ?? {};
    await env.DISCUSS_KV.put(`session:${id}`, JSON.stringify({ ...stored, github: await seal(vars.SESSION_SECRET, { ...tokens, expiresAt: Date.now() - 1000 }) }));

    expect(await (await request('/api/probe-token', { headers: { cookie } })).text()).toBe('ghu_renewed');
  });
});

describe('token sealing', () => {
  it('round-trips and fails closed with another secret', async () => {
    const sealed = await seal('a'.repeat(40), { accessToken: 'ghu_x' });

    expect(await unseal('a'.repeat(40), sealed)).toEqual({ accessToken: 'ghu_x' });
    expect(await unseal('b'.repeat(40), sealed)).toBeNull();
    await expect(seal('short', {})).rejects.toMatchObject({ code: 'NOT_CONFIGURED' });
  });
});
