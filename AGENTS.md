# AGENTS.md — discuss

Comment service of the Internet Public Library: GitHub Discussions with GitHub and ORCID sign-in. Hard fork of
giscus (see NOTICE.md).

- Read `docs/specs/ROADMAP.md` first; work spec by spec (`docs/specs/<NNN>-<feature>/spec.md → plan.md → tasks.md`).
- Decisions live in `docs/adr/`.
- Runtime: Cloudflare Workers (ADR 0002): API in `src/worker`, widget in `src/widget`, embed script in `src/client`. The upstream Next.js app is gone (spec 001 T10).
- Never commit to `main` directly; signed commits; Conventional Commits.
