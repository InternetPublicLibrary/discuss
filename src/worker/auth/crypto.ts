import { base64ToBytes, bytesToBase64 } from '../github/encoding';
import { AppError } from '../errors';

/** AES-GCM sealing for secrets kept in KV (GitHub user tokens), with a key derived from SESSION_SECRET. */
async function key(secret: string | undefined): Promise<CryptoKey> {
  if (!secret || secret.length < 32) throw new AppError('NOT_CONFIGURED', 'SESSION_SECRET must be set (32+ characters).');
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new TextEncoder().encode('ipl-discuss-sessions'), info: new TextEncoder().encode('github-tokens-v1') },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function seal(secret: string | undefined, value: unknown): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(secret), new TextEncoder().encode(JSON.stringify(value))));
  return `${bytesToBase64(iv)}.${bytesToBase64(data)}`;
}

export async function unseal<T>(secret: string | undefined, sealed: string): Promise<T | null> {
  const [iv, data] = sealed.split('.');
  if (!iv || !data) return null;
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64ToBytes(iv) }, await key(secret), base64ToBytes(data));
    return JSON.parse(new TextDecoder().decode(plain)) as T;
  } catch {
    return null;
  }
}
