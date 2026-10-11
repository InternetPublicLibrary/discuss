# 002 — Sign-in with GitHub and ORCID

Status: draft · Depends on: [001](../001-workers-runtime/spec.md)

## Why
ORCID lets researchers without GitHub accounts take part; GitHub sign-in must keep posting as the user.

## What
1. GitHub: unchanged giscus behaviour (user-to-server token, encrypted in the client session), so comments are
   authored by the user's own GitHub account.
2. ORCID: OAuth authorization-code flow with PKCE (`/authenticate`), public API; production and sandbox
   endpoints configurable. The service stores, in Workers KV, a session with the ORCID iD and the public
   display name (7 days); the widget gets an opaque session token via postMessage, never ORCID tokens.
3. The widget shows "Sign in with GitHub" and "Sign in with ORCID"; the signed-in identity and a sign-out action.
4. Origin checks: only IPL origins (allow-list) can request tokens; state/CSRF validated.

## Acceptance criteria
- [ ] Both sign-in flows complete in staging (ORCID sandbox) and survive a reload.
- [ ] Sign-out invalidates the ORCID session server-side.
- [ ] State mismatch, foreign origin and replayed codes are rejected (tests).
- [ ] Privacy policy updated: data stored for ORCID users and retention.

## Out of scope
Posting as ORCID users (003).
