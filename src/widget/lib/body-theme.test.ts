import { afterEach, describe, expect, it } from 'vitest';
import { processCommentBody } from './body';
import { applyTheme } from './theme';

describe('processCommentBody (review)', () => {
  it('opens links in a new tab, never replacing the IPL page', () => {
    const html = processCommentBody('<p><a href="https://example.org">x</a></p>');

    expect(html).toContain('target="_blank"');
    expect(html).not.toContain('_top');
  });

  it('turns in-page anchors (headings, footnotes) into plain text', () => {
    const html = processCommentBody('<p><a href="#user-content-fn-1">1</a></p>');

    expect(html).toBe('<p><a>1</a></p>');
  });

  it('drops style attributes and SVG', () => {
    const html = processCommentBody('<p style="position:fixed">a</p><svg><a href="https://x.example">b</a></svg>');

    expect(html).not.toMatch(/style=|<svg/);
  });
});

describe('applyTheme (review)', () => {
  afterEach(() => document.head.replaceChildren());
  const links = () => [...document.head.querySelectorAll('link')];
  const load = (href: string) => links().find((link) => link.getAttribute('href') === href)?.dispatchEvent(new Event('load'));

  it('ends on the latest theme after quick toggles (A → B → A)', () => {
    applyTheme('ipl-light');
    load('/themes/ipl-light.css');
    applyTheme('ipl-dark');
    applyTheme('ipl-light');
    load('/themes/ipl-dark.css');

    expect(document.querySelector('link#discuss-theme')?.getAttribute('href')).toBe('/themes/ipl-light.css');
    expect(links()).toHaveLength(1);
  });

  it('keeps the current theme when the new stylesheet fails to load', () => {
    applyTheme('ipl-light');
    load('/themes/ipl-light.css');
    applyTheme('ipl-dark');
    links().find((link) => link.getAttribute('href') === '/themes/ipl-dark.css')?.dispatchEvent(new Event('error'));
    applyTheme('ipl-dark');

    expect(links().map((link) => link.getAttribute('href'))).toEqual(['/themes/ipl-light.css', '/themes/ipl-dark.css']);
  });
});
