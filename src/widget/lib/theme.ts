/** Themes are same-origin stylesheets (strict CSP): built-in names only, no remote theme URLs. */
export const THEMES = [
  'ipl-light', 'ipl-dark', 'ipl-auto',
  'light', 'light_high_contrast', 'light_protanopia', 'light_tritanopia', 'dark', 'dark_high_contrast', 'dark_protanopia',
  'dark_tritanopia', 'dark_dimmed', 'preferred_color_scheme', 'transparent_dark', 'noborder_light', 'noborder_dark',
  'noborder_gray', 'cobalt', 'purple_dark', 'gruvbox', 'gruvbox_dark', 'gruvbox_light', 'fro',
  'catppuccin_latte', 'catppuccin_frappe', 'catppuccin_macchiato', 'catppuccin_mocha',
] as const;

export const resolveTheme = (theme: string) => ((THEMES as readonly string[]).includes(theme) ? theme : 'ipl-light');

let wanted = '';

/**
 * Swap the theme stylesheet without a flash: the new link replaces the old one once it has loaded. Only the latest
 * request wins, so quick toggles (A → B → A) and a stylesheet that fails to load never leave the wrong theme.
 */
export function applyTheme(theme: string): void {
  const href = `/themes/${resolveTheme(theme)}.css`;
  wanted = href;
  for (const stale of document.querySelectorAll<HTMLLinkElement>('link[data-discuss-theme-pending]')) {
    if (stale.getAttribute('href') !== href) stale.remove();
  }
  const current = document.querySelector<HTMLLinkElement>('link#discuss-theme');
  if (current?.getAttribute('href') === href || document.querySelector(`link[data-discuss-theme-pending][href="${href}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.dataset.discussThemePending = '';
  link.addEventListener('load', () => {
    if (wanted !== href) {
      link.remove();
      return;
    }
    document.querySelector('link#discuss-theme')?.remove();
    delete link.dataset.discussThemePending;
    link.id = 'discuss-theme';
  }, { once: true });
  link.addEventListener('error', () => link.remove(), { once: true });
  document.head.appendChild(link);
}
