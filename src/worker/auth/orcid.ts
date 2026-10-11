import { AppError } from '../errors';
import { displayName, type IdentityProvider, type ProviderDeps, readJson, signInFailed } from './identity';

const ORCID_ID = /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/;

interface PersonRecord {
  name?: {
    'credit-name'?: { value?: string } | null;
    'given-names'?: { value?: string } | null;
    'family-name'?: { value?: string } | null;
  } | null;
}

/** ORCID `/authenticate` (production or sandbox registry from settings, spec 001). */
export function orcidProvider({ clientId, clientSecret, orcidBaseUrl: base, fetch: fetcher }: ProviderDeps): IdentityProvider {
  if (!clientId || !clientSecret) throw new AppError('NOT_CONFIGURED', 'ORCID sign-in is not configured.');
  const publicApi = base.replace('://', '://pub.');

  async function publicName(orcid: string): Promise<string> {
    const response = await fetcher(`${publicApi}/v3.0/${orcid}/person`, { headers: { accept: 'application/json' } });
    if (!response.ok) return '';
    const person = (await response.json().catch(() => ({}))) as PersonRecord;
    const given = person.name?.['given-names']?.value ?? '';
    const family = person.name?.['family-name']?.value ?? '';
    return displayName(person.name?.['credit-name']?.value, `${given} ${family}`);
  }

  return {
    id: 'orcid',
    authorizeUrl({ state, codeChallenge, redirectUri }) {
      const url = new URL(`${base}/oauth/authorize`);
      url.search = new URLSearchParams({
        client_id: clientId,
        response_type: 'code',
        scope: '/authenticate',
        redirect_uri: redirectUri,
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      }).toString();
      return url.toString();
    },
    async signIn({ code, codeVerifier, redirectUri }) {
      const token = await readJson<{ access_token?: string; orcid?: string; name?: string | null; error?: string }>(
        await fetcher(`${base}/oauth/token`, {
          method: 'POST',
          headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: 'authorization_code',
            code,
            redirect_uri: redirectUri,
            code_verifier: codeVerifier,
          }),
        }),
        'orcid',
        'token',
      );
      if (!token.access_token || !token.orcid || !ORCID_ID.test(token.orcid)) throw signInFailed('orcid', token.error ?? 'no ORCID iD');
      const orcid = token.orcid;
      const name = displayName(token.name) || (await publicName(orcid)) || orcid;
      // The access token is not used further and never stored.
      return { identity: { provider: 'orcid', id: orcid, name, profileUrl: `${base}/${orcid}` } };
    },
  };
}
