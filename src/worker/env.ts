/** Bindings, variables and secrets available to the Worker (wrangler.jsonc + `wrangler secret put`). */
export interface Env {
  ENVIRONMENT: 'development' | 'staging' | 'production';
  /** Static assets of the widget (dist/widget). */
  ASSETS: Fetcher;
  /** KV: GitHub tokens, caches, sessions. */
  DISCUSS_KV: KVNamespace;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- augments the Workers runtime's global namespace
  namespace Cloudflare {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface Env extends AppEnv {}
  }
}

type AppEnv = Env;
