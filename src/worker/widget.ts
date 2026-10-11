import type { Context } from 'hono';
import { loadAllowLists } from './config';
import type { Env } from './env';

/**
 * Security headers of the widget document (issue #7). The widget has no inline scripts or styles, so no
 * 'unsafe-*' source is needed; only IPL origins may frame it.
 */
export function widgetHeaders(env: Env): Record<string, string> {
  const lists = loadAllowLists(env);
  const ancestors = [...lists.origins, ...(env.IPL_ORIGIN_PATTERNS ?? '').split(',').map((pattern) => pattern.trim()).filter(Boolean)].join(' ');
  const csp = [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data: https://avatars.githubusercontent.com https://*.githubusercontent.com https://github.githubassets.com",
    "connect-src 'self'",
    "font-src 'self'",
    "base-uri 'none'",
    "form-action 'self'",
    "object-src 'none'",
    `frame-ancestors ${ancestors}`,
  ].join('; ');
  return {
    'Content-Security-Policy': csp,
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'Cross-Origin-Embedder-Policy': 'credentialless',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Content-Type-Options': 'nosniff',
    'X-Robots-Tag': 'noindex',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  };
}

/** GET /widget: the built index.html with the headers above. */
export async function serveWidget(c: Context<{ Bindings: Env }>): Promise<Response> {
  const asset = await c.env.ASSETS.fetch(new Request(new URL('/index.html', c.req.url)));
  // Only the built HTML document is ever returned from here, never a redirect or another asset's headers.
  if (asset.status !== 200 || !(asset.headers.get('content-type') ?? '').includes('text/html')) {
    return c.text('The widget is not available.', 503);
  }
  const response = new Response(asset.body, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  for (const [name, value] of Object.entries(widgetHeaders(c.env))) response.headers.set(name, value);
  response.headers.set('Cache-Control', 'no-cache');
  return response;
}
