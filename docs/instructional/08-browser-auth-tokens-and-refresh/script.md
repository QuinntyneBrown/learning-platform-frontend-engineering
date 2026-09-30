# 08 · Browser Auth: Tokens and Refresh

Welcome. Authentication is where frontend interviews stop being about frameworks and start being about threat models. The interviewer wants to know where you'd keep a token, what an attacker could do with it, and what happens when it expires in the middle of five requests. By the end of this lesson, you should be able to explain why Coursewright keeps its access token in memory and its refresh token in an HttpOnly cookie, how rotation with reuse detection works, how one refresh is shared between parallel 401 responses, and why the server, not a route guard, decides who can export a report.

## The questions this lesson answers

Here are the questions this lesson prepares you for. Where would you store tokens in a single-page app, and why not `localStorage`? Walk through OIDC authorization code with PKCE: what does PKCE protect against? What does `SameSite=Strict` stop, and what doesn't it stop? Two tabs refresh at the same moment with rotation on: what happens, and how would you fix it? And how do you test that a learner can't export reports?

Keep one sentence in your head while you listen. The browser is hostile territory, so give script as little as possible, give every credential a short life, and enforce every rule on the server.

## Two attackers

Every storage decision is a trade between two attackers.

The first is cross-site scripting. Script you didn't write runs on your origin, from an injection bug, a compromised npm dependency or a third-party tag. It can read `localStorage`, call your API, and read the responses.

The second is cross-site request forgery. A page on another site makes the browser send a request to yours. It can't read your storage or your responses, but the browser attaches your cookies, unless you tell it not to.

Tokens that script can read are exposed to the first attacker. Credentials the browser sends automatically are exposed to the second. No storage is safe from both, so you decide where each credential lives by what it's worth.

## ADR-0003: memory and an HttpOnly cookie

Open `docs/adr/0003-auth-token-storage.md`. It weighs four options. One: both tokens in `localStorage`, which is simple, survives reloads, and lets any script on the page read both. Two: the access token in memory, and the refresh token in an HttpOnly cookie. Three: a session cookie only, with the backend-for-frontend holding every token, which is the token handler pattern. Four: OIDC with PKCE, straight against an identity provider.

Coursewright chose option two. The access token is a JSON Web Token that lives for fifteen minutes. The login response returns it in the body, and the web app's `AuthStore` keeps it in a signal and nowhere else. The comment in `core/auth/auth.store.ts` says why: any script on the page can read storage, so a single XSS bug would leak the token. The refresh token is an opaque random string that lives for seven days, in a cookie that script can't read.

Be precise about what that buys. While the page is open, an attacker's script can still call the API with the in-memory token. It can even call the refresh endpoint and read the new access token from the response. What it can't do is walk away with a credential that works for a week. The real defence against XSS is not having it: Angular's template sanitization, and a strict content security policy.

## The cookie, attribute by attribute

Now the server side. In `apps/bff/src/routes/auth.ts`, the cookie options are written once, with a comment for each.

HttpOnly: page scripts, and so XSS, can't read it. `SameSite=Strict`: the browser never sends it cross-site, which is the CSRF defence for refresh and logout. And `Path=/api/auth`: only the auth endpoints receive it. The fourth attribute, Secure, comes from configuration: off in local development, which is plain HTTP, and on in production.

Every response that carries tokens also sets `Cache-Control` to no-store. The access token carries the user's ID, tenant and roles, and its algorithm, issuer and audience are pinned when it's verified. The comment in the access-tokens file is worth quoting: never let the token's own header choose how it is checked. And login checks a password even for an unknown username, against a dummy hash, so response timing doesn't reveal which usernames exist.

The test named "signs in and sets an httpOnly, SameSite=Strict refresh cookie", in `apps/bff/test/auth.test.ts`, asserts every attribute, and a max age of seven days.

## Rotation with reuse detection

Open `apps/bff/src/auth/refresh-tokens.ts`. The server stores only a hash of each refresh token, so a leaked database doesn't leak working tokens. Each token works exactly once. A refresh spends the presented token and issues its replacement in one transaction.

The interesting branch is a spent token coming back. The comment says that means two parties hold it, and we can't tell which one is the thief. So the server revokes every token the user has, both parties must sign in again, and the route logs a warning.

The test tells the story. Sign in and refresh twice, so there are three tokens. Then a thief replays the first one. It's rejected with a 401, and so is the legitimate third one. A stolen refresh token is good for one use at most, and replaying it burns every session the user has.

## The interceptor: refresh once, retry once

Back in the browser, open `core/auth/auth.interceptor.ts`, a short functional interceptor.

First, it only touches same-origin API calls. Anything that doesn't start with slash api passes through untouched, so the bearer token never goes to another origin. Anything under slash api slash auth passes through too, because the auth endpoints use the cookie, and, in the comment's words, must never trigger a refresh loop.

Otherwise, it adds the bearer header and sends the request. On a 401, it asks the store for a refresh, and retries the original request once with the new token. The retry sits outside the error handler, so a second 401 goes to the caller. There's no second refresh and no loop. If the refresh itself fails, the store has already cleared the session, so the interceptor navigates to the login page with a return URL, and rethrows the original error.

The spec covers all four behaviours: the token is sent, but not to auth endpoints; one refresh and one retry after a 401; one shared refresh for concurrent 401 responses; and sign-out when the refresh fails. And in `app.config.ts`, the trace interceptor runs before the auth interceptor, so a retry keeps the same trace ID. Lesson eleven picks that up.

## One refresh for five parallel 401 responses

Five requests go out at once with an expired token, and all five come back 401. A naive interceptor starts five refreshes.

With rotation on, that's worse than wasteful. The first refresh spends the cookie. The other four present a spent token, reuse detection fires, and every session is revoked. Five parallel requests would sign the user out.

The fix is in the auth store. It keeps the refresh that's in flight in a private field. If there's none, calling refresh creates one; if there is one, every caller gets that same observable. It's piped through `share()`, so however many callers subscribe, there's one HTTP request, and they all get its result. A `finalize` clears the field when the refresh completes or fails, so the next expiry starts fresh.

The spec proves it. Two requests get a 401 each, and then the test expects exactly one refresh request. As its comment says, `expectOne` fails if the second 401 had started a second refresh. That's a race made deterministic, which lesson ten comes back to.

One refinement: a request sent with the old token can come back 401 just after the refresh finished, and start a harmless second one. You could compare the token it used with the current one, and simply retry when they differ.

## Restore on reload

A token in memory disappears on reload. In `app.config.ts`, an app initializer calls the store's restore method, which is just a refresh with any error turned into "signed out". It runs before the first navigation, so the guards already know whether the user is signed in, and deep links work. Lesson four covers that side.

The cost, which the ADR records, is one refresh round trip on every page load. The end-to-end learner journey proves the behaviour: it enrols, reloads, and still sees the course and the enrolled message.

## Guards are UX; the server decides

Now authorization. In `app.routes.ts`, the reports route has two `canMatch` guards: the auth guard, and a role guard for manager. The shell hides the Reports link from anyone without that role. A learner who types slash reports falls through to the not-found page.

None of that is security, because anyone can call the API with curl. The ADR says it plainly: hiding the Reports link from learners is a convenience, not security.

The real rule is on the server. In `apps/bff/src/routes/reports.ts`, the POST route has a require-role hook for manager. It runs after authentication but before body validation, so a caller without the role can't even probe the request schema. The reports test named "is for managers only" signs in as a learner through the real login, posts a report request with that token, and expects a 403 problem.

Tenancy works the same way. The tenant comes from the verified token, never from a header or the URL. Every course query filters by that tenant ID. Ask for another tenant's course and you get a 404, not a 403, because a 403 would confirm that it exists. The courses test asserts exactly that.

## What SameSite does and doesn't do

`SameSite=Strict` tells the browser not to attach the cookie to any request that another site started. That stops a hostile page from forcing a refresh or a logout. And even a same-site call to refresh returns the token in the body, which a cross-origin page can't read.

It doesn't stop XSS, because injected script runs on your own site. It doesn't stop a sibling subdomain, because site means the registrable domain, so a compromised marketing subdomain counts as same-site. And it does nothing for a cookie that's already been stolen. Notice, too, that the bearer-token calls need no CSRF protection at all: the browser never attaches an authorization header by itself.

Strict usually costs something: a user who follows a link from an email arrives without the cookie. Coursewright doesn't pay that, because only the app's own fetch calls use the cookie. And set the attribute explicitly. As of September 2026, browsers still differ in what they assume when it's missing.

## Two tabs and rotation

The shared refresh lives in one tab's memory. A second tab has its own store, but it shares the cookie jar. Suppose a laptop wakes from sleep and both tabs refresh at once. They send the same cookie. One rotates it. The other presents a spent token, and reuse detection revokes everything. Both tabs end up at sign-in, and the server logs a false alarm.

The comment in `refresh-tokens.ts` names this case, and the ADR lists it as a known weakness. There are three fixes. Serialize refreshes across tabs with the Web Locks API, so the second tab waits and then sends the new cookie. Or let one tab refresh and share the access token over a `BroadcastChannel`. Or give the server a grace window of a few seconds for a just-spent token. It widens the thief's window slightly, so say so.

## OIDC and PKCE

The username and password login stands in for a real identity provider. In production, the ADR says, sign-in would be OIDC with PKCE, with the backend-for-frontend as the confidential client, and the rest of the design stays the same.

The client makes a random secret, the code verifier, and sends only its hash, the code challenge, with the redirect to the identity provider, plus a random state value. The user signs in there, with single sign-on or multi-factor. The provider redirects back with a one-time authorization code. The client checks the state, then exchanges the code and the verifier for tokens, and the provider checks that the verifier matches the challenge.

PKCE protects against authorization code interception. A code stolen from a redirect, a log or the browser history is useless without the verifier, which never left the client. As of September 2026, current OAuth security guidance recommends PKCE for every client, confidential ones included, and deprecates the implicit flow, which put tokens in the URL.

What production would add follows from that: a real identity provider, SAML single sign-on for enterprise tenants, possibly the token handler pattern with CSRF tokens, multi-factor authentication, audit logs, cross-tab coordination, and a strict content security policy.

## Traps

Here are the traps to call out.

Tokens in `localStorage`. One XSS bug, or one compromised dependency, and they're gone for good.

Saying that HttpOnly makes you safe from XSS. It stops the refresh token being read, not the session being used.

Starting one refresh per 401. With rotation on, parallel refreshes trip reuse detection and sign the user out.

A retry without a limit. Refresh once, retry once, and let a second 401 through.

Treating a hidden link or a route guard as authorization. The server returns 403, and a test proves it.

Reading the tenant from a header or the URL, or answering another tenant's request with 403. The tenant comes from the verified token, and the answer is 404.

And forgetting that a JWT still works after logout. Logout revokes the refresh token, but the access token lives out its fifteen minutes, which is exactly why it's short.

## Interview drill

Let's practise. After each question there's a short pause. Pause the audio if you want more time, answer out loud, and then compare your answer with the model answer.

**Interviewer:** Where would you store tokens in a single-page app, and why not `localStorage`?

[pause 5s]

Anything script can read, XSS can steal, and `localStorage` persists, so a stolen token keeps working after the tab closes. In Coursewright, the fifteen-minute access token lives only in memory, in a signal in the auth store. The refresh token lives in an HttpOnly, SameSite Strict cookie scoped to the auth path, and it rotates on every use. A reload restores the session with a silent refresh. XSS can still use the session while the page is open, but it can't take a long-lived credential. Stronger still is a token handler backend, where the browser holds only a session cookie.

**Interviewer:** Walk through OIDC authorization code with PKCE. What does PKCE protect against?

[pause 5s]

The client creates a random code verifier and sends its hash, the code challenge, with the redirect to the identity provider, plus a state value. The user signs in there, and the provider redirects back with a one-time code. The client checks the state, then exchanges the code and the verifier for tokens, and the provider checks the verifier against the challenge. PKCE protects against code interception: a stolen code is useless without the verifier. It's recommended for every client now, and I'd run it from the backend-for-frontend as a confidential client.

**Interviewer:** What does `SameSite=Strict` stop, and what doesn't it stop?

[pause 5s]

It stops the browser attaching the cookie to requests that another site starts, so a hostile page can't force a refresh or a logout. It doesn't stop XSS, which runs on your own site. It doesn't stop a compromised sibling subdomain, because same-site means the registrable domain. And it does nothing for a cookie that's already been stolen. The usual cost is that links from email arrive without the cookie, which Coursewright avoids, because only its own fetch calls use it.

**Interviewer:** Two tabs refresh at the same moment with rotation on. What happens, and how would you fix it?

[pause 5s]

Each tab shares its own refreshes, but both tabs share the cookie jar. Both send the same refresh token, one rotates it, and the other presents a spent token. Reuse detection revokes every session, so both tabs are signed out and the server logs a false alarm. I'd serialize refreshes across tabs with the Web Locks API, so the second tab sends the new cookie, or have one tab refresh and share the token over a broadcast channel. A server grace window of a few seconds also works, at a small cost in security.

**Interviewer:** How do you test that a learner can't export reports?

[pause 5s]

At the server, because that's where the rule lives. Coursewright's integration test signs in as a learner through the real login, posts a report request with that bearer token, and expects a 403 problem. The job endpoints also return 404 for someone else's job, and the repo tests that too. The end-to-end test only checks that the Reports link is hidden, which is UX, not security. In a bigger system, I'd make it a table-driven test of every role against every protected route.

## Recap

Five things to remember from this lesson.

One: no storage is safe from both XSS and CSRF. Keep the access token short-lived and in memory, and the refresh token in an HttpOnly, SameSite Strict cookie on a narrow path.

Two: refresh tokens are single-use. With rotation and reuse detection, a stolen token works once at most, and replaying it revokes every session.

Three: the interceptor refreshes once and retries once, and the store shares one in-flight refresh between parallel 401 responses. Otherwise, rotation would sign the user out.

Four: guards and hidden links are UX. The server enforces roles and tenancy, answers with 403 or 404, and tests prove both.

Five: know what your defences don't cover. SameSite doesn't stop XSS or sibling subdomains, tabs race on rotation, and in production, sign-in is OIDC with PKCE.

In the next lesson, we'll look at async jobs, SSE and polling: how Coursewright accepts a report request with a 202, runs it in the background, and streams its progress to the browser.
