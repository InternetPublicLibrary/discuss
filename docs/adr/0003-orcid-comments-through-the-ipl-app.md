# 0003 — ORCID users comment through the IPL GitHub App, with visible attribution

Date: 2026-10-10 · Status: Accepted

## Context

Comments live in GitHub Discussions (public, moderated with GitHub tools, linked to the content repositories).
GitHub users comment with their own identity. ORCID users have no GitHub identity.

## Decision

Keep GitHub Discussions as the only store. Comments from ORCID-signed-in users are posted by the IPL GitHub App
(bot) with an attribution header rendered by the widget and readable on GitHub:
`**<display name>** · [ORCID <iD>](https://orcid.org/<iD>) — via IPL discuss`, followed by the comment body.
The widget shows these comments with the author's name and an ORCID badge instead of the bot.

## Consequences

- Single public history; GitHub moderation (hide, lock, block) applies to everything.
- The bot is accountable for ORCID comments: rate limits, size limits and a report/hide path are required
  (spec 003). Edits/deletes by the ORCID author are done through the service, which checks the session's iD.
- Attribution is self-asserted by ORCID sign-in, which verifies the iD; names come from the public ORCID record.
