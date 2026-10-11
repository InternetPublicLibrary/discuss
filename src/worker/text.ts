/** Small text helpers shared by config, entries and pull requests. */

/** Lower-case slug that keeps letters of any script (pt-BR accents are folded to ASCII, CJK is kept). */
export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Make submitted text safe inside a single line we generate (commit messages, titles): removes control and bidi
 * characters (so CR/LF cannot start a new line or a `Co-authored-by:` trailer), collapses whitespace and caps length.
 */
export function singleLine(value: string, maxLength = 200): string {
  const cleaned = value
    .normalize('NFC')
    .replace(/[\p{Cc}\p{Cf}\u2028\u2029]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength - 1)}…` : cleaned;
}

const JOINER = '\u2060';

/**
 * Text that GitHub reads in titles and commit messages: a word joiner breaks @mentions, #123 / GH-123 / owner/repo#123
 * references, closing keywords and URLs, so reader text can neither notify people nor close or cross-link issues.
 */
export function neutralizeGitHubText(value: string): string {
  return value
    .replace(/@/g, `@${JOINER}`)
    .replace(/#(?=\d)/g, `#${JOINER}`)
    .replace(/\b(GH)-(?=\d)/gi, `$1-${JOINER}`)
    .replace(/:\/\//g, `:${JOINER}//`)
    .replace(/\bwww\./gi, (match) => `${match.slice(0, 3)}${JOINER}.`)
    .replace(/\b(close[sd]?|fix(?:e[sd])?|resolve[sd]?)\b/gi, (word) => `${word.slice(0, 1)}${JOINER}${word.slice(1)}`);
}

const pad = (value: number, length = 2) => String(value).padStart(length, '0');

/**
 * Format a UTC date with the tokens upstream configurations use in `{@date:…}` placeholders
 * (a subset of moment.js): YYYY YY MM M DD D HH H mm ss X (seconds) x (milliseconds).
 */
export function formatDate(date: Date, pattern: string): string {
  const tokens: Record<string, string> = {
    YYYY: String(date.getUTCFullYear()),
    YY: pad(date.getUTCFullYear() % 100),
    MM: pad(date.getUTCMonth() + 1),
    M: String(date.getUTCMonth() + 1),
    DD: pad(date.getUTCDate()),
    D: String(date.getUTCDate()),
    HH: pad(date.getUTCHours()),
    H: String(date.getUTCHours()),
    mm: pad(date.getUTCMinutes()),
    ss: pad(date.getUTCSeconds()),
    X: String(Math.floor(date.getTime() / 1000)),
    x: String(date.getTime()),
  };
  return pattern.replace(/YYYY|YY|MM|M|DD|D|HH|H|mm|ss|X|x/g, (token) => tokens[token] ?? token);
}
