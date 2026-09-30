# 11 · CI/CD and Frontend Observability

> **Runtime:** ~22 min · **Level:** Senior · **Study guide:** [§10 CI/CD](../../study-guide.md#10-cicd) and [§11 Frontend observability and monitoring](../../study-guide.md#11-frontend-observability-and-monitoring) · **Prerequisites:** [06](../06-performance-budgets-and-web-vitals/), [07](../07-contract-first-rest-from-the-frontend/), [10](../10-testing-unit-integration-and-e2e/)

**Video:** [11-ci-cd-and-frontend-observability.mp4](11-ci-cd-and-frontend-observability.mp4) · [Slides](slides.html) · **Audio lesson:** [11-ci-cd-and-frontend-observability.mp3](11-ci-cd-and-frontend-observability.mp3) · [Transcript](script.md)

## Why this video exists

Two reports reach every frontend team: "the catalog is slow" and "I got an error". A weak answer to either is "I'd look at the logs". A strong answer shows how a change reached production, how it could be turned off, and how one ID leads from the user's screen to the server's log lines. This video builds that answer from Coursewright's code:
- a CI pipeline ordered cheapest-and-most-likely-to-fail first, running the same commands a developer runs locally;
- reproducible installs and artifacts that make failures debuggable without a re-run;
- what production would add after CI: build once and promote, hashed assets, feature flags by tenant, and rollback on web vitals;
- a W3C `traceparent` from the browser, the trace ID as the BFF's request ID, `trace_id` on every log line, and `traceId` in every problem;
- real-user monitoring sent with `sendBeacon`, and alerting on symptoms with SLOs and burn rates.

It's also honest about where the repo stops: handled errors aren't beaconed, and the trace ID isn't on screen yet.

## Learning objectives

By the end, the viewer can:

- Walk through `.github/workflows/ci.yml` and justify its order: contract drift, lint, tests, build with budgets, then E2E behind `needs: verify`.
- Explain what makes the pipeline reproducible (frozen lockfile, `packageManager`, `.nvmrc`), and name the precise limit: `.nvmrc` pins only the major version.
- Describe a production release path: build once and promote, content-hashed assets with a revalidated `index.html`, flags by tenant, and progressive rollout with automatic rollback.
- Follow one trace ID from `trace.interceptor.ts` through `genReqId` and the `trace_id` log label to the response's `traceparent`, `Server-Timing` and the problem's `traceId`.
- Explain how `rum.ts` sends data (batched, on `visibilitychange` to hidden, via `sendBeacon` as `text/plain`) and how the BFF accepts it.
- Define an SLO with burn-rate alerts, and walk through a "slow since Tuesday" investigation.

## Interview questions this prepares you for

| Question | What a strong answer includes |
|---|---|
| How do you connect a frontend error to the backend request that caused it? | One W3C trace ID. `traceInterceptor` adds `traceparent` to every `/api/` call; it runs before `authInterceptor`, so a refresh-and-retry keeps the same trace. The BFF's `genReqId` makes the trace ID the request ID, and a `LogController` labels every pino line `trace_id`. The response carries `traceparent` (same trace, new span) and every problem+json body carries `traceId`. `GlobalErrorHandler` reads the trace ID from an `HttpErrorResponse` and beacons it with the error. Name the gaps: handled errors (the catalog store's `problemMessage`) never reach the handler, and the screen doesn't show the ID. Fix: a short reference code in the message. |
| CI takes 25 minutes. How do you get it under 10? | Measure the critical path first. Cheapest, most-likely-to-fail checks first. Cache the package store (Coursewright does), the Angular build cache and the Playwright browsers (it doesn't). Split independent checks into parallel jobs and shard E2E. Keep E2E to the journeys that matter. Test the built artifact instead of building twice. Move slow, low-signal checks after merge or nightly. Affected-only runs once there's a project graph (ADR-0001's "when to revisit"). Trade-off: `needs: verify` saves runner minutes on red builds but adds latency on green ones. |
| How do you ship a risky frontend change to 5% of tenants first? | Deploy dark behind a feature flag and release by tenant; the tenant comes from the verified token, so the BFF can decide. Bucket by a stable hash of the tenant ID. Internal tenant, then 5%, then ramp. Compare cohorts on error rate and web vitals, which needs the release and flag on every RUM event. Flag off is the rollback, with no redeploy. Every flag has an owner and an expiry date. |
| A deploy raised INP p75 by 80 ms. How would you have caught it before 100% rollout? | INP is a field metric; lab tests alone won't reliably catch it. Tag RUM events with the release, roll out to a small cohort, compare the cohort's p75 with the previous release, and halt automatically past a threshold with enough samples. Before merge: budgets and lab proxies such as total blocking time. Afterwards the release tag points at the change. Coursewright's `RumEvent` has no release field yet: add it to `openapi.yaml` first. |
| "The catalog is slow since Tuesday." Walk through your investigation. | Define slow: first load (LCP), typing (INP) or results (server latency). Find what changed Tuesday: deploy, flag, tenant data. Split the time with `Server-Timing` vs the total request time. If it's the server, compare `GET /api/courses` response times for that tenant before and after (the `request completed` line has `responseTime`), then the query plan. In Coursewright the search is `title LIKE '%q%'`: the `(tenant_id, title, id)` index narrows by tenant and orders by title, but a leading wildcard can't seek, so a rare term reads the tenant's whole catalog. Fix, confirm on the same metric, add the alert. Note that RUM events carry no tenant yet. |
| What belongs pre-merge, post-merge and nightly? | Pre-merge: fast, deterministic and gating: `contracts:check`, lint with boundaries, unit, integration and contract tests, the build with budgets, and critical-journey E2E with axe (what Coursewright runs). Post-merge: build once, deploy the artifact to staging, smoke tests, broader E2E, Lighthouse on key pages, then progressive promotion. Nightly: the full browser matrix, visual regression, dependency and vulnerability scans (so an overnight advisory doesn't turn every open PR red), and flaky-test reports. Everything moved later still has an owner. |
| Define an SLO for search, and the alert for it. | ADR-0006's example: 99% of catalog searches render within 1 s, over 30 days. The 1% is the error budget. Measure from real users, with the BFF's `GET /api/courses` response time as a second view, because some browsers block beacons. Count 5xx as bad events. Alert on burn rate: page when the last hour would spend ~2% of the budget (about 14× the sustainable rate), confirmed by a short window; open a ticket for a slow burn over several hours. No paging on single slow requests. |
| What would you put on a dashboard for the catalog team? | The search SLO and its remaining budget. Rate, errors and p50/p95/p99 latency for `GET /api/courses` and `GET /api/courses/{courseId}`. RUM p75 LCP, INP and CLS for catalog pages, split by release. The client error rate from RUM. The largest tenants' latency. Deploy and flag-change markers on every chart, so "since Tuesday" lines up with a change. |

## Coursewright code on screen

| File | What to show |
|---|---|
| `.github/workflows/ci.yml` | `permissions: contents: read`; `concurrency` with `cancel-in-progress`; the verify steps in order; `needs: verify`; `--frozen-lockfile`; `node-version-file: .nvmrc` and `cache: pnpm`; both `upload-artifact` steps (`if: ${{ !cancelled() }}`) |
| `package.json` (root), `.nvmrc`, `pnpm-workspace.yaml` | The scripts CI calls; `"packageManager": "pnpm@12.6.0"`; `engines`; `.nvmrc` is `22` (major only); the workspace packages |
| `apps/web/angular.json` | The `initial` budget (warning 350 kB, error 500 kB); `"outputHashing": "all"` |
| `apps/web/playwright.config.ts` | `trace: 'retain-on-failure'`; `retries: 0`; the `webServer` that runs `ng serve`, not the built artifact |
| `docs/adr/0006-observability.md` | The two reports in Context; the decision; "Logs aren't traces" and "RUM is only logged"; the production mapping and SLO example |
| `apps/web/src/app/core/observability/trace.interceptor.ts` | `createTraceparent`; the "every call gets its own trace" comment; `/api/` only |
| `apps/web/src/app/app.config.ts` | `provideBrowserGlobalErrorListeners()`; the `ErrorHandler` provider; interceptor order with its comment |
| `apps/bff/src/observability.ts` | `traceIdFrom` (all-zero IDs rejected); `genReqId`; `LogController` with `requestIdLogLabel: 'trace_id'`; the `onRequest` and `onSend` hooks |
| `apps/bff/src/problem.ts` | `traceId: reply.request.id` in every problem; the 500 branch that hides internals |
| `apps/bff/test/observability.test.ts` | Same trace, new span, `traceId` in the 401; new trace on bad headers; `Server-Timing` everywhere; `text/plain` beacons accepted |
| `apps/web/src/app/core/observability/rum.ts` | Lazy `web-vitals`; `MAX_BATCH`; `visibilitychange` to hidden; `sendBeacon` with a string body |
| `apps/bff/src/routes/rum.ts` | The scoped `text/plain` parser; `public: true`; `$ref: 'RumBatch#'`; 202 |
| `apps/web/src/app/core/observability/global-error-handler.ts` | `describe()` reading `traceparent` from an `HttpErrorResponse` |
| `apps/web/src/app/core/problem.ts` | `problemMessage` returns `detail ?? title`: the trace ID isn't shown |
| `apps/bff/src/routes/courses.ts` | `searchCourses`: `LIKE '%…%'` with the tenant filter, for the "slow since Tuesday" walk-through |

## Run sheet

| Time | Segment | Content |
|---|---|---|
| 00:00–01:30 | Hook | The five questions. Thesis: every release reversible, every error traceable. |
| 01:30–03:15 | The pipeline | Triggers, least-privilege token, concurrency. The two-job diagram. Contract drift → lint → tests → build (budgets) → E2E behind `needs: verify`. The same commands a developer runs. |
| 03:15–04:45 | Reproducible and debuggable | Frozen lockfile, `packageManager`, `.nvmrc` (major only: be precise). What's cached and what isn't. Artifacts and Playwright traces. |
| 04:45–06:45 | To production | Build once and promote (the gap: E2E runs `ng serve`). Hashed assets vs `index.html`; keep old chunks. Flags by tenant (sketch). Cohort comparison and automatic rollback. |
| 06:45–09:45 | One trace ID | ADR-0006's two reports. The `traceparent` anatomy. The interceptor and its order. `genReqId`, `trace_id` on real log lines. The hooks. Problems with `traceId`. The test. |
| 09:45–11:30 | Real-user monitoring | Lazy `web-vitals` (lesson 06). Batching and `visibilitychange`. `sendBeacon` constraints. The BFF's scoped `text/plain` parser. `GlobalErrorHandler`. |
| 11:30–13:00 | Error to request | The full-trip diagram. The three gaps and the small fix. **Demo** (below). |
| 13:00–15:00 | Alerting | Symptoms, not causes. The search SLO, error budget and burn rates. The "since Tuesday" investigation, down to the `LIKE` query. |
| 15:00–16:30 | Production and traps | OpenTelemetry, source maps, release and tenant on RUM. The eight traps. |
| 16:30–21:00 | Drill and recap | Five questions, then the five points. |

## Code excerpts

### The pipeline: cheapest and most likely to fail first

```yaml
# .github/workflows/ci.yml (condensed)
jobs:
  verify:
    name: Contract, lint, test, build
    steps:
      - run: pnpm install --frozen-lockfile
      - name: Contract drift
        run: pnpm contracts:check
      - name: Lint (includes architectural boundaries)
        run: pnpm lint
      - name: Unit and integration tests (includes the BFF contract test)
        run: pnpm test
      - name: Build (fails on Angular bundle budgets)
        run: pnpm build
  e2e:
    name: End-to-end + accessibility
    needs: verify
```

### A trace per call, from the browser

```ts
// apps/web/src/app/core/observability/trace.interceptor.ts
// Every call gets its own trace, which the BFF continues and returns in problem+json `traceId`,
// so a user-reported error leads straight to the server logs for that request.
export const traceInterceptor: HttpInterceptorFn = (request, next) =>
  request.url.startsWith('/api/')
    ? next(request.clone({ setHeaders: { traceparent: createTraceparent() } }))
    : next(request);
```

### The trace ID as the request ID, on every log line

```ts
// apps/bff/src/observability.ts
export const traceLogging = {
  genReqId: (request: IncomingMessage) =>
    traceIdFrom(request.headers.traceparent) ?? randomBytes(16).toString('hex'),
  logController: new LogController({ requestIdLogLabel: 'trace_id' }),
};

export function registerObservability(app: FastifyInstance): void {
  app.decorateRequest('startTime', 0);

  app.addHook('onRequest', async (request, reply) => {
    request.startTime = performance.now();
    // Same trace, new span id: this server's work is a child of the caller's span.
    reply.header('traceparent', `00-${request.id}-${randomBytes(8).toString('hex')}-01`);
  });

  app.addHook('onSend', async (request, reply) => {
    // Browsers show Server-Timing in DevTools and expose it to RUM via PerformanceResourceTiming.
    const duration = performance.now() - request.startTime;
    reply.header('server-timing', `app;dur=${duration.toFixed(1)}`);
  });
}
```

### The beacon

```ts
// apps/web/src/app/core/observability/rum.ts
private flush(): void {
  if (this.batch.length === 0) return;
  const body: RumBatch = { events: this.batch };
  this.batch = [];
  // sendBeacon survives the page going away, but can't set headers, so /api/rum is
  // unauthenticated. A string body is sent as text/plain, which the BFF accepts.
  navigator.sendBeacon('/api/rum', JSON.stringify(body));
}
```

```ts
// apps/bff/src/routes/rum.ts
// navigator.sendBeacon(url, string) sends the JSON as text/plain. Parse that as JSON too, with
// Fastify's own safe parser (it rejects __proto__ tricks). The parser is scoped to this plugin.
app.addContentTypeParser(
  'text/plain',
  { parseAs: 'string' },
  app.getDefaultJsonParser('error', 'error'),
);
```

### Closing the gap: a reference the user can quote (sketch, not in this repo)

```ts
// A sketch for core/problem.ts: the first 8 characters of the trace ID, shown with the message.
export function problemReference(error: unknown): string | undefined {
  if (!(error instanceof HttpErrorResponse) || !isProblem(error.error)) return undefined;
  return error.error.traceId?.slice(0, 8);
}
// In the catalog store's catch: patchState(store, { error: problemMessage(error), reference: problemReference(error) });
// and, for status >= 500, inject(Rum).recordError(...) so handled server errors are beaconed too.
```

### A flag decided from the verified tenant (sketch, not in this repo)

```ts
const flags = {
  newCatalog: { owner: 'catalog-team', expires: '2026-12-31', percent: 5 },
};

app.get('/me/flags', async (request) => ({
  newCatalog: inRollout(request.user.tenantId, flags.newCatalog.percent), // stable hash of the tenant ID
}));
```

## Demo

```bash
# The pipeline, as CI runs it: the same commands, in the same order
pnpm contracts:check
pnpm lint
pnpm test
pnpm build

# Just the trace and RUM tests (13 tests)
pnpm --filter @coursewright/bff test observability

# Where the trace ID lives
git grep -n "traceparent" -- apps/web/src apps/bff/src
git grep -n "trace_id\|genReqId\|server-timing" -- apps/bff/src

# Run both apps: web on http://localhost:4200, BFF on http://localhost:3000
pnpm dev
```

In the browser, sign in as `learner.acme` (password `Coursewright2026!`) with DevTools open:

1. **Network:** search the catalog and select the `courses?q=…` request. The request's `traceparent` and the response's `traceparent` share the same 32-character trace ID; the span ID differs.
2. **Timing tab** of the same request: "Server Timing" shows `app` with the BFF's duration.
3. **The BFF's terminal:** find the `incoming request` and `request completed` lines with the same `trace_id`.
4. **An error:** open `http://localhost:4200/courses/nope`. The response body is a problem with `"status":404` and a `traceId`. The page shows the detail, not the ID: that's the gap.
5. **RUM:** switch to another tab and back. A `rum` request of type `ping` goes to `/api/rum` with a `text/plain` body, and the BFF logs `rum event` lines.

## Traps to call out

- **E2E before the cheap checks.** Fifteen minutes to learn about a lint error. Order by cost and failure likelihood.
- **A floating toolchain.** Without `--frozen-lockfile` and pinned versions, two runs of one commit build different code. `.nvmrc` here pins only the major version.
- **Rebuilding per environment.** What you tested isn't what you shipped. (Coursewright's E2E runs `ng serve`, not `web-dist`.)
- **Deleting the previous release's chunks on deploy.** Open tabs still hold the old `index.html`; their next lazy route fails to load.
- **Sending RUM on unload.** Mobile browsers often never fire it. Flush on `visibilitychange` to hidden, as `rum.ts` does.
- **A trace ID that stops at the server.** If it isn't in the error the user sees, support can't use it. Coursewright's `problemMessage` doesn't show it yet.
- **Personal data in RUM.** `rum.ts` sends `document.location.href`, so `?q=` search text lands in the logs. Strip or allowlist query parameters.
- **Alerting on causes.** CPU and restarts page people for noise. Alert on error rate, latency percentiles and web vitals, through burn rates.

## Key terms

CI pipeline ordering · `needs` · `concurrency` / `cancel-in-progress` · least-privilege `permissions` · frozen lockfile · `packageManager` · `.nvmrc` · artifacts · Playwright trace · build once, promote · content-hashed assets · version skew · feature flags · canary / progressive rollout · W3C Trace Context (`traceparent`) · trace ID / span ID · `genReqId` · structured logging (pino) · `Server-Timing` · RFC 9457 problem details · RUM · `sendBeacon` · `visibilitychange` · `ErrorHandler` · SLI / SLO / error budget · burn-rate alert · OpenTelemetry · source maps

## After the video

1. Close the on-screen gap: show the first eight characters of the problem's `traceId` with the catalog's error message, and add a unit test for it. Decide whether handled 5xx errors should also go through `Rum.recordError`.
2. Add a `release` field to `RumEvent` in `contracts/openapi.yaml`, run `pnpm contracts:generate`, and thread it through `rum.ts`. Notice which tests fail first, and why.
3. Redesign `ci.yml` for speed: split verify into parallel jobs, cache the Angular build and the Playwright browser, and run E2E against `web-dist`. Estimate what each change saves, and what each costs in runner minutes.

## References

- [`docs/study-guide.md`](../../study-guide.md), sections 10 and 11
- [ADR-0006: trace context, structured logs, real-user metrics](../../adr/0006-observability.md)
- [ADR-0001: workspace and boundaries](../../adr/0001-workspace-and-boundaries.md) (when to move to affected-only builds) and [ADR-0002: contract-first REST](../../adr/0002-contract-first-rest.md) (`contracts:check`)
- W3C Trace Context recommendation (the `traceparent` header); W3C Server Timing
- MDN: `Navigator.sendBeacon()`, the Page Visibility API, `PerformanceResourceTiming.serverTiming`
- Fastify documentation: logging, `genReqId`, `addContentTypeParser`, hooks
- Angular documentation: HTTP interceptors, `ErrorHandler`, `provideBrowserGlobalErrorListeners` (check its behaviour for your version)
- GitHub Actions documentation: `concurrency`, `needs`, artifacts, `actions/setup-node` caching
- Google's Site Reliability Workbook: "Alerting on SLOs" (multiwindow, multi-burn-rate alerts)
- OpenTelemetry JavaScript documentation: web and Node SDKs, the collector
