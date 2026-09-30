# Study guide

This guide maps each technical area of the role to the code in this repo. The role is a senior frontend product engineer at an AI-powered enterprise learning platform company. Each section has four parts:
- **Read:** the files that show the area, in reading order.
- **Talking points:** what to be able to explain, with the trade-off.
- **Drills:** questions to answer out loud in two minutes or less. Answer them using this repo's code.
- **What production would add:** where this slim version stops, and what you'd build next.

Paths are relative to the repo root. `web/` means `apps/web/src/app/` and `bff/` means `apps/bff/src/`.

Each section has a narrated lesson (audio and video) in [`instructional/`](instructional/), and every lesson's interview questions are collected in [`instructional/interview-questions.md`](instructional/interview-questions.md).

## Suggested order

| Session | Sections | Time |
|---|---|---|
| 1 | Run the five-minute tour in the README; then 1. Architecture, 2. State | 90 min |
| 2 | 3. Routing, 4. Accessibility, 5. Performance | 75 min |
| 3 | 6. REST and contracts, 7. Authentication, 8. Async workflows | 90 min |
| 4 | 9. Testing, 10. CI/CD, 11. Observability | 60 min |
| 5 | 12. Cross-stack, 13. Evolving a large app; then re-answer every drill without notes | 90 min |

---

## 1. Component architecture and design systems

**Read**
- `apps/web/eslint.config.js`: the boundary rules
- [ADR-0001](adr/0001-workspace-and-boundaries.md)
- `web/design-system/index.ts`, `web/design-system/tokens.css`
- `web/design-system/button/button.ts`, `web/design-system/text-field/text-field.ts`
- `web/features/catalog/catalog-page.ts`: a feature composing primitives

**Talking points**
- The layers: design-system → core → shell and features. Features never import each other, and lint enforces it. Shared code moves down a layer; it isn't imported sideways.
- Tokens are CSS custom properties, so theming (light/dark, or a tenant's brand) is a runtime swap of variables. No component re-renders and no rebuild is needed.
- `button[cwButton]` is an attribute component on a native `<button>`. It keeps keyboard handling, form submission and the accessible role for free. A `<cw-button>` wrapper around a `div` loses all of that.
- `cw-text-field` implements `ControlValueAccessor`, so it works with any Angular form. It owns the label, hint and error wiring (`for`/`id`, `aria-describedby`, `aria-invalid`), so a feature can't get them wrong.
- Smart vs presentational: feature pages talk to stores and services; primitives take inputs and emit outputs, and know nothing about HTTP.

**Drills**
1. A team wants to add a date picker to the design system. What must its API guarantee before you'd accept it?
2. Why an attribute selector for the button, not an element selector?
3. Two features need the same "course card". Where does it go, and why not import it from the catalog feature?
4. How would you roll out a breaking change to a design-system component used in 200 places?
5. How do tokens support per-tenant branding without a build per tenant?

**What production would add**
- A published component library (Angular library + ng-packagr), and Storybook with interaction and a11y tests per component.
- Visual regression tests, and a deprecation policy with codemods.

---

## 2. State management and reactive programming

**Read**
- [ADR-0004](adr/0004-signals-and-rxjs-state.md)
- `web/features/catalog/catalog.store.ts`: `signalStore` + `rxMethod`, with `switchMap` and `exhaustMap`
- `web/features/course/enrollment-controller.ts`: `exhaustMap` + `Idempotency-Key` + `retry`
- `web/features/course/course-page.ts` and `web/core/api/coursewright-api.ts`: `httpResource` for a simple, signal-driven read
- `web/core/auth/auth.store.ts`: app-wide state in signals, with a shared in-flight refresh

**Talking points**
- Signals are for state and what derives from it: synchronous, glitch-free and read directly in templates. RxJS is for events over time: debouncing, cancellation and concurrency.
- Pick the flattening operator by its concurrency rule:
  - `switchMap` when the newest wins (search);
  - `exhaustMap` when duplicates must be ignored (submit);
  - `concatMap` when order matters (saves);
  - `mergeMap` for independent, parallel work (prefetch).
- Catch errors inside the inner observable. An error that reaches the outer stream completes it, and search silently stops working.
- One idempotency key per *intent*, reused on retries. A new key per attempt would defeat the point.
- URL state is state: `?q=` makes search shareable, bookmarkable and restorable, and `replaceUrl` keeps the Back button useful.

**Drills**
1. Walk through what happens when a user types "sig", pauses, types "nals", and the first response arrives last.
2. `switchMap` vs `exhaustMap` for a Save button. Which one, and what goes wrong with the other?
3. When would you *not* use a store, and just use a signal in the component?
4. How do signals change change detection in a zoneless app? What still triggers a render?
5. `effect()` vs `computed()`: when is an effect the wrong tool?
6. How would you share one in-flight token refresh between five parallel 401s?

**What production would add**
- Entity collections (`withEntities`), optimistic updates with rollback, and cross-tab sync (`BroadcastChannel`).
- Devtools integration.

---

## 3. Routing

**Read**
- `web/app.routes.ts`: lazy `loadComponent`, `canMatch` guards, the redirect and the wildcard
- `web/core/auth/guards.ts`: `authGuard` returns a `UrlTree` carrying `returnUrl`; `roleGuard('manager')`
- `web/shell/route-focus.ts` and `web/shell/title-strategy.ts`
- `web/features/login/return-url.ts`: the open-redirect guard on `returnUrl`

**Talking points**
- `canMatch` rather than `canActivate`: an unmatched route isn't even downloaded, and the router falls through to the next match.
- Guards return a `UrlTree`, not `false` plus a side-effect navigation. The router handles the redirect atomically.
- `withComponentInputBinding()` binds route params to `input()`s, so the page doesn't inject `ActivatedRoute`.
- `returnUrl` is user-controlled input. Accept only same-app relative paths; `//evil.example` is protocol-relative and would be an open redirect.
- Every route has a title, and a route change moves focus and announces the page (see section 4).

**Drills**
1. `canMatch` vs `canActivate` vs a resolver: when does each run, and what does each cost?
2. Where would you put a "you have unsaved changes" check?
3. How do you keep deep links working behind authentication?
4. How does lazy loading interact with preloading strategies, and when would you preload?

**What production would add**
- `CanDeactivate` for dirty forms, a preloading strategy tuned by analytics, and route-level error boundaries.

---

## 4. Accessibility

**Read**
- `web/shell/shell.ts`: the skip link, and `<main id="main" tabindex="-1">`
- `web/shell/route-focus.ts` and `web/design-system/live-announcer.ts`
- `web/design-system/text-field/text-field.ts`, `web/design-system/progress/progress.ts`
- `web/features/login/login-page.html`: the error summary with `role="alert"`
- `apps/web/e2e/accessibility.spec.ts`: axe (WCAG 2.2 AA) + a keyboard path

**Talking points**
- Single-page apps break two things a page load gives for free: focus reset and "new page" announcements. `route-focus.ts` restores both, by focusing the `h1` and announcing through a polite live region.
- Native elements first (`button`, `a`, `progress`, `select`, `label`). ARIA only fills gaps, and "no ARIA is better than bad ARIA".
- Errors: each field is tied to its message with `aria-describedby`, and `aria-invalid` marks the field. One summary with `role="alert"` announces once, instead of every field shouting.
- Busy isn't disabled. A disabled button drops focus and hides the reason. `aria-busy` plus visual state keeps it focusable.
- Automated checks (axe, the angular-eslint template rules) catch about a third of issues. Keyboard walkthroughs and screen-reader passes catch the rest.

**Drills**
1. A screen-reader user says "nothing happens" after clicking a link in your SPA. What's wrong, and how do you fix it?
2. How do you announce async results ("12 courses found") without announcing every keystroke?
3. Review a custom dropdown built from `div`s. What's missing?
4. Which WCAG 2.2 criteria does a sticky header most often break?
5. How would you make accessibility part of the definition of done for a whole team?

**What production would add**
- Storybook a11y tests per component, and screen-reader test scripts (NVDA, VoiceOver) in the QA plan.
- Forced-colors mode styles, and an accessibility conformance report (VPAT) for enterprise buyers.

---

## 5. Performance

**Read**
- `apps/web/angular.json`: production budgets (initial bundle: warning at 350 kB, error at 500 kB)
- `web/app.routes.ts`: every feature is lazy-loaded
- `web/features/catalog/catalog-page.ts`: `@defer (on viewport)` for the enrollments panel, and `@for … track`
- `bff/routes/courses.ts`: keyset pagination, and the `(tenant_id, title, id)` index
- `web/core/observability/rum.ts`: LCP, INP and CLS from real users (the `web-vitals` library itself is lazy-loaded)
- `web/design-system/forms.ts`: why the text field has its own entry point

**Talking points**
- Measure what users feel: LCP (loading), INP (responsiveness) and CLS (stability), from the field, not only from Lighthouse.
- Budgets in CI turn "the bundle grew" from a quarterly surprise into a failed build.
- Zoneless + OnPush + signals: only components whose signals changed are checked, so there's no global change-detection pass per event.
- `@for` requires `track`. Tracking by `id` lets Angular move DOM nodes instead of recreating them.
- Keyset pagination costs the same on page 1 and page 1,000. `OFFSET` scans and discards everything it skips.
- Debouncing search cuts request volume, and `switchMap` cancels the requests that are no longer wanted.
- Barrels can defeat tree-shaking. Re-exporting `TextField` from the design-system barrel put all of `@angular/forms` (about 56 kB) into every page's initial bundle. A separate entry point, `@cw/design-system/forms`, keeps it in the lazy login chunk. The initial bundle is about 333 kB raw, 92 kB over the wire; a bare Angular 22 app with a router and HttpClient is already about 212 kB.

**Drills**
1. INP is poor on the catalog page for low-end Android devices. How do you find the cause?
2. What goes in the initial bundle, and how do you keep it there?
3. `@defer` vs a lazy route: when would you use each?
4. Why is `OFFSET 10000` slow, and what does a keyset cursor need from the index?
5. How would you render a list of 10,000 rows?

**What production would add**
- SSR with incremental hydration for public catalog pages, and image optimization (`NgOptimizedImage`, responsive `srcset`).
- Lighthouse CI on key pages, virtual scrolling for long tables, and yielding to the main thread in long tasks.

---

## 6. REST APIs and service contracts

**Read**
- `contracts/openapi.yaml`, top to bottom
- [ADR-0002](adr/0002-contract-first-rest.md)
- `web/core/api/models.ts`, `web/core/api/coursewright-api.ts`
- `bff/routes/courses.ts` (ETag, 304, cursor) and `bff/routes/enrollments.ts` (idempotency, 409, 422)
- `bff/contract.ts`: request bodies are validated against the contract's own schemas
- `bff/problem.ts`: RFC 9457 problem details for every error
- `apps/bff/test/contract.test.ts`

**Talking points**
- The contract comes first, and both sides consume generated types. CI fails if the types are stale, and the contract test fails if the server lies.
- Status codes carry meaning the UI uses:
  - `201` created, `202` accepted, `304` not modified;
  - `401` "who are you?" vs `403` "you can't";
  - `404` for another tenant's data (don't leak existence);
  - `409` conflict with current state, `422` valid JSON but meaningless.
- Problem details (RFC 9457) give one error shape, and `traceId` links a support ticket to the logs.
- Idempotency makes retries safe. Store the key with a hash of the request: the same key and body replays the stored response; the same key with a different body is an error.
- A breaking change means removing or renaming a field, tightening validation, or changing a meaning. Adding optional fields isn't one. Version when you must, and prefer additive change.

**Drills**
1. The backend team wants to rename `durationMinutes` to `duration`. Walk through a zero-downtime rollout.
2. Why is an `Idempotency-Key` needed if the button already uses `exhaustMap`?
3. Design the error handling for a form: where does each status code end up in the UI?
4. ETag vs `Cache-Control: max-age`: what does each save, and what does each risk?
5. How would you detect contract drift between two teams' services?

**What production would add**
- `oasdiff` breaking-change checks in CI, consumer-driven contract tests (such as Pact) with the platform services, and a generated client (orval or ng-openapi-gen).
- Rate limits returning `429` + `Retry-After`.

---

## 7. Authentication and authorization

**Read**
- [ADR-0003](adr/0003-auth-token-storage.md)
- `bff/routes/auth.ts`: login, refresh and logout, and the cookie attributes
- `bff/auth/refresh-tokens.ts`: rotation with reuse detection
- `bff/auth/guards.ts`: bearer verification, and `requireRole`
- `web/core/auth/auth.store.ts` and `web/core/auth/auth.interceptor.ts`
- `web/core/auth/guards.ts`

**Talking points**
- The access token is in memory, and the refresh token is in an `HttpOnly; SameSite=Strict; Path=/api/auth` cookie. XSS can use a session while the page is open, but it can't steal a long-lived one.
- Rotation with reuse detection: each refresh token works once. A second use means a copy leaked, so every token for that user is revoked.
- On a 401: refresh once, retry once, share the in-flight refresh between parallel requests, and sign out if the refresh fails. No loops.
- Authorization is enforced on the server. A hidden Reports link is only UX; the server returns `403` for learners, and a test proves it.
- Multi-tenancy: the tenant comes from the verified token, never from a header or the URL. Every query is scoped by `tenant_id`.

**Drills**
1. Where would you store tokens in a SPA, and why not `localStorage`?
2. Walk through OIDC authorization code + PKCE. What does PKCE protect against?
3. What does `SameSite=Strict` stop, and what doesn't it stop?
4. Two tabs refresh at the same moment with rotation on. What happens, and how would you fix it?
5. How do you test that a learner can't export reports?

**What production would add**
- A real identity provider (OIDC + PKCE, SSO/SAML for enterprise tenants), a BFF session in the token-handler pattern, CSRF tokens on cookie-authenticated mutations, MFA, and audit logs.

---

## 8. Asynchronous workflows and event-driven systems

**Read**
- [ADR-0005](adr/0005-async-jobs.md)
- `bff/routes/reports.ts`: `202` + `Location`, the SSE endpoint and the result download
- `bff/jobs/queue.ts`: the `JobQueue` seam, backoff retries and the dead-letter list
- `bff/jobs/report-worker.ts` and `bff/jobs/job-store.ts`: the worker, and the job snapshots that SSE streams
- `web/features/reports/job-progress.ts`: SSE over `fetch`, and the polling fallback
- `web/features/reports/sse.ts`: `parseSse`, a pure parser that handles events split across chunks

**Talking points**
- Accept fast (`202`), work in the background, and report progress by push (SSE), with pull (polling with backoff) as the fallback.
- SSE rather than WebSockets: progress is one-way, SSE is plain HTTP (it proxies and authenticates like any request), and resuming is built in with `id`.
- `EventSource` can't set headers, so read the stream with `fetch` and add the token yourself. A `fetch` call bypasses Angular interceptors.
- At-least-once delivery means consumers must be idempotent. Retries use exponential backoff, and poison messages go to a dead-letter queue instead of blocking the queue.
- The outbox pattern: write the state change and the event in one database transaction, and let a relay publish it. That avoids "saved but never published" (and the reverse).

**Drills**
1. Design bulk-enrolling 5,000 learners from a CSV upload, end to end. Cover the UI, the API, the queue, progress and failure.
2. The SSE connection drops at 60%. What does the user see, and what does the code do?
3. Why is "publish to the queue, then commit to the database" wrong? What's the fix?
4. How do you make a consumer idempotent?
5. When would you pick polling over SSE, even with SSE available?

**What production would add**
- SNS/SQS (or EventBridge) with a redrive policy, an outbox relay in the platform service, and event schemas with versioning.
- Job state in the database, SSE fan-out across BFF instances (Redis pub/sub or a consumer per instance), and presigned S3 URLs for results.

---

## 9. Testing: unit, integration and E2E

**Read**
- Unit (web): `web/features/catalog/catalog.store.spec.ts`, `web/features/course/enrollment-controller.spec.ts`, `web/core/auth/auth.interceptor.spec.ts`, `web/features/reports/job-progress.spec.ts`, `web/design-system/text-field/text-field.spec.ts`
- Integration (BFF): `apps/bff/test/*.test.ts`, which run the real app through `app.inject()` with a real SQLite database
- Contract: `apps/bff/test/contract.test.ts`
- E2E: `apps/web/e2e/*.spec.ts` (Playwright + axe) and `apps/web/playwright.config.ts`

**Talking points**
- Test behaviour, not implementation. The store test asserts that "the stale response is dropped", not "switchMap was called".
- Use fake timers for debounce and backoff; never `sleep`. `HttpTestingController` controls response order, which is how the race is tested.
- Integration tests at the BFF use a real database and real HTTP semantics, with no mocks of the thing under test. They're fast because SQLite runs in memory.
- E2E is for the few journeys that matter. It uses role and label queries (which double as an accessibility check), has no fixed waits, and starts its own servers on separate ports with fresh data.
- Flaky tests are bugs. Retries hide them, so this repo runs with `retries: 0`.

**Drills**
1. What goes in a unit test vs an integration test vs an E2E test for the enroll feature?
2. How do you test a race condition deterministically?
3. An E2E test fails 1 run in 20. What's your process?
4. How do you keep an E2E suite under 10 minutes as the product grows?
5. What does the contract test catch that TypeScript can't?

**What production would add**
- Component tests in Storybook, visual regression, sharded Playwright in CI with `failOnFlakyTests`, mutation testing on core logic, and test data builders.

---

## 10. CI/CD

**Read**
- `.github/workflows/ci.yml`
- The root `package.json` scripts

**Talking points**
- Order the checks cheapest and most likely to fail first: contract drift → lint (including boundaries) → tests → build (budgets) → E2E, which runs only if the rest pass.
- CI runs the same commands a developer runs locally (`pnpm lint`, `pnpm test` and the rest), so "works on my machine" and CI agree.
- A frozen lockfile, a pinned Node version (`.nvmrc`) and a pinned pnpm version (`packageManager`) give reproducible installs.
- Artifacts (the built app, the Playwright report) make failures debuggable without re-running.
- Deployment should be boring:
  - build once, promote the same artifact through environments;
  - use feature flags to decouple deploy from release;
  - roll out progressively (canary), with automated rollback on error-rate or web-vitals regressions.

**Drills**
1. CI takes 25 minutes. How do you get it under 10?
2. What belongs in a pre-merge check vs a post-merge pipeline vs a nightly run?
3. How do you ship a risky frontend change to 5% of tenants first?
4. A deploy raised the INP p75 by 80 ms. How would you have caught it before 100% rollout?

**What production would add**
- Affected-only builds (Nx or turbo), caching, preview environments per pull request, CDN deploys with immutable hashed assets, and feature flags with owners and expiry dates.
- Dependency and secret scanning.

---

## 11. Frontend observability and monitoring

**Read**
- [ADR-0006](adr/0006-observability.md)
- `web/core/observability/trace.interceptor.ts`, `web/core/observability/rum.ts`, `web/core/observability/global-error-handler.ts`
- `bff/observability.ts`: `genReqId`, the `trace_id` log label, `Server-Timing`
- `bff/routes/rum.ts`: the RUM endpoint (accepts `sendBeacon`'s `text/plain`)

**Talking points**
- One trace ID from click to log line: the W3C `traceparent` header travels from the browser to the BFF, lands on every log line, and comes back in errors.
- RUM from real users: web vitals and client errors, sent with `sendBeacon` when the page is hidden, so the data survives unload.
- A global `ErrorHandler` reports errors with context (route, trace ID). A user-visible message never shows a stack trace.
- Alert on symptoms users feel (error rate, latency percentiles, web vitals), not on causes. SLOs with burn-rate alerts avoid paging on noise.

**Drills**
1. A tenant reports "the catalog is slow since Tuesday". Walk through your investigation.
2. How do you connect a frontend error to the backend request that caused it?
3. What would you put on a dashboard for the catalog team?
4. Define an SLO for search, and the alert for it.

**What production would add**
- OpenTelemetry web and Node SDKs exporting OTLP to a collector, then to Tempo, Prometheus/Mimir and Loki (or a vendor).
- Session replay with privacy masking, source-map upload for readable stack traces, and sampling policies.

---

## 12. Cross-stack: Node/TypeScript, PHP, AWS, relational databases

**Read**
- `apps/bff/src/app.ts`: Fastify plugins, hooks, the error handler and route registration
- `bff/db.ts` and `bff/seed.ts`: the schema, indexes and a deterministic seed
- `bff/routes/enrollments.ts`: a transaction-shaped handler, and why the unique constraint matters

**Talking points**
- The BFF's job: shape APIs for one frontend, own the session, aggregate platform services, and enforce auth and tenancy at the edge. It isn't a second business-logic tier.
- Relational basics the frontend feels:
  - indexes that match the query (`(tenant_id, title, id)` for the catalog);
  - unique constraints as the last line against duplicates;
  - N+1 queries behind "why is this list slow".
- **PHP platform services** (not in this repo): in a typical Laravel service, a controller calls a service or policy, which uses Eloquent models; API Resources shape the JSON. Policies are the real authorization boundary. Reading one well is enough to make a targeted change: follow the route file to the controller, then to the resource.
- **AWS mapping for this repo:**

  | This repo | AWS |
  |---|---|
  | `JobQueue` | SQS with a DLQ, fed by SNS or EventBridge |
  | CSV result | An S3 object behind a presigned URL |
  | Static web app | S3 + CloudFront |
  | BFF | Containers on ECS/Fargate, or Lambda |
  | Secrets | Secrets Manager |
  | Logs and traces | CloudWatch or an OTel backend |

**Drills**
1. You need a new field in the catalog that lives in a PHP service owned by another team. Walk through the change across every layer.
2. Read a slow SQL query plan. What do you look for first?
3. Why does the BFF return `404` rather than `403` for another tenant's course?
4. Where would you put rate limiting, and why there?

**What production would add**
- The PHP platform services behind the BFF (with contract tests on that boundary too), MySQL with migrations owned by the platform, and infrastructure as code (Terraform or CDK).

---

## 13. Evolving a large application

This is the leadership side of the role: multi-sprint initiatives, technical debt, code review and mentoring.

**Talking points**
- **Boundaries before refactors.** Make the architecture executable (lint rules, contracts, budgets) so that improvements stick.
- **Strangle, don't rewrite.** Route by route, behind a stable URL and contract, each step shippable and reversible.
- **Tech debt as a portfolio.** Name each item, estimate its interest (incidents, slowed features), and pay down the items with the highest interest alongside feature work.
- **Reviews teach.** Explain the *why* and link the ADR. Separate "must fix" from "consider", and automate taste (lint, format) so humans review design.
- **ADRs record context,** so the next team knows why, not just what. This repo has six.

**Drills**
1. Tell me about a multi-sprint frontend initiative you led. How did you sequence it, and how did you know it worked?
2. How do you decide between paying down tech debt and shipping a feature?
3. You disagree with a senior backend engineer about an API shape. How do you resolve it?
4. How do you raise the quality bar of a team without becoming the bottleneck?
5. Walk me through reviewing a pull request that adds a new feature folder importing from another feature.

---

## Before the interview

- [ ] Run `pnpm install && pnpm test && pnpm e2e` once, so you've seen everything pass.
- [ ] Do the README's five-minute tour with devtools open.
- [ ] Answer every drill out loud without notes. Mark the ones you can't finish in two minutes, and re-read their files.
- [ ] Pick three files you'd happily walk through on a shared screen: for example, the catalog store, the auth interceptor and `job-progress.ts`.
