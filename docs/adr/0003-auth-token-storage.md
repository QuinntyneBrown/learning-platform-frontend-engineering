# ADR-0003: Access token in memory, refresh token in an httpOnly cookie

- **Status:** Accepted
- **Date:** 2026-09-30
- **Deciders:** Coursewright web team

## Context

The web app calls the BFF with a bearer token. Where the browser keeps credentials decides what an XSS bug or a malicious cross-site page can do with them.

We considered four options:

1. **Access and refresh tokens in `localStorage`.** Simple, and survives reloads. Any script that runs on the page, including a compromised dependency, can read and exfiltrate both tokens.
2. **Access token in memory, refresh token in an httpOnly cookie.** Script can't read the refresh token. A reload loses the access token, and a silent refresh gets a new one.
3. **Session cookie only, with the BFF holding the tokens** (the "token handler" pattern). The browser never sees a token at all. The BFF needs session state and CSRF protection on every mutating call.
4. **OIDC authorization code + PKCE directly against an identity provider,** using a certified library.

## Decision

Use option 2, issued by the BFF:

- `POST /api/auth/login` returns a 15-minute JWT access token in the body. The web app's `AuthStore` keeps it in a signal only (`apps/web/src/app/core/auth/auth.store.ts`).
- The same response sets `cw_refresh`, an opaque random token, as an `HttpOnly; SameSite=Strict; Path=/api/auth` cookie (`Secure` outside local dev). The BFF stores only its SHA-256 hash.
- Refresh tokens are single-use. Every refresh rotates the cookie. Presenting a token that was already used revokes every refresh token for that user, because reuse means someone else has a copy.
- On start-up, an app initializer tries `POST /api/auth/refresh`. A `401` just means "signed out".
- The auth interceptor adds the bearer token. On a `401` it refreshes once and retries once, and concurrent `401`s share one refresh.

The username-and-password login stands in for a real identity provider. In production, sign-in would be OIDC + PKCE (option 4), with the BFF as the confidential client (option 3), and the rest of this design stays the same.

**Authorization lives on the server.** Hiding the Reports link from learners is a convenience, not security. `POST /api/reports` returns `403` to a learner whatever the UI shows.

## Consequences

**Positive**

- An XSS bug can use the access token while the page is open, but it can't steal a long-lived credential.
- `SameSite=Strict` and the narrow cookie path mean a cross-site page can't make the browser send the refresh cookie. And even a same-site call to `/refresh` returns the token in the body, which a cross-origin page can't read.
- Rotation with reuse detection limits a stolen refresh token to one use.

**Negative**

- Every page load costs one refresh round trip before authenticated calls can start.
- Multiple tabs each hold their own access token, and they race on rotation. A `BroadcastChannel` or a tab lock would coordinate them; this repo doesn't.
- The server keeps refresh-token state, so the BFF isn't fully stateless.
