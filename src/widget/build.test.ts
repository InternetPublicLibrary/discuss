import { describe, expect, it } from 'vitest';
import html from './index.html?raw';

describe('widget document (#7)', () => {
  it('has no inline script or style', () => {
    expect(html).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/);
    expect(html).not.toMatch(/<style[\s>]/);
    expect(html).not.toMatch(/\sstyle=/);
    expect(html).not.toMatch(/\son[a-z]+=/);
  });
});
