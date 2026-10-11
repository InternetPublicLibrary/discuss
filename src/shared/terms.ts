/**
 * Canonical term for `data-mapping="pathname"` (issue #11, spec 004 embed contract): the same IPL page always maps
 * to the same discussion, whatever the trailing slash, `index.html`, percent-encoding or base path.
 */
export function canonicalPathTerm(pathname: string, basePath = ''): string {
  let path = pathname;
  try {
    path = decodeURIComponent(pathname);
  } catch {
    // Malformed percent-encoding: keep the raw path rather than failing the page.
  }
  path = path.normalize('NFC');
  const base = basePath.replace(/\/+$/, '');
  if (base && (path === base || path.startsWith(`${base}/`))) path = path.slice(base.length);
  path = path.replace(/\/index\.html?$/i, '/').replace(/\.html?$/i, '').replace(/\/{2,}/g, '/').replace(/^\/+|\/+$/g, '');
  return path || 'index';
}

/** A term must be printable, single-line and reasonably short (it is stored in the discussion body). */
export function isValidTerm(term: string): boolean {
  return term.length > 0 && term.length <= 500 && !/[\p{Cc}\u2028\u2029]/u.test(term);
}
