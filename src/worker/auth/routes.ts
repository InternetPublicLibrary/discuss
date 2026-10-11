import { type Context, Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { Env } from '../env';
import { AppError, readJsonObject } from '../errors';
import { seal, unseal } from './crypto';
import { githubProvider } from './github';
import { type IdentityProvider, PROVIDERS, type ProviderDeps, type ProviderId, type SignInResult } from './identity';
import { orcidProvider } from './orcid';
import { codeChallenge, randomToken } from './pkce';
import { assertWidgetWrite, createSession, destroySession, readSession, requireSession, timingSafeEqual } from './sessions';

/**
 * Sign-in in a popup (issues #6, #17). The widget opens /api/oauth/:provider/start?nonce=… in a popup; the callback
 * hands a one-time ticket to /oauth/done.html (in the fragment, never logged), which posts it to the widget that opened
 * it; the widget exchanges ticket + nonce for a partitioned session cookie. The nonce never leaves the widget until the
 * exchange, so a ticket from someone else's sign-in cannot log the reader in (login CSRF).
 */
const STATE_COOKIE = '__Host-discuss_state';
const STATE_TTL_S = 600;
const TICKET_TTL_S = 60;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

interface PendingSignIn {
  provider: ProviderId;
  verifier: string;
  nonce: string;
}

type AppContext = Context<{ Bindings: Env }>;

export const orcidBaseUrl = (env: Env) => (env.ORCID_ENVIRONMENT === 'production' && env.ENVIRONMENT === 'production' ? 'https://orcid.org' : 'https://sandbox.orcid.org');

function provider(env: Env, id: string, fetcher: typeof fetch): IdentityProvider {
  if (!(PROVIDERS as readonly string[]).includes(id)) throw new AppError('NOT_FOUND', `Unknown sign-in provider: ${id}.`);
  const deps: ProviderDeps =
    id === 'github'
      ? { clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET, orcidBaseUrl: orcidBaseUrl(env), fetch: fetcher }
      : { clientId: env.ORCID_CLIENT_ID, clientSecret: env.ORCID_CLIENT_SECRET, orcidBaseUrl: orcidBaseUrl(env), fetch: fetcher };
  return id === 'github' ? githubProvider(deps) : orcidProvider(deps);
}

const callbackUrl = (c: AppContext, id: string) => `${new URL(c.req.url).origin}/api/oauth/${id}/callback`;
const done = (c: AppContext, fragment: Record<string, string>) => c.redirect(`/oauth/done.html#${new URLSearchParams(fragment)}`, 302);

export function authRoutes(fetcher: typeof fetch = (input, init) => fetch(input, init)) {
  const routes = new Hono<{ Bindings: Env }>();

  routes.get('/oauth/:provider/start', async (c) => {
    const nonce = c.req.query('nonce') ?? '';
    if (!TOKEN.test(nonce)) throw new AppError('BAD_REQUEST', 'Sign-in must be started from the comment widget.');
    const selected = provider(c.env, c.req.param('provider'), fetcher);
    const state = randomToken();
    const verifier = randomToken();
    const pending: PendingSignIn = { provider: selected.id, verifier, nonce };
    await c.env.DISCUSS_KV.put(`oauth:${state}`, JSON.stringify(pending), { expirationTtl: STATE_TTL_S });
    setCookie(c, STATE_COOKIE, state, { httpOnly: true, secure: true, sameSite: 'Lax', path: '/', maxAge: STATE_TTL_S });
    return c.redirect(selected.authorizeUrl({ state, codeChallenge: await codeChallenge(verifier), redirectUri: callbackUrl(c, selected.id) }), 302);
  });

  routes.get('/oauth/:provider/callback', async (c) => {
    const id = c.req.param('provider');
    const state = c.req.query('state') ?? '';
    const expected = getCookie(c, STATE_COOKIE) ?? '';
    deleteCookie(c, STATE_COOKIE, { httpOnly: true, secure: true, sameSite: 'Lax', path: '/' });
    const pending = TOKEN.test(state) ? await c.env.DISCUSS_KV.get<PendingSignIn>(`oauth:${state}`, 'json') : null;
    if (TOKEN.test(state)) await c.env.DISCUSS_KV.delete(`oauth:${state}`);
    if (!pending || pending.provider !== id || !expected || !timingSafeEqual(expected, state)) return done(c, { error: 'expired' });

    const code = c.req.query('code');
    if (!code) return done(c, { error: 'cancelled' });
    let result: SignInResult;
    try {
      result = await provider(c.env, id, fetcher).signIn({ code, codeVerifier: pending.verifier, redirectUri: callbackUrl(c, id) });
    } catch {
      return done(c, { error: 'failed' });
    }
    const ticket = randomToken();
    await c.env.DISCUSS_KV.put(`ticket:${ticket}`, JSON.stringify({ nonce: pending.nonce, result: await seal(c.env.SESSION_SECRET, result) }), { expirationTtl: TICKET_TTL_S });
    return done(c, { ticket });
  });

  routes.post('/session/exchange', async (c) => {
    if (c.req.header('origin') !== new URL(c.req.url).origin) throw new AppError('ORIGIN_NOT_ALLOWED', 'Sign-in must be completed by the comment widget.');
    const { ticket, nonce } = await readJsonObject(c.req.raw, 1024);
    if (typeof ticket !== 'string' || typeof nonce !== 'string' || !TOKEN.test(ticket) || !TOKEN.test(nonce)) throw new AppError('BAD_REQUEST', 'Invalid sign-in ticket.');
    const stored = await c.env.DISCUSS_KV.get<{ nonce: string; result: string }>(`ticket:${ticket}`, 'json');
    await c.env.DISCUSS_KV.delete(`ticket:${ticket}`);
    if (!stored || !timingSafeEqual(stored.nonce, nonce)) throw new AppError('UNAUTHENTICATED', 'The sign-in could not be completed. Please try again.');
    const result = await unseal<SignInResult>(c.env.SESSION_SECRET, stored.result);
    if (!result) throw new AppError('UNAUTHENTICATED', 'The sign-in could not be completed. Please try again.');
    const session = await createSession(c, result);
    return c.json({ identity: session.identity, csrfToken: session.csrfToken });
  });

  routes.get('/session', async (c) => {
    const { session } = await requireSession(c);
    return c.json({ identity: session.identity, csrfToken: session.csrfToken });
  });

  routes.post('/session/logout', async (c) => {
    const found = await readSession(c);
    if (!found) throw new AppError('UNAUTHENTICATED', 'You are not signed in.');
    assertWidgetWrite(c, found.session);
    await destroySession(c);
    return c.body(null, 204);
  });

  return routes;
}
