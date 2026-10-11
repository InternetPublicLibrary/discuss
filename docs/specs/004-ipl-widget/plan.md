# 004 — Plan

## Locales
- `locales/<code>/common.json` in giscus's format, loaded with `import.meta.glob` (`src/widget/lib/i18n.tsx`).
- `resolveLocale`: case-insensitive, `_` → `-`, then the base language, then `en` with one console warning.
- `src/widget/lib/locales.test.ts` keeps `en` and `pt-BR` in parity: the same keys, plural forms and
  `{{placeholders}}` / `<tags>`. Dates and relative times use `Intl` for the selected locale.

## Themes
- `styles/themes/ipl-light.css` and `ipl-dark.css` set giscus's `--color-*` variables from the IPL site tokens
  (`IPLibrary-website/assets/css/tokens.css`: page, surface, text, muted, primary, divider, status colours).
  `ipl-auto` imports both behind `prefers-color-scheme`. The default theme for IPL embeds is `ipl-light`.
- A unit test computes WCAG contrast for every text/background pair the themes define and requires ≥ 4.5:1
  (≥ 3:1 for borders of controls).
- The theme stays a same-origin stylesheet swapped by `applyTheme` (strict CSP, no remote themes).

## Accessibility
- Toggles (sort, reactions, monospace) expose `aria-pressed`; comments are `article`s labelled by author and date;
  errors and sign-in status use `aria-live="polite"`; the ORCID badge has an accessible name.
- axe-core runs in CI against the built widget (Playwright) for signed-out, GitHub and ORCID states, in both IPL
  themes and both locales; serious or critical violations fail the job.

## End-to-end
- A static test page with the IPL site's strict CSP embeds `client.js`; Playwright checks loading, theme switching
  through `setConfig`, `discuss:ready` / `discuss:error` events and the "not available on this site" message.
