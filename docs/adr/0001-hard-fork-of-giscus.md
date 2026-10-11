# 0001 — Hard fork of giscus

Date: 2026-10-10 · Status: Accepted

## Context

IPL pages already embed giscus for discussion. IPL needs comments from people without GitHub accounts
(researchers signing in with ORCID), IPL branding and languages, and hosting on Cloudflare. giscus (MIT, active)
is built around commenting with the reader's own GitHub token and is hosted on Vercel with Next.js 12.

## Decision

Create `InternetPublicLibrary/discuss` as a hard fork with the full upstream history (no GitHub fork link), keep
the MIT license and original notices (NOTICE.md), and evolve it independently.

## Consequences

- IPL owns the roadmap and security fixes; useful upstream fixes are ported manually.
- The embed contract (script attributes, postMessage events) stays compatible where possible so existing IPL
  pages keep working during the transition.
