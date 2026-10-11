/** Byte-safe base64 helpers (btoa on a JS string breaks on non-Latin-1 text such as pt-BR or emoji). */

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64.replace(/\s+/g, ''));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export const utf8ToBase64 = (text: string) => bytesToBase64(new TextEncoder().encode(text));
export const base64ToUtf8 = (base64: string) => new TextDecoder().decode(base64ToBytes(base64));

export const base64Url = (bytes: Uint8Array) => bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
