# 003 — Plan

Spec: [spec.md](spec.md) · ADR: [0003](../../adr/0003-orcid-comments-through-the-ipl-app.md) · Depends on 002.

## Posting

`POST /api/orcid/comments` (ORCID session, widget origin, CSRF) posts with the **App installation token**:

```
**<display name>** · [ORCID <iD>](https://orcid.org/<iD>) — via IPL discuss

<reader's Markdown, with "<!--" neutralised>

<!-- ipl-orcid:<iD> -->
```

- The header is generated from the session (name from the public ORCID record), never from the request.
- `<!--` in the reader's text becomes `&lt;!--`, so no hidden marker can be forged; a forged header in the text appears
  after the real one and renders as plain text.
- Limits: 10 comments per hour per iD, 10,000 characters, and a global guard that stops ORCID posting when the App's
  GraphQL budget runs low, so reads keep working.

## Showing

Reads mark a comment as ORCID-authored only when its author is the **App's bot** and its first paragraph is exactly the
generated header (strict pattern); the widget then shows the name and an ORCID iD badge instead of the bot, and the
header paragraph is removed from the body. Hidden (minimised) ORCID comments stay hidden like any other.

## Editing and deleting

`PATCH|DELETE /api/orcid/comments/:id` read the comment's raw body as the App and require the bot author and the
`<!-- ipl-orcid:<iD> -->` marker of the signed-in iD (403 otherwise).

## Out of scope

Anonymous comments (upstream `giscus#65`) and non-GitHub backends (`giscus#1046`): every comment is attributable to a
GitHub account or a verified ORCID iD, and GitHub Discussions stays the only store (ADR 0003).
