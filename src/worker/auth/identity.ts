import { AppError } from '../errors';
import { singleLine } from '../text';

export const PROVIDERS = ['github', 'orcid'] as const;
export type ProviderId = (typeof PROVIDERS)[number];

/** Who signed in: public profile data only — no e-mail (spec 002). */
export interface Identity {
  provider: ProviderId;
  /** GitHub numeric user id or ORCID iD. */
  id: string;
  /** GitHub login (GitHub only). */
  login?: string;
  name: string;
  profileUrl: string;
  avatarUrl?: string;
}

/** GitHub user-to-server tokens of the IPL App: the reader posts as themselves (spec 002 §1). Never sent to the browser. */
export interface GitHubTokens {
  accessToken: string;
  /** Epoch ms; absent for non-expiring tokens. */
  expiresAt?: number;
  refreshToken?: string;
  refreshExpiresAt?: number;
}

export interface SignInResult {
  identity: Identity;
  github?: GitHubTokens;
}

export interface AuthorizeRequest {
  state: string;
  codeChallenge: string;
  redirectUri: string;
}

export interface SignInRequest {
  code: string;
  codeVerifier: string;
  redirectUri: string;
}

export interface IdentityProvider {
  id: ProviderId;
  authorizeUrl(request: AuthorizeRequest): string;
  signIn(request: SignInRequest): Promise<SignInResult>;
}

export interface ProviderDeps {
  clientId: string | undefined;
  clientSecret: string | undefined;
  /** ORCID registry base URL (sandbox outside production). */
  orcidBaseUrl: string;
  fetch: typeof fetch;
}

/** Display names are flattened and capped; empty names fall back to the next candidate. */
export function displayName(...candidates: (string | null | undefined)[]): string {
  for (const candidate of candidates) {
    const cleaned = singleLine(candidate ?? '', 100).replace(/[<>]/g, '');
    if (cleaned) return cleaned;
  }
  return '';
}

export function signInFailed(provider: ProviderId, reason: string): AppError {
  return new AppError('UNAUTHENTICATED', 'Sign-in failed. Please try again.', { provider, reason });
}

export async function readJson<T>(response: Response, provider: ProviderId, step: string): Promise<T> {
  if (!response.ok) throw signInFailed(provider, `${step}: HTTP ${response.status}`);
  try {
    return (await response.json()) as T;
  } catch {
    throw signInFailed(provider, `${step}: invalid JSON`);
  }
}
