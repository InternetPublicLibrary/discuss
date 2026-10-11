# 002 — Plan

Spec: [spec.md](spec.md) · Depends on spec 001.

## Flow (popup)

```
widget  ──window.open──►  /api/oauth/:provider/start?nonce=N        (state + PKCE in KV, state cookie, 302)
                           provider (GitHub App user OAuth / ORCID /authenticate)
                           /api/oauth/:provider/callback             (state = KV + cookie; code exchange)
                           302 /oauth/done.html#ticket=T              (T: one-time, 60 s, sealed sign-in result)
popup   ──postMessage(widget origin)──► widget
widget  ──POST /api/session/exchange { T, N }──► session            (N must match: login-CSRF protection)
        ◄── Set-Cookie: __Host-discuss_session; SameSite=None; Secure; Partitioned; HttpOnly
```

## Decisions

- **Tokens never reach the browser (#6):** the reader's GitHub user-to-server token (8-hour token + refresh token) is
  sealed with AES-GCM (key derived from `SESSION_SECRET`) inside the KV session record; writes go through the Worker.
  Upstream put an encrypted token in page URLs and the host page's `localStorage`.
- **Partitioned cookie (CHIPS):** the session lives in the discuss origin's cookie jar *for the embedding IPL site* —
  not readable by the host page, not shared with other sites embedding discuss.
- **Popup (#17):** the reader never leaves the page, so the draft and scroll position survive; the draft is also kept in
  the widget's own storage while signing in.
- **Expiry:** sessions last `SESSION_TTL_DAYS` (default 30); expired GitHub tokens are refreshed, otherwise the session
  ends and the widget shows the signed-out state.

## Tasks

See [tasks.md](tasks.md).
