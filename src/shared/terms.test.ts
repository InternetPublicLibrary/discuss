import { describe, expect, it } from 'vitest';
import { canonicalPathTerm, isValidTerm } from './terms';

describe('canonicalPathTerm (#11)', () => {
  it.each(['/a/b/', '/a/b', '/a/b/index.html', '/a/b/index.htm', '//a//b//', '/a/b.html'])('maps %s to a/b', (path) => {
    expect(canonicalPathTerm(path)).toBe('a/b');
  });

  it('strips the base path', () => {
    expect(canonicalPathTerm('/base/a/b/', '/base')).toBe('a/b');
    expect(canonicalPathTerm('/base/a/b/', '/base/')).toBe('a/b');
    expect(canonicalPathTerm('/based/a/', '/base')).toBe('based/a');
  });

  it('decodes percent-encoding and NFC-normalises pt-BR paths', () => {
    expect(canonicalPathTerm('/pt-BR/ci%C3%AAncia/')).toBe('pt-BR/ciência');
    expect(canonicalPathTerm('/pt-BR/ciência/')).toBe('pt-BR/ciência');
  });

  it('keeps case', () => {
    expect(canonicalPathTerm('/pt-BR/Computacao/')).toBe('pt-BR/Computacao');
  });

  it('maps the root to index and survives malformed encoding', () => {
    expect(canonicalPathTerm('/')).toBe('index');
    expect(canonicalPathTerm('/a/%E0%A4%A/')).toBe('a/%E0%A4%A');
  });

  it('validates terms', () => {
    expect(isValidTerm('pt-BR/ciência')).toBe(true);
    expect(isValidTerm('')).toBe(false);
    expect(isValidTerm('a\nb')).toBe(false);
    expect(isValidTerm('x'.repeat(501))).toBe(false);
  });
});
