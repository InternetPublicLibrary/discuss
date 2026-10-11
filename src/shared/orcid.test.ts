import { describe, expect, it } from 'vitest';
import { orcidBody, orcidSource, parseOrcidHeader } from './orcid';

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

describe('mentions in App-posted ORCID comments (review)', () => {
  it('never @mentions people or teams, in the name or the text', () => {
    const body = orcidBody({ id: '0000-0002-1825-0097', name: '@org/team', profileUrl: 'https://orcid.org/0000-0002-1825-0097' }, 'cc @someone');

    expect(body).not.toMatch(/@[\w-]/);
  });

  it.each(['@someone', '\\@someone', '&#64;someone', '&#x40;someone', '&commat;someone', '@org/team', '#12', '\\#12', '&#35;12', 'o/r#12', 'GH-12'])(
    'neutralises %s, which GitHub would render as a mention or reference',
    (written) => {
      const body = orcidBody({ id: '0000-0002-1825-0097', name: 'J', profileUrl: 'https://orcid.org/0000-0002-1825-0097' }, `see ${written}`);
      const text = body.split('\n\n')[1] ?? '';

      expect(text).toContain('\u2060');
      expect(text.replace(/\u2060/g, '')).toBe(`see ${written}`);
    },
  );

  it('gives the reader their text back without the joiners when editing', () => {
    const body = orcidBody({ id: '0000-0002-1825-0097', name: 'J', profileUrl: 'https://orcid.org/0000-0002-1825-0097' }, 'cc @someone <!-- x -->');

    expect(orcidSource(body)).toBe('cc @someone <!-- x -->');
  });
});
