# 004 — IPL widget: theme and languages

Status: draft · Depends on: [001](../001-workers-runtime/spec.md)

## Why
The widget must look and read like the IPL site (light by default, optional dark) in English and Portuguese.

## What — embed contract (owned here; consumed by IPLibrary-website)
```html
<script src="https://discuss.<ipl-domain>/client.js"
  data-repo="InternetPublicLibrary/<lang>" data-repo-id="…" data-category="…" data-category-id="…"
  data-mapping="pathname" data-lang="pt-BR|en" data-theme="ipl-light|ipl-dark"
  data-providers="github,orcid" async></script>
```
- `data-theme` follows the site toggle; the site sends `{ setConfig: { theme } }` via postMessage on change.
- `data-providers` lists the sign-in options shown.
- Events posted to the parent: `discuss:ready`, `discuss:signed-in` `{ provider }`, `discuss:error` `{ reason }`.

1. Themes `ipl-light` and `ipl-dark` built from the IPL palette (contrast ≥ 4.5:1 for text).
2. Locales `en` and `pt-BR` complete (all strings, including ORCID texts).

## Acceptance criteria
- [ ] axe: no serious/critical issues in the widget, both themes.
- [ ] Theme switch on the IPL site updates the widget without reload.
- [ ] All UI strings translated for `pt-BR`.

## Out of scope
Other languages beyond the existing giscus locales.
