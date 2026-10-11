import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { Env } from '../env';
import { AppError } from '../errors';
import { seal, unseal } from './crypto';
import { refreshGitHubToken } from './github';
import type { GitHubTokens, Identity, SignInResult } from './identity';
import { randomToken } from './pkce';

/**
 * Sessions of the widget (issue #6). The id lives only in a cookie of the discuss origin inside the IPL page's
 * partition (`Partitioned`, CHIPS): no token in URLs, nothing readable by the host page's scripts, and the record —
 * with the reader's GitHub token sealed with SESSION_SECRET — stays in KV, revocable on sign-out.
 */
export const SESSION_COOKIE = '__Host-discuss_session';
const DEFAULT_TTL_DAYS = 30;

export interface Session {
  identity: Identity;
  csrfToken: string;
  /** Sealed GitHubTokens (GitHub sessions only). */
  github?: string;
  createdAt: string;
}

type AppContext = Context<{ Bindings: Env }>;
const sessionKey = (id: string) => `session:${id}`;

export function sessionTtlSeconds(env: Pick<Env, 'SESSION_TTL_DAYS'>): number {
  const days = Number(env.SESSION_TTL_DAYS);
  return Math.round((Number.isFinite(days) && days > 0 && days <= 90 ? days : DEFAULT_TTL_DAYS) * 24 * 60 * 60);
}

export async function createSession(c: AppContext, result: SignInResult): Promise<Session> {
  const previous = getCookie(c, SESSION_COOKIE);
  if (previous) await c.env.DISCUSS_KV.delete(sessionKey(previous));
  const id = randomToken();
  const ttl = sessionTtlSeconds(c.env);
  const session: Session = {
    identity: result.identity,
    csrfToken: randomToken(),
    ...(result.github ? { github: await seal(c.env.SESSION_SECRET, result.github) } : {}),
    createdAt: new Date().toISOString(),
  };
  await c.env.DISCUSS_KV.put(sessionKey(id), JSON.stringify(session), { expirationTtl: ttl });
  setCookie(c, SESSION_COOKIE, id, { httpOnly: true, secure: true, sameSite: 'None', partitioned: true, path: '/', maxAge: ttl });
  return session;
}

export async function readSession(c: AppContext): Promise<{ id: string; session: Session } | null> {
  const id = getCookie(c, SESSION_COOKIE);
  if (!id || !/^[A-Za-z0-9_-]{43}$/.test(id)) return null;
  const session = await c.env.DISCUSS_KV.get<Session>(sessionKey(id), 'json');
  return session ? { id, session } : null;
}

export async function requireSession(c: AppContext): Promise<{ id: string; session: Session }> {
  const found = await readSession(c);
  if (!found) throw new AppError('UNAUTHENTICATED', 'Sign in to comment.');
  return found;
}

export async function destroySession(c: AppContext): Promise<void> {
  const id = getCookie(c, SESSION_COOKIE);
  if (id) await c.env.DISCUSS_KV.delete(sessionKey(id));
  deleteCookie(c, SESSION_COOKIE, { httpOnly: true, secure: true, sameSite: 'None', partitioned: true, path: '/' });
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return difference === 0;
}

/** Writes come only from the widget itself (same origin) and carry the session's CSRF token. */
export function assertWidgetWrite(c: AppContext, session: Session): void {
  if (c.req.header('origin') !== new URL(c.req.url).origin) throw new AppError('ORIGIN_NOT_ALLOWED', 'Requests must come from the comment widget.');
  if (!timingSafeEqual(c.req.header('x-csrf-token') ?? '', session.csrfToken)) throw new AppError('FORBIDDEN', 'The CSRF token is missing or invalid.');
}

/**
 * The reader's GitHub token for a write, refreshed when it expired (GitHub App user tokens last 8 hours). A session
 * whose token cannot be renewed is signed out.
 */
export async function githubToken(c: AppContext, found: { id: string; session: Session }, fetcher: typeof fetch = (input, init) => fetch(input, init)): Promise<string> {
  if (!found.session.github) throw new AppError('UNAUTHENTICATED', 'Sign in with GitHub to do this.');
  const tokens = await unseal<GitHubTokens>(c.env.SESSION_SECRET, found.session.github);
  if (!tokens) throw new AppError('UNAUTHENTICATED', 'Your session has ended. Please sign in again.');
  if (!tokens.expiresAt || tokens.expiresAt - 60_000 > Date.now()) return tokens.accessToken;

  const renewed = tokens.refreshToken && (!tokens.refreshExpiresAt || tokens.refreshExpiresAt > Date.now())
    ? await refreshGitHubToken({ clientId: c.env.GITHUB_CLIENT_ID, clientSecret: c.env.GITHUB_CLIENT_SECRET, orcidBaseUrl: '', fetch: fetcher }, tokens.refreshToken)
    : null;
  if (!renewed) {
    await destroySession(c);
    throw new AppError('UNAUTHENTICATED', 'Your GitHub sign-in has expired. Please sign in again.');
  }
  const session: Session = { ...found.session, github: await seal(c.env.SESSION_SECRET, renewed) };
  await c.env.DISCUSS_KV.put(sessionKey(found.id), JSON.stringify(session), { expirationTtl: sessionTtlSeconds(c.env) });
  return renewed.accessToken;
}
