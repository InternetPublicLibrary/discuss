# 001 — Plan

Spec: [spec.md](spec.md) · ADR: [0002](../../adr/0002-run-on-cloudflare-workers.md)

## Architecture

```
src/worker/      Hono API on Cloudflare Workers (+ static widget assets via the ASSETS binding)
  index.ts       routes, error middleware, security headers
  errors.ts      one error shape; reason codes shared with the widget and client.js (#23)
  config.ts      origin and repository allow-lists (#8)
  github/        GitHub App (Web Crypto JWT, KV token cache), GraphQL client with rate-limit handling (#9)
  discussions/   read (edge cache, webhook invalidation), find-or-create with KV map and lock (#9, #10, #11)
src/widget/      Vite + Preact widget (ported giscus components), i18n without next-translate (#5)
src/client/      client.js embed script (lazy loading, ready/theme API, errors) (#24, #12, #23)
src/shared/      types and pure helpers used by both (terms, reasons)
```

- **Runtime:** Workers + Hono; Web Crypto; `fetch` only. Widget: Preact 10 (React compat for SWR and Octicons).
- **Tokens never reach the browser:** the widget talks only to `/api/*`; the Worker calls GitHub with the App
  installation token or the reader's token kept server-side in a KV session (spec 002, #6).
- **Tests:** Vitest projects — `worker` inside workerd, `widget` in happy-dom; Playwright for the embed later.
- **CI:** lint, typecheck, tests and build on every PR; Dependabot; CodeQL.

## Order

Foundation → errors and GitHub client → allow-lists → discussion reads and cache → terms and find-or-create →
categories and upstream fixes → widget port with CSP → replies, reactions → client.js → specs 002–004 → remove Next.js.

## Widget port notes (T7)

- Read-only until spec 002: comments, replies, reactions (counts), pagination, ordering, themes and languages work;
  writing, reacting and signing in arrive with sessions.
- Comment HTML is GitHub's `bodyHTML`, sanitised again with DOMPurify; links get `rel="noopener noreferrer nofollow ugc"`.
- Not ported: MathJax rendering of `<math-renderer>` (vendored as git submodules upstream); math shows as GitHub's
  fallback text. Revisit if IPL discussions need formulas.
- Widget tests run in jsdom: happy-dom let DOMPurify keep event-handler attributes.
