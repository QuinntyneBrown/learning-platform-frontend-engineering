# 11 · CI/CD and Frontend Observability

Welcome. This lesson is about what happens after the code is written: how a change reaches production safely, and how you find out what it's doing once it's there. By the end of it, you should be able to justify the order of Coursewright's continuous integration pipeline, explain how you'd release a frontend change without a big bang, and follow one trace ID from a browser request to the backend's log lines and back into an error report.

## The questions this lesson answers

Here are the questions this lesson prepares you for. How do you connect a frontend error to the backend request that caused it? Continuous integration takes twenty-five minutes: how do you get it under ten? How do you ship a risky frontend change to five percent of tenants first? A deploy raised the seventy-fifth percentile of INP by eighty milliseconds: how would you have caught it before it reached everyone? And a tenant reports that the catalog has been slow since Tuesday: walk through your investigation.

Keep one sentence in your head while you listen. Every release should be reversible, and every error should be traceable. The pipeline and the rollout make the first true. One trace ID makes the second true.

## The pipeline, in order

Open `.github/workflows/ci.yml`. It runs on every pull request and every push to main. The workflow's token can only read the repository, which is least privilege. And a concurrency group per branch cancels a run that's still going when a newer commit arrives, so nobody waits for stale results.

Then there are two jobs. The first, called verify, runs four checks, and the order is deliberate: the cheapest checks, and the ones most likely to fail, go first. Contract drift comes first. `pnpm contracts:check` regenerates the types from `openapi.yaml` and fails if git finds any difference, in seconds. Lint comes next, including the architectural boundaries from lesson one. Then the tests: the BFF's integration and contract tests, and the web app's unit tests. Then the production build, which fails if the bundle budgets in `angular.json` are exceeded. That's the guardrail from lesson six.

The second job runs Playwright and axe, and it declares `needs: verify`, so it only starts when everything else is green. End-to-end tests are the slowest checks and the hardest to debug, so there's no point running them against a change that doesn't even lint.

Notice what the steps run: the same lint, test, build and end-to-end commands a developer runs locally, defined once in the root `package.json`. If a step fails in CI, you run the same command and see the same failure.

## Reproducible and debuggable

A pipeline you can't reproduce is one you can't trust. Three settings make installs repeatable. Installing with pnpm's frozen lockfile flag fails if the lockfile doesn't match the package files, instead of quietly resolving new versions. The pnpm version is pinned in the root `package.json`, at twelve point six. And the Node version comes from one file, `.nvmrc`.

Be precise about that last one. The `.nvmrc` file says twenty-two, the major version only, so CI can get any Node twenty-two release. Production would pin the exact version, so a Node release can't change the build between two runs of the same commit.

Caching is modest. The Node setup action caches the package store, keyed on the lockfile. There's no build cache, and Playwright's browser is installed from scratch on every run. Those are the first places to look when the pipeline gets slow.

And failures are debuggable without a re-run. The verify job uploads the built app as an artifact called `web-dist`. The end-to-end job uploads the Playwright report unless the run was cancelled, and Playwright keeps a trace for every failed test. So you open the trace and see the page, the network and the console at the moment it failed.

## From a green build to production

Coursewright stops at continuous integration: there's no deploy job. So here you talk about what production would add.

First, build once and promote. The artifact that passed the tests is the artifact that ships, promoted unchanged from staging to production. Rebuilding for each environment means production runs something that was never tested. And notice a gap here: the end-to-end job doesn't test the `web-dist` artifact. It runs the Angular dev server. A real pipeline would test the built files.

Second, deploying a single-page app is mostly about caching. The production build puts a content hash in every JavaScript and CSS file name, so a CDN can cache those files for a year as immutable. The one file without a hash, `index.html`, is revalidated on every load, because it points at the current release. And keep the previous release's files for a while. A user with the app already open still has the old `index.html`, and their next lazy route asks for an old chunk.

Third, decouple deploy from release with feature flags. The code ships dark, and a flag decides who sees it. In a multi-tenant product, the natural unit is the tenant: your own internal tenant first, then five percent of customer tenants, then more. The tenant comes from the verified token, as lesson eight explains, so the BFF can decide. Every flag gets an owner and an expiry date, or it becomes a permanent branch.

Fourth, roll out progressively, and roll back automatically. Compare the cohort that has the change with the cohort that doesn't, on error rate and web vitals, and turn the flag off when the new cohort is measurably worse. That needs data from real users, which brings us to observability.

## One trace ID, from the browser to the log line

Open ADR six, the observability decision. Its context names the two most common frontend reports: "the catalog is slow" and "I got an error". To act on either, you need to know what this user's requests did on the server, and how the page performs for real users.

The first answer is a trace ID. Open `core/observability/trace.interceptor.ts`. For every API request, the interceptor adds a W3C `traceparent` header: a version, zero zero; a trace ID of thirty-two hex characters; a parent span ID of sixteen; and flags, zero one, meaning sampled. Every call gets its own trace.

The order of the interceptors matters. In `app.config.ts`, `traceInterceptor` comes before `authInterceptor`, and the comment says why: tracing runs first, so a refresh-and-retry keeps the same `traceparent`. When lesson eight's auth interceptor retries after a refresh, both attempts share one trace ID in the logs.

Now the server, `apps/bff/src/observability.ts`. Fastify lets you choose how each request's ID is generated, with `genReqId`. Coursewright's version parses the incoming `traceparent`, and if it's valid, the trace ID becomes the request ID. If it's missing, malformed, or all zeros, the BFF starts a fresh trace. Then a `LogController` whose request ID label is `trace_id` makes Fastify's logger, pino, put that ID on every log line for the request: the incoming line, the completed line with its response time, and anything a handler logs.

Two response headers close the loop. An `onRequest` hook returns a `traceparent` with the same trace ID and a new span ID, because the server's work is a child of the browser's span. An `onSend` hook adds `Server-Timing`, the time the BFF spent on the request. Browsers show it in DevTools and expose it to real-user monitoring, so you can tell how much of the wait was the server.

And every error carries the ID. `apps/bff/src/problem.ts` puts `traceId` in every problem details body. A five hundred hides the internals, and the comment says why that's fine: the trace ID in the body finds the log line.

The tests pin this down. `apps/bff/test/observability.test.ts` sends a known `traceparent` without a token, and asserts that the response continues the same trace with a new span ID, and that the four-oh-one problem carries the same trace ID. It also checks that a bad header starts a new trace, and that `Server-Timing` is on every response.

## Real-user monitoring

The second answer is real-user monitoring, in `core/observability/rum.ts`. Lesson six covers what it measures: LCP, INP and CLS, through the lazily loaded `web-vitals` library. This lesson is about how the data leaves the page.

Events are batched, and a batch is sent at ten events, or when the page becomes hidden. Why hidden, and not unload? Because mobile browsers may discard a background tab without ever firing unload.

The batch goes out with `navigator.sendBeacon`. A beacon survives the page going away, and doesn't compete with the user's requests. It has two constraints, and the code handles both. It can't set headers, so there's no bearer token, and the RUM endpoint is public. And a string body is sent as `text/plain`. So `apps/bff/src/routes/rum.ts` registers a parser for `text/plain`, scoped to that one plugin, that reuses Fastify's own JSON parser. The body is validated against the contract's `RumBatch` schema, and each event is logged. Production would add rate limiting, because the endpoint is public.

Errors take a different path. `app.config.ts` turns on Angular's global error listeners for the browser, which send uncaught errors and unhandled promise rejections to the `ErrorHandler`, and swaps in Coursewright's own handler. Open `core/observability/global-error-handler.ts`. It logs the error and records it through RUM. If it's an HTTP error response, it reads the trace ID from the response's `traceparent` header, so the client error arrives already linked to its server request.

## Connecting an error to its request

Put the pieces together, because this is the core question of the lesson. The failing request carried a `traceparent` that the browser generated. The BFF made that trace ID the request ID, so every log line for the request has the same `trace_id`. The response carried the ID back twice: in the `traceparent` header, and in the problem body's `traceId`. And if the error went unhandled, the global handler beaconed it with that ID. So one search for thirty-two hex characters finds the browser's error event and every server log line for that request.

Now be honest about the gaps, because a senior answer includes them. First, Coursewright's features catch most HTTP errors themselves. The catalog store turns an error into a message with `problemMessage`, from `core/problem.ts`, so handled errors never reach the global handler and are never beaconed. Second, `problemMessage` shows the problem's detail or title, but not its trace ID, so the user has nothing to quote to support. The fix is small: show a short reference code with the message, and record handled server errors in the same helper. Third, every call gets its own trace, so a click that makes two requests produces two trace IDs. Tying them to the click needs a root span for the interaction, which OpenTelemetry's user-interaction instrumentation adds.

## Alerting on what users feel

Collecting data isn't monitoring. The ADR admits that RUM is only logged: nothing aggregates it into percentiles or alerts.

Alert on symptoms users feel, not on causes. A CPU spike nobody notices isn't worth waking someone for; a four-second search is. The tool is a service level objective, and the ADR's example is a good one: ninety-nine percent of catalog searches render within one second. The one percent that may miss is your error budget. Measure it from real users, with the BFF's response time as a second view, because some browsers block beacons.

Then alert on how fast you're spending the budget. A fast-burn alert pages someone when the last hour would spend about two percent of a thirty-day budget, a burn rate of roughly fourteen. A slow-burn alert over several hours opens a ticket instead. That avoids paging on noise, and still catches a real regression within minutes.

Now the investigation. A tenant says the catalog has been slow since Tuesday. First, pin down what slow means: the first load, which is LCP; typing, which is INP; or waiting for results, which is server latency. Second, find what changed on Tuesday: a deploy, a flag, or the tenant's data. Third, split the time: `Server-Timing` against the total request time tells you whether it's the server. If it is, compare that endpoint's response times for the tenant before and after. In Coursewright, the search filters titles with a `LIKE` pattern that starts with a wildcard, so a rare term can read every course the tenant has, and a bulk import makes that slower. Then fix it, confirm the fix on the same metric, and add the alert that would have told you first.

## What production would add

The ADR's production mapping is short. Add the OpenTelemetry web and Node SDKs, exporting to a collector that redacts, samples and forwards to a tracing and metrics backend. Because Coursewright already uses the W3C header, that changes exporters, not the contract. Upload source maps, so minified stack traces become readable. And add a release version and a tenant to every RUM event, so a regression can be split by release, flag and tenant. That's a contract change first, in `openapi.yaml`.

## Traps

Here are the traps to call out.

Running end-to-end tests before the cheap checks. You wait fifteen minutes to learn about a lint error.

A floating toolchain. Without a frozen lockfile and pinned versions, two runs of one commit can build different code.

Rebuilding for each environment. What you tested isn't what you shipped.

Deleting the previous release's chunks on deploy. Every open tab breaks on its next lazy route.

Sending RUM on unload, which mobile browsers often never fire.

A trace ID that never reaches the error the user sees.

Personal data in RUM. Coursewright's events carry the full page address, and a query string can hold a learner's search text.

And alerting on causes rather than symptoms, until people stop reading the pages.

## Interview drill

Let's practise. After each question there's a short pause. Pause the audio if you want more time, answer out loud, and then compare your answer with the model answer.

**Interviewer:** How do you connect a frontend error to the backend request that caused it?

[pause 5s]

With one W3C trace ID. An interceptor adds a `traceparent` header to every API call, and the BFF makes its trace ID the request ID, so every log line for that request carries `trace_id`. The BFF returns the ID in the response header and in every problem body's `traceId`. The global error handler reads it from the failed response and beacons it with the error, so one search finds both sides. I'd also show a short reference code with the error message, for support.

**Interviewer:** Continuous integration takes twenty-five minutes. How do you get it under ten?

[pause 5s]

Measure first: which steps dominate the critical path. Keep cheap checks first, so failures come fast. Cache what every run rebuilds: the package store, the build cache and the Playwright browsers. Run independent checks as parallel jobs, shard the end-to-end suite, and keep it to the journeys that matter. Test the built artifact instead of building twice. Move slow, low-signal checks after merge or nightly. And once there's a project graph, run only what a change affects.

**Interviewer:** How do you ship a risky frontend change to five percent of tenants first?

[pause 5s]

Deploy it dark behind a feature flag, and release it by tenant, since the tenant comes from the verified token. Turn it on for an internal tenant, then five percent of customers, and compare that cohort with the rest on error rate and web vitals, which means RUM events need the release and flag as dimensions. Ramp up while it's healthy. If it isn't, turning the flag off is the rollback, with no redeploy. And the flag gets an owner and an expiry date.

**Interviewer:** A deploy raised the seventy-fifth percentile of INP by eighty milliseconds. How would you have caught it before it reached everyone?

[pause 5s]

INP is a field metric, so lab tests alone won't reliably catch it. I'd tag every RUM event with the release, roll out to a small cohort first, and compare the cohort's seventy-fifth percentile with the previous release's, halting automatically when the difference crosses a threshold with enough samples behind it. Before merge, budgets and lab measures like total blocking time catch the obvious cases. Afterwards, the release tag says exactly which change to look at.

**Interviewer:** A tenant reports that the catalog has been slow since Tuesday. Walk through your investigation.

[pause 5s]

First, define slow: the first load, typing, or waiting for results. Then find what changed on Tuesday: a deploy, a flag, or the tenant's data. Split the time with `Server-Timing` against the total request time. If it's the server, search the BFF logs for that endpoint and tenant, compare before and after, and check the query plan. In Coursewright, a leading-wildcard search can read the tenant's whole catalog. Fix it, confirm on the same metric, and add the alert that would have caught it.

## Recap

Five things to remember from this lesson.

One: order the pipeline cheapest and most likely to fail first: contract drift, lint, tests, the build with its budgets, then end-to-end, using the commands developers run locally.

Two: make it reproducible and debuggable: a frozen lockfile, pinned tool versions, and artifacts for debugging without a re-run.

Three: build once and promote, decouple deploy from release with flags that have owners and expiry dates, and roll out by tenant, with rollback on errors and web vitals.

Four: one trace ID links the browser to the log line: the `traceparent` header, the request ID from `genReqId`, `trace_id` on every log line, and `traceId` in every error.

Five: RUM leaves the page in a beacon when the page is hidden, and you alert on symptoms, with service level objectives and burn rates.

In the next lesson, we'll look at evolving a large frontend: technical debt as a portfolio, strangling instead of rewriting, reviews that teach, and how to tell the story of a multi-sprint initiative you led. It's the last lesson in the series.
