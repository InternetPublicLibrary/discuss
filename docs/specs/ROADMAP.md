# discuss — Roadmap

Goal: readers comment on Internet Public Library pages, signing in with GitHub or ORCID; comments are stored in
GitHub Discussions. Decisions: [ADR 0001](../adr/0001-hard-fork-of-giscus.md),
[0002](../adr/0002-run-on-cloudflare-workers.md), [0003](../adr/0003-orcid-comments-through-the-ipl-app.md).

| Order | Spec | Depends on |
| --- | --- | --- |
| 1 | [001 Workers runtime](001-workers-runtime/spec.md) — current giscus features on Cloudflare | — |
| 2 | [002 Sign-in with GitHub and ORCID](002-sign-in/spec.md) | 001 |
| 3 | [003 ORCID comments through the IPL App](003-orcid-comments/spec.md) | 002 |
| 4 | [004 IPL widget: theme and languages](004-ipl-widget/spec.md) — owns the embed contract used by the IPL site | 001 |

Consumer: `InternetPublicLibrary/IPLibrary-website`. Related: `InternetPublicLibrary/contribute` (edits and
suggestions), which uses the same sign-in approach but separate code and sessions.
