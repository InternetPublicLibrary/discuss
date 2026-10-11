import { base64Url } from '../github/encoding';

/** Random URL-safe token (256 bits by default) for state, PKCE verifiers, session ids and CSRF tokens. */
export function randomToken(bytes = 32): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

/** PKCE S256 challenge for a verifier (RFC 7636). */
export async function codeChallenge(verifier: string): Promise<string> {
  return base64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
}
