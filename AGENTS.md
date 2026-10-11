# AGENTS.md — discuss

Comment service of the Internet Public Library: GitHub Discussions with GitHub and ORCID sign-in. Hard fork of
giscus (see NOTICE.md).

- Read `docs/specs/ROADMAP.md` first; work spec by spec (`docs/specs/<NNN>-<feature>/spec.md → plan.md → tasks.md`).
- Decisions live in `docs/adr/`.
- Runtime target: Cloudflare Workers (ADR 0002). Until spec 001 lands, the upstream Next.js code is still in place.
- Never commit to `main` directly; signed commits; Conventional Commits.
