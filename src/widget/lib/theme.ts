/** Themes are same-origin stylesheets (strict CSP): built-in names only, no remote theme URLs. */
export const THEMES = [
  'light', 'light_high_contrast', 'light_protanopia', 'light_tritanopia', 'dark', 'dark_high_contrast', 'dark_protanopia',
  'dark_tritanopia', 'dark_dimmed', 'preferred_color_scheme', 'transparent_dark', 'noborder_light', 'noborder_dark',
  'noborder_gray', 'cobalt', 'purple_dark', 'gruvbox', 'gruvbox_dark', 'gruvbox_light', 'fro',
  'catppuccin_latte', 'catppuccin_frappe', 'catppuccin_macchiato', 'catppuccin_mocha',
] as const;

export const resolveTheme = (theme: string) => ((THEMES as readonly string[]).includes(theme) ? theme : 'light');

/** Swap the theme stylesheet without a flash: the new link replaces the old one once it has loaded. */
export function applyTheme(theme: string): void {
  const href = `/themes/${resolveTheme(theme)}.css`;
  const current = document.querySelector<HTMLLinkElement>('link#discuss-theme');
  if (current?.getAttribute('href') === href) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.addEventListener('load', () => {
    current?.remove();
    link.id = 'discuss-theme';
  }, { once: true });
  document.head.appendChild(link);
}
