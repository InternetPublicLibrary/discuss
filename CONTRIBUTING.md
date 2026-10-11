# Contributing

- [Setup](#setup)
- [Themes](#themes)
- [Translations](#translations)

Thanks for helping with IPL discuss. Work follows the specs in [`docs/specs/`](docs/specs/ROADMAP.md): read the
spec, plan and tasks of the area you change, and the decisions in [`docs/adr/`](docs/adr/).

## Setup

You need Node.js 22+ and npm. The API is a Cloudflare Worker (Hono); the widget is Preact built with Vite.

```bash
npm ci
cp .dev.vars.example .dev.vars   # sandbox GitHub App, OAuth and ORCID credentials
npm run dev                      # builds the widget, then wrangler dev on http://localhost:8787
npm run check                    # lint, typecheck, unit tests, build and size budget
npx playwright install chromium  # once
npm run test:e2e                 # browser tests: axe, keyboard, strict-CSP embed, events
```

Open a pull request from a branch; commits are signed and follow Conventional Commits. Never commit credentials;
use sandbox repositories and the ORCID sandbox for manual tests.

## Themes

Themes are same-origin stylesheets in [`styles/themes`](styles/themes); the file name without `.css` is the theme
key, and it must be listed in `THEMES` in [`src/widget/lib/theme.ts`](src/widget/lib/theme.ts). Remote theme URLs
are not supported (strict CSP). The IPL themes (`ipl-light`, `ipl-dark`, `ipl-auto`) take their colours from the IPL
site tokens and are checked for WCAG contrast by `src/widget/lib/themes.test.ts`.

## Translations

Strings live in [`locales/<code>/common.json`](locales) in the giscus format (plural objects keyed by `0` and the
`Intl.PluralRules` categories, `{{variables}}`, `<tag>` placeholders). English and Brazilian Portuguese must stay
complete: `src/widget/lib/locales.test.ts` fails when a key, placeholder or tag is missing in `pt-BR`. Other locales
fall back to English for keys they lack.
