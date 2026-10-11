# 0002 — Run on Cloudflare Workers

Date: 2026-10-10 · Status: Accepted

## Context

giscus runs as a Next.js 12 app on Vercel (API routes plus the widget page). The IPL site is on Cloudflare Pages.

## Decision

Serve `discuss` from Cloudflare: the widget is built as static assets (React, Vite) served by Workers static
assets, and the API routes (`/api/oauth/*`, `/api/discussions*`, webhook) become a Hono app on the same Worker.
GitHub App JWTs use Web Crypto; secrets live in Wrangler; sessions in Workers KV.

## Consequences

- One platform for site and services; no Vercel dependency.
- Next.js-specific code (pages router, `next/router`, image handling) must be replaced; this also removes the
  outdated Next.js 12 dependency.
