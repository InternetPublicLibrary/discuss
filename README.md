<p align="center">
  <img src=".github/assets/logo.png" alt="IPL discuss logo" width="128" height="128">
</p>

<h1 align="center">discuss</h1>

<p align="center">
  Comments on <a href="https://ipl.better-web.org">Internet Public Library</a> pages, stored in GitHub Discussions.<br>
  Sign in with <b>GitHub</b> or <b>ORCID</b> · runs on <b>Cloudflare Workers</b> · hard fork of
  <a href="https://github.com/giscus/giscus">giscus</a> (MIT)
</p>

---

> **Status:** fork created on 2026-10-10. The code is still upstream giscus (Next.js); the IPL service is being
> built spec by spec — see the [roadmap](docs/specs/ROADMAP.md).

## How it works

```
IPL page ──► discuss widget (iframe, IPL theme, en / pt-BR)
                │
                ├─ GitHub sign-in ──► comment posted as the reader's own GitHub account
                └─ ORCID sign-in  ──► comment posted by the IPL GitHub App with visible attribution
                                       "**Name** · ORCID 0000-… — via IPL discuss"
                ▼
        GitHub Discussions in the language repository (single public history, GitHub moderation)
```

- **One store:** GitHub Discussions for everyone ([ADR 0003](docs/adr/0003-orcid-comments-through-the-ipl-app.md)).
- **ORCID authors** see their name and iD badge in the widget, and can edit or delete their own comments.
- **Safeguards:** rate and size limits per ORCID iD, sanitised Markdown, report action, GitHub hide/lock tools.

## Embed (planned)

Defined in [spec 004](docs/specs/004-ipl-widget/spec.md):

```html
<script src="https://discuss.<ipl-domain>/client.js"
  data-repo="InternetPublicLibrary/pt-BR" data-repo-id="…" data-category="…" data-category-id="…"
  data-mapping="pathname" data-lang="pt-BR" data-theme="ipl-light" data-providers="github,orcid" async></script>
```

## Roadmap

| Spec | Scope |
| --- | --- |
| [001 Workers runtime](docs/specs/001-workers-runtime/spec.md) | Vite widget + Hono API on Cloudflare, Next.js removed |
| [002 Sign-in](docs/specs/002-sign-in/spec.md) | GitHub (unchanged) and ORCID OAuth with PKCE |
| [003 ORCID comments](docs/specs/003-orcid-comments/spec.md) | Comments, replies, edit/delete via the IPL App |
| [004 IPL widget](docs/specs/004-ipl-widget/spec.md) | IPL themes, en / pt-BR, embed contract |

Decisions: [docs/adr/](docs/adr/). Contributor notes: [AGENTS.md](AGENTS.md).

## Development

Node.js 22+ and npm.

```bash
npm ci
npm run dev          # builds the widget, then wrangler dev on http://localhost:8787
npm run check        # lint + typecheck + tests (API in workerd, widget in happy-dom) + build
```

The upstream giscus code (Next.js: `pages/`, `components/`, `lib/`, `services/`) stays in the tree for reference
while it is ported to `src/` (spec 001); it is not built or deployed.

## Related

[IPLibrary-website](https://github.com/InternetPublicLibrary/IPLibrary-website) (consumer, spec 004) ·
[contribute](https://github.com/InternetPublicLibrary/contribute) (edits and suggestions) ·
[Better Web Initiative](https://better-web.org)

## License and credits

MIT — see [LICENSE](LICENSE) and [NOTICE.md](NOTICE.md). Based on giscus by Sage M. Abdullah and contributors (and
utterances by Jeremy Danyow); the upstream README is kept in [docs/UPSTREAM-README.md](docs/UPSTREAM-README.md).
