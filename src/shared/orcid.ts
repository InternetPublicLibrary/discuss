/** ORCID comments posted by the IPL App (spec 003, ADR 0003). */
export const ORCID_ID = /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/;

export interface OrcidAuthor {
  id: string;
  name: string;
  profileUrl: string;
}

const escapeMarkdown = (text: string) => text.replace(/[\\`*_[\]()#!|~<>]/g, '\\$&');

/**
 * The body posted on GitHub: a header generated from the session, the reader's text with every `<!--` neutralised
 * (so no hidden marker can be forged), and the ownership marker.
 */
export function orcidBody(author: OrcidAuthor, markdown: string): string {
  const header = `**${escapeMarkdown(author.name)}** · [ORCID ${author.id}](${author.profileUrl}) — via IPL discuss`;
  const text = markdown.replace(/\r\n?/g, '\n').replace(/<!--/g, '&lt;!--').trim();
  return `${header}\n\n${text}\n\n<!-- ipl-orcid:${author.id} -->`;
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
