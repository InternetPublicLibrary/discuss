import { AppError } from '../errors';
import { base64ToBytes, base64Url } from './encoding';

/**
 * GitHub App authentication with Web Crypto (issue #18).
 * GitHub downloads keys as PKCS#1 ("BEGIN RSA PRIVATE KEY"); Web Crypto imports only PKCS#8. Convert once with:
 *   openssl pkcs8 -topk8 -nocrypt -in app.private-key.pem -out app.pkcs8.pem
 */
export async function importAppPrivateKey(secret: string | undefined): Promise<CryptoKey> {
  if (!secret) throw new AppError('NOT_CONFIGURED', 'GITHUB_APP_PRIVATE_KEY is not set.');
  // Wrangler secrets are often pasted with literal "\n" sequences.
  const pem = secret.replace(/\\n/g, '\n').trim();
  if (pem.includes('BEGIN RSA PRIVATE KEY')) {
    throw new AppError(
      'NOT_CONFIGURED',
      'GITHUB_APP_PRIVATE_KEY is a PKCS#1 key. Convert it with `openssl pkcs8 -topk8 -nocrypt -in key.pem` and store the PKCS#8 output.',
    );
  }
  const match = /-----BEGIN PRIVATE KEY-----([\s\S]+?)-----END PRIVATE KEY-----/.exec(pem);
  if (!match?.[1]) throw new AppError('NOT_CONFIGURED', 'GITHUB_APP_PRIVATE_KEY is not a PEM-encoded PKCS#8 private key.');
  try {
    return await crypto.subtle.importKey('pkcs8', base64ToBytes(match[1]), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  } catch {
    throw new AppError('NOT_CONFIGURED', 'GITHUB_APP_PRIVATE_KEY could not be imported as an RSA key.');
  }
}

/** App JWT: RS256, issued 60 s in the past for clock drift, valid for 9 minutes (GitHub allows up to 10). */
export async function createAppJwt(appId: string, key: CryptoKey, nowSeconds = Math.floor(Date.now() / 1000)): Promise<string> {
  const encode = (value: object) => base64Url(new TextEncoder().encode(JSON.stringify(value)));
  const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({ iat: nowSeconds - 60, exp: nowSeconds + 540, iss: appId })}`;
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
  return `${unsigned}.${base64Url(new Uint8Array(signature))}`;
}
