/** ORCID comments posted by the IPL App (spec 003, ADR 0003). */
export const ORCID_ID = /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/;

export interface OrcidAuthor {
  id: string;
  name: string;
  profileUrl: string;
}

const escapeMarkdown = (text: string) => text.replace(/[\\`*_[\]()#!|~<>]/g, '\\$&');

/**
 * A word joiner after every way of writing `@` or `#` that GitHub renders as one: the App bot must never @mention
 * people or teams, or cross-reference issues, on a reader's behalf. GitHub finds mentions in the rendered text, so the
 * escaped (`\@`) and entity forms (`&#64;`, `&#x40;`, `&commat;`, `&#35;`, `&num;`) count too.
 */
const JOINER = '\u2060';
const AT = /(\\?@|&#0*64;|&#x0*40;|&commat;)(?=[\w-])/gi;
const HASH = /(\\?#|&#0*35;|&#x0*23;|&num;)(?=\d)/gi;
const noMentions = (text: string) => text.replace(AT, `$1${JOINER}`).replace(HASH, `$1${JOINER}`).replace(/\b(GH-)(?=\d)/gi, `$1${JOINER}`);

/**
 * The body posted on GitHub: a header generated from the session, the reader's text with every `<!--` neutralised
 * (so no hidden marker can be forged), and the ownership marker.
 */
export function orcidBody(author: OrcidAuthor, markdown: string): string {
  const header = `**${noMentions(escapeMarkdown(author.name)).replace(/:\/\//g, `:${JOINER}//`)}** · [ORCID ${author.id}](${author.profileUrl}) — via IPL discuss`;
  const text = noMentions(markdown.replace(/\r\n?/g, '\n').replace(/<!--/g, '&lt;!--').trim());
  return `${header}\n\n${text}\n\n<!-- ipl-orcid:${author.id} -->`;
}

/** The reader's own text from an App-posted ORCID body (for editing): header and marker removed, `<!--` restored. */
export function orcidSource(body: string): string {
  const withoutMarker = body.replace(/\r\n?/g, '\n').replace(/\n*<!-- ipl-orcid:[^>]* -->\s*$/, '');
  const start = withoutMarker.indexOf('— via IPL discuss\n\n');
  const text = start === -1 ? withoutMarker : withoutMarker.slice(start + '— via IPL discuss\n\n'.length);
  return text.replace(/&lt;!--/g, '<!--').replace(new RegExp(JOINER, 'g'), '');
}

const HEADER = /^\s*<p[^>]*>\s*<strong>([^<]{1,200})<\/strong>\s*·\s*<a href="https:\/\/(?:sandbox\.)?orcid\.org\/(\d{4}-\d{4}-\d{4}-\d{3}[\dX])"[^>]*>ORCID \2<\/a>\s*—\s*via IPL discuss\s*<\/p>/;

const decode = (html: string) =>
  html.replace(/&(amp|lt|gt|quot|#39|#x27);/g, (_m, entity: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", '#x27': "'" })[entity] ?? '').replace(/\\(.)/g, '$1');

/** The header GitHub rendered for an App-posted comment → the ORCID author, and the body without the header. */
export function parseOrcidHeader(bodyHTML: string): { author: OrcidAuthor; bodyHTML: string } | null {
  const match = HEADER.exec(bodyHTML);
  if (!match?.[1] || !match[2]) return null;
  const sandbox = match[0].includes('sandbox.orcid.org');
  return {
    author: { id: match[2], name: decode(match[1]), profileUrl: `https://${sandbox ? 'sandbox.' : ''}orcid.org/${match[2]}` },
    bodyHTML: bodyHTML.slice(match[0].length).trimStart(),
  };
}
