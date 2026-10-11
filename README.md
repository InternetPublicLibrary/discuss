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

> **Status:** fork created on 2026-10-10. The upstream Next.js app has been replaced by a Cloudflare Worker and a
> Vite widget; the IPL service is built spec by spec — see the [roadmap](docs/specs/ROADMAP.md).

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

## Configuration

| Name | Kind | Purpose |
| --- | --- | --- |
| `DISCUSS_KV` | KV binding | GitHub tokens, caches, sessions — one namespace per environment |
| `IPL_ALLOWED_ORIGINS` | var | Exact `https` origins of the IPL site (comma-separated; `http://localhost` only in development) |
| `IPL_ORIGIN_PATTERNS` | var | Optional anchored patterns with one `*` label, e.g. `https://*.ipl-preview.pages.dev` |
| `ALLOWED_REPOSITORIES` | var | `owner/repo` list whose discussions the service serves (production: `InternetPublicLibrary/en-US`, `InternetPublicLibrary/pt-BR`) |
| `TRUSTED_DISCUSSION_AUTHORS`, `LEGACY_DISCUSSIONS_BEFORE` | vars | Optional legacy authors (e.g. `giscus[bot]`) whose discussions count as a page's **only if created before** the ISO date; otherwise only discussions written by the IPL App's bot are used |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | secrets | OAuth credentials of the IPL GitHub App (readers' user-to-server tokens); callback `https://<discuss>/api/oauth/github/callback` |
| `ORCID_CLIENT_ID`, `ORCID_CLIENT_SECRET`, `ORCID_ENVIRONMENT` | secrets / var | ORCID sign-in (sandbox unless `production` on the production Worker); callback `https://<discuss>/api/oauth/orcid/callback` |
| `SESSION_SECRET` | secret | 32+ random characters; seals readers' GitHub tokens in KV |
| `SESSION_TTL_DAYS` | var | Session lifetime (default 30) |
| `GITHUB_APP_ID` | var | Id of the IPL GitHub App |
| `GITHUB_WEBHOOK_SECRET` | secret | Webhook secret of the App (events `discussion`, `discussion_comment`, `installation`; content type JSON) |
| `GITHUB_APP_PRIVATE_KEY` | secret | The App's private key in PKCS#8 PEM (`openssl pkcs8 -topk8 -nocrypt -in key.pem`) |

Every `/api/*` request must come from the widget itself or an allowed IPL origin (otherwise `403 origin-not-allowed`);
CORS headers are sent only to allowed origins, and the bot never touches repositories outside `ALLOWED_REPOSITORIES`.

Anonymous reads of a discussion are cached in KV for 5 minutes (one GitHub call per page per period); any signed
`discussion` or `discussion_comment` webhook event for the repository invalidates its cached reads at once. The GraphQL
budget is requested with every read and logged when it runs low.

## Development

Node.js 22+ and npm.

```bash
npm ci
npm run dev          # builds the widget, then wrangler dev on http://localhost:8787
npm run check        # lint + typecheck + tests (API in workerd, widget in jsdom) + build + size budget
npx playwright install chromium   # once
npm run test:e2e     # browser tests of the built widget: axe, keyboard, strict-CSP embed, events
```

The upstream giscus Next.js app was removed once the port reached parity (spec 001 T10); git history keeps it.

## Related

[IPLibrary-website](https://github.com/InternetPublicLibrary/IPLibrary-website) (consumer, spec 004) ·
[contribute](https://github.com/InternetPublicLibrary/contribute) (edits and suggestions) ·
[Better Web Initiative](https://better-web.org)

## License and credits

MIT — see [LICENSE](LICENSE) and [NOTICE.md](NOTICE.md). Based on giscus by Sage M. Abdullah and contributors (and
utterances by Jeremy Danyow); the upstream README is kept in [docs/UPSTREAM-README.md](docs/UPSTREAM-README.md).
