# Privacy policy — IPL discuss

IPL discuss shows and stores comments on Internet Public Library pages in GitHub Discussions of the IPL content
repositories. It is operated by the Internet Public Library maintainers. This page says what the service does with
your data. (The upstream giscus privacy policy does not apply to this service.)

## Reading comments

Reading needs no account. The comments you see come from public GitHub Discussions; the service caches them for a few
minutes. No cookie is set while you only read.

## Signing in

You can sign in to comment with **GitHub** or **ORCID**. Sign-in opens a small window on the provider's site; you can
cancel at any time.

### GitHub

You authorise the **IPL GitHub App**. GitHub's screen says the app can "act on your behalf"; in practice IPL discuss uses
that authorisation only to:

- read your public profile (numeric id, login, name, avatar);
- post the comments and replies you write, and add or remove the reactions you choose, in IPL discussions;
- render the preview of a comment.

It cannot read your e-mail address or private repositories and cannot act outside the repositories where the IPL App is
installed. The App's own permissions on those repositories are **Discussions: read and write** and **Metadata: read**.
You can revoke the authorisation at any time in GitHub → Settings → Applications. See GitHub's documentation:
[Authorizing GitHub Apps](https://docs.github.com/apps/using-github-apps/authorizing-github-apps).

### ORCID

You sign in with ORCID's `/authenticate` scope: the service receives your ORCID iD and your public name, nothing else.

## What we store, where and for how long

| Data | Where | How long |
| --- | --- | --- |
| Session: provider, id, login (GitHub), display name, profile and avatar URL; for GitHub, your access and refresh tokens **encrypted** | Cloudflare Workers KV | 30 days or until you sign out |
| Session cookie (`__Host-discuss_session`), HttpOnly, partitioned per site | your browser | same as the session |
| Sign-in state (single-use, 10 minutes) and sign-in tickets (single-use, 60 seconds) | Workers KV | minutes |
| Cached public discussions, GitHub App tokens | Workers KV | at most 1 hour |
| Request logs (request id, route, status, error code) | Cloudflare Workers Logs | Cloudflare's default retention |

Tokens are never sent to your browser or to the IPL page. Comment drafts stay in your browser (the widget's own
session storage) and are never sent until you post.

## What becomes public

Comments and reactions are public on GitHub and on the IPL page. Comments posted with GitHub show your GitHub account.
Comments posted with ORCID (when available) are published by the IPL App and show your name and ORCID iD.

## No tracking

No analytics, advertising or tracking cookies. Cloudflare processes IP addresses to serve and protect the service under
its own privacy policy; IPL discuss does not store them.

## Your rights and contact

To ask about or remove data linked to you, open an issue in
[InternetPublicLibrary/discuss](https://github.com/InternetPublicLibrary/discuss/issues) or, for sensitive requests, use
[private vulnerability reporting](https://github.com/InternetPublicLibrary/discuss/security/advisories/new). Comments
can be edited or deleted on GitHub (GitHub accounts) or through the widget (ORCID, spec 003).
