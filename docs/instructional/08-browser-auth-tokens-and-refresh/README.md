# 08 · Browser Auth: Tokens and Refresh

> **Runtime:** ~22 min · **Level:** Senior · **Study guide:** [§7 Authentication and authorization](../../study-guide.md#7-authentication-and-authorization) · **Prerequisites:** [04](../04-routing-guards-and-deep-links/), [07](../07-contract-first-rest-from-the-frontend/)

**Video:** [08-browser-auth-tokens-and-refresh.mp4](08-browser-auth-tokens-and-refresh.mp4) · [Slides](slides.html) · **Audio lesson:** [08-browser-auth-tokens-and-refresh.mp3](08-browser-auth-tokens-and-refresh.mp3) · [Transcript](script.md)

## Why this video exists

"Where would you store tokens in a SPA?" sounds like a trivia question. It's really a threat-model question, and it leads straight into refresh races, rotation and authorization. A weak answer says "a cookie, because it's secure". A strong answer names both attackers (XSS and CSRF), says what each defence does **not** cover, and knows what the browser does when five requests hit an expired token at once. This video builds that answer from Coursewright's code:
- ADR-0003: the access token in memory, and the refresh token in an `HttpOnly; SameSite=Strict; Path=/api/auth` cookie;
- single-use refresh tokens with reuse detection at the BFF;
- an interceptor that refreshes once and retries once, and a store that shares one in-flight refresh;
- guards as UX, with the server enforcing roles (403) and tenancy (404), and tests that prove both;
- the gaps: `SameSite`'s limits, two tabs racing on rotation, and OIDC + PKCE for production sign-in.

## Learning objectives

By the end, the viewer can:

- Compare token storage options against XSS and CSRF, and justify ADR-0003's memory + HttpOnly cookie split, including what XSS can still do.
- Explain each cookie attribute in `apps/bff/src/routes/auth.ts`, and why token responses are `Cache-Control: no-store`.
- Describe rotation with reuse detection in `refresh-tokens.ts`, and walk through the test where a thief replays the first token.
- Walk through `auth.interceptor.ts`: which requests it skips, refresh once, retry once, and sign-out on a failed refresh.
- Show how `AuthStore.refresh()` shares one in-flight refresh between parallel 401s, and why rotation makes that mandatory.
- Explain restore on reload (`provideAppInitializer`) and its cost.
- Separate UX guards from server authorization, and show the 403 and cross-tenant 404 tests.
- Answer the `SameSite`, two-tabs and OIDC + PKCE questions precisely.

## Interview questions this prepares you for

| Question | What a strong answer includes |
|---|---|
| Where would you store tokens in a SPA, and why not `localStorage`? | Anything script can read, XSS can steal: an injection bug, a compromised dependency or a third-party tag. `localStorage` also persists, so the theft outlives the tab. Coursewright keeps the 15-minute JWT in a signal in `AuthStore` only, and the opaque 7-day refresh token in an `HttpOnly; SameSite=Strict; Path=/api/auth` cookie (`Secure` outside local dev). A reload restores the session with a silent refresh. Be honest: XSS can still use the session while the page is open, and can even call `/api/auth/refresh` and read the new access token. What it can't take is a week-long credential. Stronger still: the token-handler pattern, where the browser holds only a session cookie. |
| Walk through OIDC authorization code + PKCE. What does PKCE protect against? | The client generates a random `code_verifier` and sends `code_challenge = SHA-256(verifier)` (method S256) plus `state` on the redirect to `/authorize`. The user signs in at the identity provider (SSO, MFA). The provider redirects back with a one-time code and the state; the client checks the state, then exchanges code + verifier at the token endpoint over the back channel. The provider checks the verifier against the challenge. PKCE defeats authorization-code interception and injection: a stolen code is useless without the verifier. As of September 2026, OAuth security guidance recommends PKCE for every client, confidential ones included, and deprecates the implicit flow. ADR-0003: the BFF would be the confidential client, and the rest of the design stays the same. |
| What does `SameSite=Strict` stop, and what doesn't it stop? | It stops the browser attaching the cookie to any request another site starts, so a hostile page can't force `/refresh` or `/logout`. A same-site call to refresh returns the token in the body, which a cross-origin page can't read anyway. It doesn't stop XSS (same site), a compromised sibling subdomain (same registrable domain), or replay of a cookie that's already stolen. Bearer-token API calls need no CSRF defence at all, because the browser never adds an `Authorization` header. Strict's usual cost (email links arrive without the cookie) doesn't apply here, because only the app's own fetch calls use the cookie. Set the attribute explicitly: browsers differ on the default (as of September 2026). |
| Two tabs refresh at the same moment with rotation on. What happens, and how would you fix it? | `AuthStore` shares refreshes only within one tab; tabs share the cookie jar. Both tabs send the same refresh token. One rotates it; the other presents a spent token, and reuse detection revokes every token the user has, including the new one. Both tabs end up signed out, and the BFF logs "refresh token reused". The comment in `refresh-tokens.ts` names this case, and ADR-0003 lists it as a known negative. Fixes: serialize refreshes across tabs with the Web Locks API (the waiting tab then sends the new cookie); or let one tab refresh and share the access token over `BroadcastChannel`; or a short server grace window for a just-spent token, which slightly widens a thief's window. |
| How do you test that a learner can't export reports? | At the server, where the rule lives. `apps/bff/test/reports.test.ts` "is for managers only" signs in as `learner.acme` through the real login, POSTs `/api/reports` with that bearer token, and expects a 403 problem (`type: 'about:blank'`). `requireRole('manager')` runs as an `onRequest` hook, before body validation, so the caller can't probe the schema. The job endpoints return 404 to anyone but the job's owner, also tested. The E2E "reports are hidden from learners" only checks the link is gone, which is UX. At scale: a table-driven matrix of every role against every protected route. |
| How would you share one in-flight token refresh between five parallel 401s? | Keep the in-flight refresh observable in a field: `this.refreshInFlight ??= this.api.refresh().pipe(tap(…), finalize(() => (this.refreshInFlight = null)), share())`. Every caller gets the same observable; `share()` means one HTTP request; `finalize` clears it on success or error. It's mandatory with rotation: parallel refreshes would present a spent token and trip reuse detection. The spec proves it with `HttpTestingController`: two 401s, then `expectOne('/api/auth/refresh')`, which fails if a second refresh started. Refinement: a late 401 for a request sent with the old token can compare tokens and just retry. |
| What does refresh-token rotation with reuse detection buy you, and what does it cost? | Each refresh token works once; the BFF stores only its SHA-256 hash and rotates it in a transaction. A spent token coming back means two parties hold it, so every token the user has is revoked: a stolen refresh token is good for one use at most. The test replays the first of three tokens and shows both it and the legitimate latest one get 401. The costs: server-side state (the BFF isn't stateless), false positives when tabs or parallel requests race, and the need to single-flight refreshes in the client. |
| Why does the BFF return 404, not 403, for another tenant's course? | The tenant comes from the verified token's `tid` claim (`request.user.tenantId`), never from a header or the URL, and every query is scoped by it (`WHERE c.id = ? AND c.tenant_id = ?`). To another tenant the course doesn't exist, and a 403 would confirm that it does. `courses.test.ts`: "is a 404 for another tenant's course, so its existence doesn't leak". Someone else's report job is a 404 for the same reason, and `roleGuard` uses `canMatch` so a learner sees "Page not found" for `/reports`. |

## Coursewright code on screen

| File | What to show |
|---|---|
| `docs/adr/0003-auth-token-storage.md` | The four options; the decision bullets; "Authorization lives on the server"; the negatives (a round trip per page load, tabs racing on rotation, server-side state) |
| `apps/bff/src/routes/auth.ts` | `cookieOptions` and its comment; `startSession` (`no-store`); login's `DUMMY_PASSWORD_HASH`; the refresh route's reuse warning; logout's `204` |
| `apps/bff/src/auth/access-tokens.ts` | `sub`/`tid`/`roles` claims; "Pin the algorithm" with `algorithms`, `issuer`, `audience` |
| `apps/bff/src/auth/refresh-tokens.ts` | Only the hash is stored; rotation in a `transaction`; the reuse branch revoking every token, and its two-tabs comment |
| `apps/bff/src/auth/passwords.ts`, `apps/bff/src/auth/guards.ts` | Async scrypt + `timingSafeEqual`; `WWW-Authenticate: Bearer`; `requireRole` before body validation |
| `apps/web/src/app/core/auth/auth.store.ts` | The "in memory only" comment; `refresh()` with `??=`, `share()`, `finalize`; `restore()` |
| `apps/web/src/app/core/auth/auth.interceptor.ts`, `.spec.ts` | Skipping non-`/api/` and `/api/auth/`; refresh once, retry once; sign-out with `returnUrl`; the four tests |
| `apps/web/src/app/app.config.ts` | `withInterceptors([traceInterceptor, authInterceptor])` order; `provideAppInitializer(() => inject(AuthStore).restore())` |
| `apps/web/src/app/app.routes.ts`, `core/auth/guards.ts`, `shell/shell.html` | `canMatch: [authGuard, roleGuard('manager')]`; the `isManager()` link |
| `apps/bff/src/routes/reports.ts`, `apps/bff/test/reports.test.ts` | `onRequest: requireRole('manager')`; "is for managers only"; "hides a job from everyone except the user who started it" |
| `apps/bff/src/routes/courses.ts`, `apps/bff/test/courses.test.ts` | `request.user.tenantId` in every query; the 404-not-403 comment and test |
| `apps/bff/test/auth.test.ts` | The cookie-attribute test; the rotation + reuse test; expired and foreign-key tokens |
| `apps/web/e2e/learner-journey.spec.ts`, `apps/web/e2e/reports.spec.ts` | Reload stays signed in; the Reports link is hidden from learners |

## Run sheet

| Time | Segment | Content |
|---|---|---|
| 00:00–01:30 | Hook | Auth questions are threat-model questions. The five questions. The thesis: give script as little as possible, keep credentials short-lived, enforce on the server. |
| 01:30–02:30 | Two attackers | XSS reads anything script can reach; CSRF makes the browser send your cookies. The storage table: nothing is safe from both. |
| 02:30–04:00 | ADR-0003 | The four options. The chosen split: JWT in a signal, opaque refresh token in a cookie. What XSS can still do, and what it can't. |
| 04:00–05:15 | The cookie | `cookieOptions` attribute by attribute; `Secure` from config; `no-store`; the pinned algorithm; the dummy hash; the cookie test. |
| 05:15–06:15 | Rotation | Hash-only storage, rotation in a transaction, reuse revokes everything. The thief-replays-first test as a diagram. |
| 06:15–07:45 | The interceptor | Which requests it skips; refresh once, retry once; sign-out on failure; the four specs; interceptor order (lesson 11). |
| 07:45–09:15 | Shared refresh | Five parallel 401s, naive vs shared. `refreshInFlight ??=` + `share()` + `finalize`. The `expectOne` spec. The late-401 refinement (sketch). |
| 09:15–10:00 | Restore | `provideAppInitializer` + `restore()`; the round-trip cost; the E2E reload. **Demo** the refresh in the Network tab (below). |
| 10:00–11:30 | Authorization | `canMatch` + `roleGuard` + hidden link = UX. `requireRole` before validation, and the 403 test. **Demo** the 403 with curl. Tenancy from the token; 404 across tenants. |
| 11:30–12:45 | SameSite | Who gets the cookie (diagram). Stops / doesn't stop. Strict's usual cost, and why Coursewright doesn't pay it. |
| 12:45–13:45 | Two tabs | The sequence diagram. Three fixes, with a Web Locks sketch. |
| 13:45–15:15 | OIDC + PKCE | ADR-0003's production note. The PKCE sequence. What PKCE protects against. What production would add. |
| 15:15–16:15 | Traps | The seven traps below. |
| 16:15–21:30 | Drill and recap | Five questions, then the five points. |

## Code excerpts

### The cookie, written once

```ts
// apps/bff/src/routes/auth.ts
// httpOnly: page scripts, and so XSS, can't read it. SameSite=Strict: the browser never sends it
// cross-site, which is the CSRF defence for /refresh and /logout. Path: only /api/auth gets it.
const cookieOptions = {
  httpOnly: true,
  sameSite: 'strict',
  secure: secureCookies,
  path: '/api/auth',
} as const;
```

### Reuse detection

```ts
// apps/bff/src/auth/refresh-tokens.ts
if (row.revoked_at !== null) {
  // Reuse detection: a spent token coming back means two parties hold it, and we can't tell
  // which one is the thief. Revoke every token the user has, so both must sign in again.
  // (Two tabs refreshing with the same cookie at once would also land here; the web app
  // single-flights its refresh, and some systems allow a few seconds' grace instead.)
  db.prepare(
    'UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL',
  ).run(now, row.user_id);
  return { ok: false, reason: 'reused' };
}
```

### One in-flight refresh

```ts
// apps/web/src/app/core/auth/auth.store.ts
/**
 * Concurrent callers share one request. Refresh tokens are single-use, so a second parallel
 * refresh would present a spent token, and the BFF's reuse detection would revoke the session.
 */
refresh(): Observable<Session> {
  this.refreshInFlight ??= this.api.refresh().pipe(
    tap({
      next: (session) => this.session.set(session),
      error: () => this.session.set(null),
    }),
    finalize(() => (this.refreshInFlight = null)),
    share(),
  );
  return this.refreshInFlight;
}
```

### Refresh once, retry once

```ts
// apps/web/src/app/core/auth/auth.interceptor.ts (excerpt)
return next(withToken(request, auth.accessToken())).pipe(
  catchError((error: unknown) => {
    if (!(error instanceof HttpErrorResponse) || error.status !== 401) {
      return throwError(() => error);
    }
    // The access token expired: refresh once, then retry once. A second 401 propagates.
    return auth.refresh().pipe(
      catchError(() => {
        // The refresh cookie is gone or revoked too. AuthStore has already cleared the session.
        const returnUrl = router.url;
        void router.navigateByUrl(
          router.createUrlTree(['/login'], { queryParams: { returnUrl } }),
        );
        return throwError(() => error);
      }),
      switchMap((session) => next(withToken(request, session.accessToken))),
    );
  }),
);
```

### The role rule, on the server

```ts
// apps/bff/src/auth/guards.ts
/**
 * A route-level onRequest hook. It runs after authentication but before body validation,
 * so a caller without the role can't probe the request schema.
 */
export function requireRole(role: Role) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user.roles.includes(role)) {
      return sendProblem(reply, { status: 403, detail: `This needs the ${role} role.` });
    }
  };
}
```

### Serializing refreshes across tabs (sketch, not in this repo)

```ts
// auth.store.ts: one refresh at a time across every tab of this origin (Web Locks API).
refresh(): Observable<Session> {
  this.refreshInFlight ??= defer(() =>
    navigator.locks.request('cw-refresh', () => firstValueFrom(this.api.refresh())),
  ).pipe(/* tap, finalize and share, as today */);
  return this.refreshInFlight;
}
```

The browser reads the cookie jar when each request is sent, so the tab that waited for the lock sends the rotated cookie, not the spent one.

### Retrying a late 401 without a second refresh (sketch, not in this repo)

```ts
// auth.interceptor.ts: the request was sent with an older token than the current one.
const sent = auth.accessToken();
return next(withToken(request, sent)).pipe(
  catchError((error: unknown) => {
    // … not a 401: rethrow, as today
    const current = auth.accessToken();
    if (current && current !== sent) return next(withToken(request, current));
    return auth.refresh().pipe(/* … as today … */);
  }),
);
```

## Demo

```bash
# The cookie, rotation and the role rule, as the BFF states them
git grep -n "httpOnly\|sameSite\|path: '/api/auth'" -- apps/bff/src/routes/auth.ts
pnpm --filter @coursewright/bff test auth reports
#   Test Files  2 passed (2)
#        Tests  18 passed (18)

# The interceptor's four behaviours, including the shared refresh
pnpm --filter @coursewright/web test --include src/app/core/auth/auth.interceptor.spec.ts
#   Test Files  1 passed (1)
#        Tests  4 passed (4)

# Anyone can call the API: a learner's token gets a 403 from the server, whatever the UI hides
pnpm dev   # in another terminal
TOKEN=$(curl -s http://localhost:3000/api/auth/login -H 'content-type: application/json' \
  -d '{"username":"learner.acme","password":"Coursewright2026!"}' \
  | node -pe 'JSON.parse(require("fs").readFileSync(0, "utf8")).accessToken')
curl -si http://localhost:3000/api/reports -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d '{"type":"completions"}'
#   HTTP/1.1 403 Forbidden … "detail":"This needs the manager role."
```

In the browser, with `pnpm dev` running, open http://localhost:4200 and sign in as `learner.acme` (`Coursewright2026!`):

1. **DevTools → Application → Cookies → http://localhost:4200.** `cw_refresh` has HttpOnly ticked, SameSite `Strict` and Path `/api/auth`. In the Console, `document.cookie` doesn't include it, and Local storage is empty.
2. **Network tab, then reload.** The first API call is `POST /api/auth/refresh`, before any catalog request. Its response has `cache-control: no-store` and a `set-cookie` with a new `cw_refresh` value: rotation on every reload.
3. **Reuse detection.** Copy the `cw_refresh` value, reload once (it rotates), then paste the old value back into the cookie and reload. You land on the sign-in page, and the `pnpm dev` terminal shows the BFF's "refresh token reused; revoked every session for this user" warning.
4. **Guards are UX.** As the learner, type http://localhost:4200/reports: "Page not found", and no Reports link in the header. Sign in as `manager.acme` and the link appears.

## Traps to call out

- **Tokens in `localStorage`.** One XSS bug or compromised dependency and they're gone, and they keep working after the tab closes.
- **"HttpOnly makes us safe from XSS."** It stops the refresh token being *read*. Injected script can still use the session, and can call `/refresh` itself, while the page is open.
- **One refresh per 401.** With rotation, parallel refreshes trip reuse detection and sign the user out. Share one in-flight refresh.
- **A retry without a limit.** Refresh once, retry once, and let a second 401 through. Never intercept the auth endpoints themselves.
- **Guards and hidden links as authorization.** They're UX. The server returns 403, and a test proves it.
- **The tenant from a header or the URL, or 403 across tenants.** The tenant comes from the verified token, and another tenant's data is a 404.
- **Forgetting that a JWT outlives logout.** Logout revokes the refresh token; the access token works until it expires, which is why it lives 15 minutes.

## Key terms

XSS · CSRF · access token vs refresh token · JWT (`sub`, `tid`, `roles`; pinned `alg`, `iss`, `aud`) · `HttpOnly` / `SameSite=Strict` / `Path` / `Secure` · `Cache-Control: no-store` · refresh-token rotation · reuse detection · token handler pattern (BFF session) · functional `HttpInterceptorFn` · single-flight refresh (`share()`, `finalize`) · `provideAppInitializer` · `canMatch` guard vs server authorization · 401 vs 403 vs 404 · tenant isolation · registrable domain (same-site) · Web Locks API · `BroadcastChannel` · OIDC authorization code · PKCE (`code_verifier`, `code_challenge`, S256) · `state` · implicit flow

## After the video

1. Implement the Web Locks sketch in a branch, and write a spec for it. How do you make it deterministic in a unit test without a real lock manager?
2. Add a BFF test that a learner sending an *invalid* report body still gets 403, not 400, which proves `requireRole` runs before validation.
3. Draw the token-handler variant (ADR-0003's option 3) for Coursewright: what the BFF stores, what the browser holds, and which endpoints need CSRF tokens.

## References

- [`docs/study-guide.md`](../../study-guide.md), section 7
- [ADR-0003: access token in memory, refresh token in an httpOnly cookie](../../adr/0003-auth-token-storage.md)
- Angular documentation: HTTP interceptors (`HttpInterceptorFn`, `withInterceptors`), `provideAppInitializer`, route guards (`CanMatchFn`)
- OWASP Cheat Sheet Series: Cross-Site Request Forgery Prevention, HTML5 Security (web storage)
- MDN: `Set-Cookie` (`HttpOnly`, `SameSite`, `Path`, `Secure`), Web Locks API, `BroadcastChannel`
- RFC 7636 (PKCE), RFC 6750 (bearer tokens, `WWW-Authenticate`), OpenID Connect Core 1.0, and the IETF's OAuth 2.0 Security Best Current Practice
