import { AppError } from '../errors';
import { displayName, type GitHubTokens, type IdentityProvider, type ProviderDeps, readJson, signInFailed } from './identity';

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  error?: string;
}

export function tokensFrom(response: TokenResponse, now = Date.now()): GitHubTokens | null {
  if (!response.access_token) return null;
  return {
    accessToken: response.access_token,
    ...(response.expires_in ? { expiresAt: now + response.expires_in * 1000 } : {}),
    ...(response.refresh_token ? { refreshToken: response.refresh_token } : {}),
    ...(response.refresh_token_expires_in ? { refreshExpiresAt: now + response.refresh_token_expires_in * 1000 } : {}),
  };
}

/**
 * GitHub sign-in through the IPL GitHub App (user-to-server token), so readers post as themselves (spec 002 §1).
 * The token is returned to the Worker only; the browser never sees it (#6).
 */
export function githubProvider({ clientId, clientSecret, fetch: fetcher }: ProviderDeps): IdentityProvider {
  if (!clientId || !clientSecret) throw new AppError('NOT_CONFIGURED', 'GitHub sign-in is not configured.');
  return {
    id: 'github',
    authorizeUrl({ state, codeChallenge, redirectUri }) {
      const url = new URL('https://github.com/login/oauth/authorize');
      url.search = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, state, code_challenge: codeChallenge, code_challenge_method: 'S256', allow_signup: 'true' }).toString();
      return url.toString();
    },
    async signIn({ code, codeVerifier, redirectUri }) {
      const token = await readJson<TokenResponse>(
        await fetcher('https://github.com/login/oauth/access_token', {
          method: 'POST',
          headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri, code_verifier: codeVerifier }),
        }),
        'github',
        'token',
      );
      const github = tokensFrom(token);
      if (!github) throw signInFailed('github', token.error ?? 'no access token');
      const user = await readJson<{ id?: number; login?: string; name?: string | null; avatar_url?: string }>(
        await fetcher('https://api.github.com/user', { headers: { accept: 'application/vnd.github+json', authorization: `Bearer ${github.accessToken}`, 'user-agent': 'ipl-discuss' } }),
        'github',
        'profile',
      );
      if (typeof user.id !== 'number' || !user.login || !/^[A-Za-z0-9-]{1,39}$/.test(user.login)) throw signInFailed('github', 'unexpected profile');
      return {
        identity: {
          provider: 'github',
          id: String(user.id),
          login: user.login,
          name: displayName(user.name, user.login),
          profileUrl: `https://github.com/${user.login}`,
          ...(user.avatar_url?.startsWith('https://avatars.githubusercontent.com/') ? { avatarUrl: user.avatar_url } : {}),
        },
        github,
      };
    },
  };
}

/** Exchange a refresh token for a new user token (8-hour tokens); null when GitHub refuses. */
/**
 * Renew a user token. `refused` means GitHub rejected the refresh token (it is single use, expired or revoked);
 * `unavailable` is a network error or a GitHub 5xx, after which the session must survive.
 */
export async function refreshGitHubToken(deps: ProviderDeps, refreshToken: string): Promise<GitHubTokens | 'refused' | 'unavailable'> {
  if (!deps.clientId || !deps.clientSecret) return 'refused';
  let response: Response;
  try {
    response = await deps.fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: deps.clientId, client_secret: deps.clientSecret, grant_type: 'refresh_token', refresh_token: refreshToken }),
    });
  } catch {
    return 'unavailable';
  }
  if (response.status >= 500 || response.status === 429) return 'unavailable';
  if (!response.ok) return 'refused';
  return tokensFrom((await response.json().catch(() => ({}))) as TokenResponse) ?? 'refused';
}
