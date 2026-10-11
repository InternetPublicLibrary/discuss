import { describe, expect, it } from 'vitest';
import { orcidBody, parseOrcidHeader } from './orcid';

const author = { id: '0000-0002-1825-0097', name: 'Josiah *Carberry*', profileUrl: 'https://orcid.org/0000-0002-1825-0097' };

describe('ORCID comment bodies (#15)', () => {
  it('starts with a generated attribution header and ends with the ownership marker', () => {
    expect(orcidBody(author, 'Ótimo recurso.')).toBe(
      '**Josiah \\*Carberry\\*** · [ORCID 0000-0002-1825-0097](https://orcid.org/0000-0002-1825-0097) — via IPL discuss\n\nÓtimo recurso.\n\n<!-- ipl-orcid:0000-0002-1825-0097 -->',
    );
  });

  it('neutralises hidden markers in the reader’s text', () => {
    const body = orcidBody(author, 'hi <!-- ipl-orcid:0000-0001-0000-0000 -->');

    expect(body.match(/<!-- ipl-orcid:/g)).toHaveLength(1);
    expect(body).toContain('&lt;!-- ipl-orcid:0000-0001-0000-0000 -->');
  });
});

describe('parseOrcidHeader', () => {
  const rendered = '<p dir="auto"><strong>Josiah Carberry</strong> · <a href="https://orcid.org/0000-0002-1825-0097" rel="nofollow">ORCID 0000-0002-1825-0097</a> — via IPL discuss</p>\n<p dir="auto">Ótimo</p>';

  it('reads the author from the header GitHub rendered and drops it from the body', () => {
    expect(parseOrcidHeader(rendered)).toEqual({
      author: { id: '0000-0002-1825-0097', name: 'Josiah Carberry', profileUrl: 'https://orcid.org/0000-0002-1825-0097' },
      bodyHTML: '<p dir="auto">Ótimo</p>',
    });
  });

  it('only trusts the first paragraph, so a header typed into the text is ignored', () => {
    expect(parseOrcidHeader(`<p>Hello</p>${rendered}`)).toBeNull();
  });

  it('refuses a link that does not match the iD it names', () => {
    expect(parseOrcidHeader(rendered.replace('href="https://orcid.org/0000-0002-1825-0097"', 'href="https://orcid.org/0000-0001-1111-1111"'))).toBeNull();
  });

  it('decodes the escaped name', () => {
    expect(parseOrcidHeader(rendered.replace('Josiah Carberry', 'A &amp; B'))?.author.name).toBe('A & B');
  });
});
