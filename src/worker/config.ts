import type { Context, MiddlewareHandler } from 'hono';
import type { Env } from './env';
import { AppError } from './errors';

/**
 * Origin and repository allow-lists (issue #8). Upstream accepted any origin when none was configured, compiled
 * origin patterns without anchors and fell back to the first origin for CORS; here everything is exact or anchored
 * and denies by default.
 */
export interface AllowLists {
  origins: string[];
  patterns: RegExp[];
  repositories: string[];
}

/** `https://*.example.org` → one DNS label in place of `*`, anchored at both ends. */
export function compileOriginPattern(pattern: string): RegExp {
  if (!/^https:\/\/(\*\.)?[a-z0-9.-]+(:\d+)?$/i.test(pattern)) throw new AppError('NOT_CONFIGURED', `Invalid origin pattern: ${pattern}`);
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace('\\*', '*').replace('*', '[a-z0-9-]+');
  return new RegExp(`^${escaped}$`, 'i');
}

const list = (value: string | undefined) => (value ?? '').split(',').map((item) => item.trim()).filter(Boolean);

export function loadAllowLists(env: Env): AllowLists {
  const origins = list(env.IPL_ALLOWED_ORIGINS);
  for (const origin of origins) {
    let url: URL | undefined;
    try {
      url = new URL(origin);
    } catch {
      url = undefined;
    }
    const local = url?.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname) && env.ENVIRONMENT === 'development';
    if (!url || url.origin !== origin || (url.protocol !== 'https:' && !local)) {
      throw new AppError('NOT_CONFIGURED', `IPL_ALLOWED_ORIGINS must list exact https origins: ${origin}`);
    }
  }
  const repositories = list(env.ALLOWED_REPOSITORIES).map((repo) => repo.toLowerCase());
  if (repositories.some((repo) => !/^[a-z0-9-]+\/[a-z0-9._-]+$/.test(repo))) throw new AppError('NOT_CONFIGURED', 'ALLOWED_REPOSITORIES must list owner/repo names.');
  if (!origins.length || !repositories.length) throw new AppError('NOT_CONFIGURED', 'IPL_ALLOWED_ORIGINS and ALLOWED_REPOSITORIES must be set.');
  return { origins, patterns: list(env.IPL_ORIGIN_PATTERNS).map(compileOriginPattern), repositories };
}

export function isAllowedOrigin(origin: string | null | undefined, lists: AllowLists): origin is string {
  if (!origin) return false;
  return lists.origins.includes(origin) || lists.patterns.some((pattern) => pattern.test(origin));
}

/** The bot may only touch IPL repositories, never another repository where the App happens to be installed. */
export function assertRepositoryAllowed(repo: unknown, lists: AllowLists): string {
  const name = typeof repo === 'string' ? repo.trim() : '';
  if (!name) throw new AppError('BAD_REQUEST', 'repo is required.');
  if (!lists.repositories.includes(name.toLowerCase())) throw new AppError('REPO_NOT_ALLOWED', 'This repository is not served by IPL discuss.', { repo: name });
  return name;
}

/** Routes called by GitHub itself (webhook, OAuth callbacks), not by IPL pages or the widget. */
const SERVER_TO_SERVER = [/^\/api\/webhook$/, /^\/api\/oauth\/[^/]+\/callback$/];

/**
 * Every other /api/* request must come from the widget (this origin) or an allowed IPL origin; CORS headers are sent
 * only for allowed IPL origins and never fall back to another origin.
 */
export function originGuard(): MiddlewareHandler<{ Bindings: Env }> {
  return async (c: Context<{ Bindings: Env }>, next) => {
    const path = new URL(c.req.url).pathname;
    if (SERVER_TO_SERVER.some((pattern) => pattern.test(path))) return next();

    const lists = loadAllowLists(c.env);
    const origin = c.req.header('origin');
    const self = new URL(c.req.url).origin;
    const fromSite = isAllowedOrigin(origin, lists);
    // Browsers always send Origin on cross-origin and on non-GET requests; a missing Origin is a same-origin GET.
    const allowed = origin === undefined ? c.req.method === 'GET' || c.req.method === 'HEAD' : origin === self || fromSite;
    if (!allowed) throw new AppError('ORIGIN_NOT_ALLOWED', 'This page is not allowed to use IPL discuss.', { origin: origin ?? null });

    if (fromSite) {
      c.header('Access-Control-Allow-Origin', origin);
      c.header('Access-Control-Allow-Credentials', 'true');
      c.header('Vary', 'Origin');
      if (c.req.method === 'OPTIONS') {
        c.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE');
        c.header('Access-Control-Allow-Headers', 'content-type, x-csrf-token');
        c.header('Access-Control-Max-Age', '600');
        return c.body(null, 204);
      }
    }
    return next();
  };
}
