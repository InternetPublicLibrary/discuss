/** Hex digest with Web Crypto (SHA-1 marks discussions the way giscus did: `<!-- sha1: … -->`). */
export async function digestHex(message: string, algorithm: 'SHA-1' | 'SHA-256' = 'SHA-1'): Promise<string> {
  const hash = await crypto.subtle.digest(algorithm, new TextEncoder().encode(message));
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
