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
  /** One Durable Object per page mapping: serialises find-or-create of its discussion (#10). */
  DISCUSSION_LOCK: DurableObjectNamespace<import('./discussions/find-or-create').DiscussionLock>;
  /** Comma-separated logins whose discussions also count as a page's (e.g. `giscus[bot]` for older threads) (var). */
  TRUSTED_DISCUSSION_AUTHORS?: string;
  /** ISO date: TRUSTED_DISCUSSION_AUTHORS count only for discussions created before it; unset = never (var). */
  LEGACY_DISCUSSIONS_BEFORE?: string;
  /** OAuth credentials of the IPL GitHub App, for readers' user-to-server tokens (secrets). */
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  /** ORCID API client for the environment's registry (secrets). */
  ORCID_CLIENT_ID?: string;
  ORCID_CLIENT_SECRET?: string;
  /** "production" uses orcid.org (production Worker only); anything else the sandbox (var). */
  ORCID_ENVIRONMENT?: string;
  /** 32+ random characters: seals readers' GitHub tokens in KV (secret). */
  SESSION_SECRET?: string;
  /** Session lifetime in days (var; default 30, at most 90). */
  SESSION_TTL_DAYS?: string;
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
