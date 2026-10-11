import { AppError, gitHubError } from '../errors';
import { createAppJwt, importAppPrivateKey } from './app-jwt';

export interface GitHubAppOptions {
  appId: string | undefined;
  privateKey: string | undefined;
  kv: KVNamespace;
  fetch?: typeof fetch;
  now?: () => number;
}

export interface RepositoryRef {
  owner: string;
  repo: string;
}

const API = 'https://api.github.com';
const TOKEN_MARGIN_MS = 5 * 60 * 1000;
const INSTALLATION_TTL_S = 24 * 60 * 60;

interface CachedToken {
  token: string;
  expiresAt: number;
}

/**
 * The IPL GitHub App: installation tokens are minted with a Web Crypto JWT and cached in KV (until 5 minutes before
 * expiry) plus a per-request memo, so a warm request spends GitHub calls only on the operation itself (#9). Readers'
 * own tokens are passed per call and stay server-side (spec 002). `calls` counts every request for budget tests.
 */
export class GitHubApp {
  calls = 0;
  private readonly fetcher: typeof fetch;
  private readonly now: () => number;
  private key: Promise<CryptoKey> | undefined;
  /** Per-request memo, so one contribution never mints more than one token even when KV cannot hold it. */
  private readonly tokens = new Map<number, CachedToken>();

  constructor(private readonly options: GitHubAppOptions) {
    this.fetcher = options.fetch ?? fetch.bind(globalThis);
    this.now = options.now ?? Date.now;
  }

  private async appJwt(): Promise<string> {
    if (!this.options.appId) throw new AppError('NOT_CONFIGURED', 'GITHUB_APP_ID is not set.');
    this.key ??= importAppPrivateKey(this.options.privateKey);
    return createAppJwt(this.options.appId, await this.key, Math.floor(this.now() / 1000));
  }

  private async send(method: string, path: string, authorization: string, body?: unknown): Promise<Response> {
    // The URL parser resolves `..` and `%2e%2e` segments; a path that changes when parsed could reach another
    // API endpoint with our token, so it is refused before anything is sent.
    const url = new URL(`${API}${path}`);
    const [rawPath = ''] = path.split('?');
    if (!path.startsWith('/') || url.origin !== API || url.pathname !== rawPath) {
      throw new AppError('INTERNAL', 'Refused to call GitHub with an unsafe path.', { path: rawPath });
    }
    this.calls += 1;
    return this.fetcher(url.toString(), {
      method,
      headers: {
        accept: 'application/vnd.github+json',
        authorization,
        'user-agent': 'ipl-contribute',
        'x-github-api-version': '2022-11-28',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  private async installationId({ owner, repo }: RepositoryRef): Promise<number> {
    const cacheKey = installationCacheKey({ owner, repo });
    const cached = await this.options.kv.get(cacheKey);
    if (cached) return Number(cached);

    const response = await this.send('GET', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/installation`, `Bearer ${await this.appJwt()}`);
    if (response.status === 404) {
      // Not installed, renamed or deleted: the embed points at a repository the service cannot use.
      throw new AppError('REPO_NOT_FOUND', `The IPL GitHub App is not installed on ${owner}/${repo}.`, { repository: `${owner}/${repo}` });
    }
    if (!response.ok) throw await gitHubError(response, 'get installation');
    const { id } = (await response.json()) as { id: number };
    await this.options.kv.put(cacheKey, String(id), { expirationTtl: INSTALLATION_TTL_S });
    return id;
  }

  private async installationToken(repository: RepositoryRef, retried = false): Promise<string> {
    const id = await this.installationId(repository);
    const memo = this.tokens.get(id);
    if (memo && memo.expiresAt > this.now()) return memo.token;
    const cacheKey = `gh:token:${id}`;
    const cached = await this.options.kv.get<CachedToken>(cacheKey, 'json');
    if (cached && cached.expiresAt - TOKEN_MARGIN_MS > this.now()) {
      this.tokens.set(id, cached);
      return cached.token;
    }

    const response = await this.send('POST', `/app/installations/${id}/access_tokens`, `Bearer ${await this.appJwt()}`);
    if (response.status === 404 && !retried) {
      // The App was reinstalled: the cached installation id is stale. Forget it and look it up once more.
      await this.options.kv.delete(installationCacheKey(repository));
      return this.installationToken(repository, true);
    }
    if (!response.ok) throw await gitHubError(response, 'create installation token');
    const { token, expires_at: expiresAtText } = (await response.json()) as { token: string; expires_at: string };
    const expiresAt = Date.parse(expiresAtText);
    this.tokens.set(id, { token, expiresAt });
    const ttlSeconds = Math.floor((expiresAt - TOKEN_MARGIN_MS - this.now()) / 1000);
    if (ttlSeconds >= 60) {
      await this.options.kv.put(cacheKey, JSON.stringify({ token, expiresAt } satisfies CachedToken), { expirationTtl: ttlSeconds });
    }
    return token;
  }

  /** A revoked token: forget it so the next request mints a new one. */
  private async forgetToken(repository: RepositoryRef): Promise<void> {
    const id = await this.installationId(repository);
    this.tokens.delete(id);
    await this.options.kv.delete(`gh:token:${id}`);
  }

  /** Call the REST API for one repository as the installation; non-2xx responses become AppErrors. */
  async request<T>(repository: RepositoryRef, method: string, path: string, operation: string, body?: unknown): Promise<T> {
    const token = await this.installationToken(repository);
    const response = await this.send(method, path, `Bearer ${token}`, body);
    if (response.status === 401) await this.forgetToken(repository);
    if (!response.ok) throw await gitHubError(response, operation);
    return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
  }

  /**
   * GraphQL as the installation (`token` omitted) or as a reader whose token is kept server-side (spec 002).
   * GitHub answers rate limits and missing nodes with HTTP 200 and an `errors` list; those become typed AppErrors.
   */
  async graphql<T>(repository: RepositoryRef, query: string, variables: Record<string, unknown>, token?: string): Promise<T> {
    const authorization = `Bearer ${token ?? (await this.installationToken(repository))}`;
    const response = await this.send('POST', '/graphql', authorization, { query, variables });
    if (response.status === 401) {
      if (token) throw new AppError('UNAUTHENTICATED', 'Your GitHub sign-in has expired. Please sign in again.');
      await this.forgetToken(repository);
    }
    if (!response.ok) throw await gitHubError(response, 'graphql');

    const body = (await response.json()) as { data?: T; errors?: { type?: string; message?: string; path?: string[] }[] };
    const errors = body.errors ?? [];
    if (errors.some((error) => error.type === 'RATE_LIMITED' || /rate limit/i.test(error.message ?? ''))) {
      const reset = Number(response.headers.get('x-ratelimit-reset'));
      const retryAfter = Number.isFinite(reset) && reset > 0 ? Math.max(1, reset - Math.floor(this.now() / 1000)) : 60;
      throw new AppError('GITHUB_RATE_LIMITED', 'Comments are temporarily unavailable. Please try again later.', { operation: 'graphql' }, retryAfter, {
        githubMessage: errors[0]?.message,
      });
    }
    const notFound = errors.find((error) => error.type === 'NOT_FOUND');
    if (notFound) {
      const discussion = (notFound.path ?? []).some((segment) => /discussion|comment|node/i.test(segment));
      throw new AppError(discussion ? 'DISCUSSION_NOT_FOUND' : 'REPO_NOT_FOUND', 'The repository or discussion could not be found.', { path: notFound.path ?? [] }, undefined, {
        githubMessage: notFound.message,
      });
    }
    if (errors.length && body.data == null) {
      throw new AppError('GITHUB_ERROR', 'GitHub rejected the request.', { operation: 'graphql' }, undefined, { githubErrors: errors.map((error) => error.message) });
    }
    if (body.data == null) throw new AppError('GITHUB_ERROR', 'GitHub returned no data.', { operation: 'graphql' });
    return body.data;
  }

  /** Like request, but returns null on 404 (e.g. a file that does not exist yet). */
  async requestOrNull<T>(repository: RepositoryRef, method: string, path: string, operation: string): Promise<T | null> {
    const token = await this.installationToken(repository);
    const response = await this.send(method, path, `Bearer ${token}`);
    if (response.status === 404) return null;
    if (response.status === 401) await this.forgetToken(repository);
    if (!response.ok) throw await gitHubError(response, operation);
    return (await response.json()) as T;
  }
}

/** The App as configured for this Worker; `fetch` is injectable for tests. */
export function gitHubAppFromEnv(env: { DISCUSS_KV: KVNamespace; GITHUB_APP_ID?: string; GITHUB_APP_PRIVATE_KEY?: string }, fetcher?: typeof fetch): GitHubApp {
  return new GitHubApp({ appId: env.GITHUB_APP_ID, privateKey: env.GITHUB_APP_PRIVATE_KEY, kv: env.DISCUSS_KV, ...(fetcher ? { fetch: fetcher } : {}) });
}

const installationCacheKey = ({ owner, repo }: RepositoryRef) => `gh:installation:${owner}/${repo}`.toLowerCase();

export const repoPath = ({ owner, repo }: RepositoryRef) => `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;

/**
 * Encode a repository file path per segment for the contents API (keeps `/`, encodes Unicode and spaces).
 * Empty, `.` and `..` segments (also percent-encoded), backslashes and control characters are refused.
 */
export function contentsPath(path: string): string {
  const segments = path.split('/');
  const unsafe = segments.some((segment) => {
    const decoded = segment.replace(/%2e/gi, '.');
    return segment === '' || decoded === '.' || decoded === '..' || /[\\\p{Cc}]/u.test(segment);
  });
  if (unsafe) throw new AppError('BAD_REQUEST', 'The file path is not a safe repository path.', { path });
  return segments.map(encodeURIComponent).join('/');
}
