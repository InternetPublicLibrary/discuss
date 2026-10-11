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

## Discussion mapping (issue #11)

- `data-mapping="pathname"` uses the **canonical term** from [`src/shared/terms.ts`](../../../src/shared/terms.ts):
  strip `data-base-path`, `index.html` and the trailing slash, decode percent-encoding, NFC-normalise, keep case;
  the root is `index`. `/a/b/`, `/a/b`, `/a/b/index.html` and `/base/a/b/` (with `data-base-path="/base"`) are the
  same page.
- IPL embeds use `data-strict="1"`: discussions are matched by the SHA-1 of the term stored in their body, so page
  titles can change freely. New discussions are titled with the page title (`og:title`, then `<title>`, or a
  `discuss:title` meta), case preserved, and their body holds the page description (or `discuss:description`), the page
  link, the term and its hash.
- One discussion per page: creation happens on the first comment, server-side, through one Durable Object per mapping
  (see spec 001 plan); the category id must belong to the repository and match `data-category`.

## client.js API and events (issues #12, #23, #24)

- Load: the iframe is created when its container comes within one viewport of the screen (IntersectionObserver), or
  at once with `data-loading="eager"` or where IntersectionObserver is missing. Running the script again (client-side
  navigation) reuses the `.discuss` container and never stacks iframes.
- A page with no term (e.g. `data-mapping="specific"` without `data-term`) loads nothing and logs one warning.
- `window.discuss.setTheme(name)` / `window.discuss.setConfig({ theme })`: queued until the widget is ready, then
  delivered; the latest value wins. The widget accepts settings only from the embedding page's origin.
- DOM events on the `.discuss` container (they bubble): `discuss:ready` (once per load), `discuss:error`
  `{ reason }`, `discuss:metadata` `{ discussion }`. The iframe height follows the widget's content.
- Reasons (`src/shared/reasons.ts`): `empty-term`, `repo-not-found`, `repo-not-allowed`, `category-mismatch`,
  `origin-not-allowed`, `rate-limited`, `github-unavailable`, `signed-out`, `discussion-not-found`,
  `invalid-request`, `internal`. On a site that is not allowed, client.js shows "Comments are not available on this
  site." and dispatches `discuss:error { reason: "origin-not-allowed" }`.
- Nothing secret travels in URLs: the widget receives the page address without query or fragment; client.js never
  reads or stores sessions.
- Strict CSP on the IPL site: `script-src` and `frame-src` must allow the discuss origin; `connect-src` must allow it
  for the allow-list check. No `unsafe-*` source is needed.

## Input modes (issue #16)

`data-input="widget"` (default) shows the comment box and sign-in; `data-input="github"` replaces it with "Comment on
GitHub", creating the page's discussion first if needed (anonymous, widget origin only, 10 per hour per IP);
`data-input="none"` shows comments and reactions read-only, with no sign-in. Next to the sign-in buttons the widget
explains what GitHub authorisation allows and links GitHub's documentation and the privacy policy.

## Moderation display (issue #18)

`data-hidden-comments="collapse"` (default) shows comments a moderator minimised on GitHub as collapsed, with the
translated reason (spam, abuse, off-topic, outdated, duplicate, resolved); the body — and an ORCID comment's
attribution — is rendered only after the reader chooses "Show comment". `omit` leaves them out. `data-guidelines-url`
(https only) is linked as "Community guidelines" next to the comment box; by default the repository's code of conduct.
