import { describe, expect, it } from 'vitest';
import headersText from '../widget/public/_headers?raw';
import wranglerText from '../../wrangler.jsonc?raw';

describe('static asset routing (#7)', () => {
  it('sends every path that could return the widget HTML through the Worker', () => {
    const config = JSON.parse(wranglerText.replace(/^\s*\/\/.*$/gm, '')) as { assets: { run_worker_first: string[] } };

    expect(config.assets.run_worker_first).toEqual(expect.arrayContaining(['/widget', '/', '/index.html']));
  });

  it('forbids framing any static asset served without the Worker', () => {
    expect(headersText).toMatch(/\/\*\n(?:\s+.+\n)*\s+Content-Security-Policy: frame-ancestors 'none'/);
  });
});
