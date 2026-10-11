import { describe, expect, it } from 'vitest';

const sheets = import.meta.glob('../../styles/**/*.css', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

describe('stylesheets (#25)', () => {
  it('are found', () => {
    expect(Object.keys(sheets).length).toBeGreaterThan(20);
  });

  it('do not hot-link github.com images (self-hosted for the CSP)', () => {
    expect(Object.entries(sheets).filter(([, css]) => css.includes('github.com/images')).map(([file]) => file)).toEqual([]);
  });

  it('have no selector lists ending in a comma', () => {
    expect(Object.entries(sheets).filter(([, css]) => /,\s*\{/.test(css)).map(([file]) => file)).toEqual([]);
  });
});
