# 001 — Workers runtime

Status: draft · ADR: [0002](../../adr/0002-run-on-cloudflare-workers.md)

## Why
giscus runs on Next.js 12/Vercel; IPL runs on Cloudflare and needs a maintained runtime.

## What
1. Widget built with Vite (React 18) as static assets; same rendering, reactions, pagination, markdown.
2. API on a Hono Worker with the routes `/api/oauth/authorize|authorized|token`, `/api/discussions`,
   `/api/discussions/categories`, `/api/webhook`; GitHub App installation tokens via Web Crypto JWT.
3. Existing embed (`client.js` with `data-repo`, `data-category`, `data-mapping`, … and postMessage API) keeps
   working unchanged.
4. Tests (Vitest + Miniflare) and CI; Next.js removed.

## Acceptance criteria
- [ ] An IPL page embedding `discuss` loads a discussion, signs in with GitHub and posts a comment on staging.
- [ ] No Next.js or Node built-ins in the deployed bundle.
- [ ] Upstream unit tests ported and passing.

## Out of scope
ORCID (002/003), IPL theme (004).
