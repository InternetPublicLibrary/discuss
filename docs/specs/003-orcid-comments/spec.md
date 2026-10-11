# 003 — ORCID comments through the IPL App

Status: draft · Depends on: [002](../002-sign-in/spec.md) · ADR: [0003](../../adr/0003-orcid-comments-through-the-ipl-app.md)

## Why
ORCID users must be able to comment and reply, with clear attribution, while GitHub Discussions remains the
single store.

## What
1. `POST /api/orcid/comments` and `/api/orcid/replies` (ORCID session required): the service posts with the IPL
   GitHub App installation token; body = attribution header (name + ORCID iD link) + Markdown comment + a hidden
   marker `<!-- ipl-orcid:<iD> -->` used to recognise the author.
2. The widget renders such comments with the ORCID author (name, iD badge, link) instead of the bot.
3. Authors can edit/delete their ORCID comments (service checks the marker against the session iD).
4. Safeguards: per-iD rate limit (e.g. 10 comments/hour), size limit, Markdown sanitised, links `rel="nofollow ugc"`;
   moderators hide/delete on GitHub as usual; a "Report" action opens a moderation issue.

## Acceptance criteria
- [ ] An ORCID user comments, replies, edits and deletes their own comment in staging; others cannot edit it.
- [ ] The comment on GitHub shows the attribution header; the widget shows the ORCID author.
- [ ] Rate limit and size limit return clear errors (tests).
- [ ] Hidden/minimised comments on GitHub stay hidden in the widget.

## Out of scope
Reactions by ORCID users (later), notifications, a separate comment store.
