/** Bindings, variables and secrets available to the Worker (wrangler.jsonc + `wrangler secret put`). */
export interface Env {
  ENVIRONMENT: 'development' | 'staging' | 'production';
  /** Static assets of the widget (dist/widget). */
  ASSETS: Fetcher;
  /** KV: GitHub tokens, caches, sessions. */
  DISCUSS_KV: KVNamespace;
  /** Comma-separated exact origins of IPL sites (var). */
  IPL_ALLOWED_ORIGINS?: string;
  /** Optional comma-separated anchored patterns, one `*` label at most, e.g. `https://*.ipl-preview.pages.dev` (var). */
  IPL_ORIGIN_PATTERNS?: string;
  /** Comma-separated owner/repo names whose discussions the service serves (var). */
  ALLOWED_REPOSITORIES?: string;
  /** GitHub App id (var). */
  GITHUB_APP_ID?: string;
  /** Secret of the App webhook (secret). */
  GITHUB_WEBHOOK_SECRET?: string;
  /** GitHub App private key, PKCS#8 PEM (secret). */
  GITHUB_APP_PRIVATE_KEY?: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- augments the Workers runtime's global namespace
  namespace Cloudflare {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface Env extends AppEnv {}
  }
}

type AppEnv = Env;
