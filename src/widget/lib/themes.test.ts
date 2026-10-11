import { describe, expect, it } from 'vitest';
import { resolveTheme, THEMES } from './theme';

// The IPL themes must keep WCAG AA contrast for every text/background pair the widget uses (spec 004, #12).
const sources = import.meta.glob<string>('../../../styles/themes/ipl-*.css', { query: '?raw', import: 'default', eager: true });
const css = (name: string) => sources[`../../../styles/themes/${name}.css`] ?? '';

/** Custom properties in source order, the later declaration winning, as the cascade does for one selector. */
function variables(text: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const match of text.matchAll(/(--color-[\w-]+):\s*([^;]+);/g)) values[match[1] ?? ''] = (match[2] ?? '').trim();
  return values;
}

function luminance(hex: string): number {
  const digits = hex.replace('#', '');
  const full = digits.length === 3 ? [...digits].map((d) => d + d).join('') : digits;
  const [r, g, b] = [0, 2, 4].map((i) => Number.parseInt(full.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.040_45 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}

const contrast = (a: string, b: string) => {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((high ?? 0) + 0.05) / ((low ?? 0) + 0.05);
};

const TEXT_PAIRS: [string, string][] = [
  ...['fg-default', 'fg-muted', 'fg-subtle', 'accent-fg', 'success-fg', 'attention-fg', 'danger-fg'].flatMap((fg) =>
    ['canvas-default', 'canvas-subtle', 'canvas-overlay'].map((bg): [string, string] => [fg, bg])),
  ['btn-text', 'btn-bg'], ['btn-text', 'btn-hover-bg'],
  ['btn-primary-text', 'btn-primary-bg'], ['btn-primary-text', 'btn-primary-hover-bg'],
  ['accent-fg', 'accent-subtle'], ['attention-fg', 'attention-subtle'], ['danger-fg', 'danger-subtle'],
];

const palettes: [string, Record<string, string>][] = [
  ['ipl-light', variables(css('ipl-light'))],
  ['ipl-dark', variables(css('ipl-dark'))],
  ['ipl-auto (light)', variables(css('ipl-auto').split('@media')[0] ?? '')],
  ['ipl-auto (dark)', variables(css('ipl-auto'))],
];

describe('IPL themes (#12)', () => {
  it('are built-in themes', () => {
    for (const name of ['ipl-light', 'ipl-dark', 'ipl-auto']) {
      expect(THEMES).toContain(name);
      expect(css(name)).not.toBe('');
    }
    expect(resolveTheme('https://evil.example/theme.css')).toBe('ipl-light');
  });

  it('auto matches the light and dark themes', () => {
    expect(palettes[2]?.[1]).toEqual(palettes[0]?.[1]);
    const dark = palettes[1]?.[1] ?? {};
    const autoDark = palettes[3]?.[1] ?? {};
    expect(Object.fromEntries(Object.keys(dark).map((key) => [key, autoDark[key]]))).toEqual(dark);
  });

  it.each(palettes)('%s keeps text at 4.5:1 and control borders at 3:1', (_name, colors) => {
    const failures = TEXT_PAIRS
      .map(([fg, bg]) => ({ pair: `${fg} on ${bg}`, ratio: contrast(colors[`--color-${fg}`] ?? '', colors[`--color-${bg}`] ?? '') }))
      .filter(({ ratio }) => !(ratio >= 4.5));
    const border = contrast(colors['--color-border-default'] ?? '', colors['--color-canvas-default'] ?? '');

    expect(failures).toEqual([]);
    expect(border).toBeGreaterThanOrEqual(3);
  });
});
