# 10 · Testing: Unit, Integration and E2E

Welcome. Testing questions separate people who write tests from people who design a test strategy. Any candidate can say "unit, integration and end-to-end". The interviewer wants to hear what belongs at each level, how you make a race or a retry come out the same way every run, and what you do when a test fails once in twenty runs. By the end of this lesson, you should be able to walk through Coursewright's three levels of tests, explain how its specs control time and order, say what the contract test catches that TypeScript can't, and describe a process for flaky tests and a fast end-to-end suite.

## The questions this lesson answers

Here are the questions this lesson prepares you for. What goes in a unit test, an integration test and an end-to-end test for the enroll feature? How do you test a race condition deterministically? An end-to-end test fails one run in twenty: what's your process? How do you keep an end-to-end suite under ten minutes as the product grows? And what does the contract test catch that TypeScript can't?

Keep one sentence in your head while you listen. Test behaviour at the cheapest level that can see it, and own time and order, so every test gives the same answer on every run.

## Three levels in one repo

Coursewright has three kinds of test, and each runs a different amount of the real system.

Web unit tests run through `ng test`, which uses Angular's unit-test builder with Vitest and a simulated DOM. There are seven spec files and thirty-two tests, and they run in a few seconds.

BFF integration tests run the real Fastify app, with a real SQLite database in memory, through Fastify's inject method. Six test files, fifty-five tests, about two seconds. One of them is the contract test.

End-to-end tests use Playwright and axe against the real web app and the real BFF. There are three spec files and eight tests.

That's the testing pyramid, with real numbers: many fast tests at the bottom, and a few journeys at the top. The rule that runs through all of them is to test behaviour, not implementation.

## A race, made deterministic

Open `features/catalog/catalog.store.spec.ts`. The catalog search from lesson three debounces keystrokes, and uses `switchMap` so that a slow, stale response can't overwrite a newer one. That's a race, and races are what make tests flaky. So the spec takes control of the two things a race depends on: time and order.

Time belongs to fake timers. The spec turns on Vitest's fake timers before each test, so the debounce only fires when the test advances the clock. Order belongs to the HTTP testing controller. Every request waits until the test flushes it, in whatever order the test chooses.

The test named "debounces rapid keystrokes into one request for the final query" searches for "a", "an" and "ang", advances the clock by two hundred and fifty milliseconds, and expects exactly one request, for "ang".

The race test is "drops the slow response for an older query when a newer query is issued". It searches for "react", advances the clock, and holds that request. Then it searches for "angular", and holds the second request. Now it asserts that the stale request was cancelled, flushes the fresh one, and checks that the results belong to "angular". No real network, and no sleeping. It gives the same answer every run.

Notice what it doesn't assert: that `switchMap` was called. It asserts what a user would see, and what the network sees. A third test, "keeps searching after a failed request", proves that a 503 doesn't kill the search box, which is lesson three's catch-inside-the-inner-observable rule, pinned by a test.

## Time, retries and idempotency keys

The same two tools test the enroll button. In `features/course/enrollment-controller.spec.ts`, the first test enrolls twice and expects one request, because the exhaust map operator ignores the second intent. The second test fails the first attempt with a 503, advances the clock by exactly one backoff delay, and expects a retry carrying the same idempotency key. A third proves that a new intent gets a new key, and a fourth treats a 409 as success.

There's a design lesson in that second test. The backoff policy is an exported function, so the test advances the clock by the policy, not by a magic number. `job-progress.spec.ts` does the same with the poll delay, and goes one step further. It flushes the first poll, advances to one millisecond before the next one is due, expects no request, advances one more millisecond, and expects exactly one. That proves the boundary, not just "eventually".

Lesson eight's interceptor spec uses the controller as a counter. Two requests fail with 401, and `expectOne` for the refresh fails if a second refresh started. And the SSE parser is a pure function, so its hardest case, a message split in the middle of a line, is tested with two strings, no network, and no Angular at all. Pulling logic out into pure functions is how you make it cheap to test.

## Components through the DOM

Component tests in Coursewright render real templates and assert what assistive technology would see. `design-system/text-field/text-field.spec.ts` renders the field inside a small host component. It checks that the label points at the input, that `aria-describedby` lists the hint and then the error, that `aria-invalid` comes and goes, and that the error has no alert role. It waits with the fixture's `whenStable`, which fits a zoneless app.

The login page spec finds each input by its label text, the way a user would. And its table-driven test feeds the return URL guard a list of hostile values, such as a protocol-relative double slash, and expects each one to fall back to the catalog.

## BFF integration: the real app and a real database

Now the BFF. Open `apps/bff/test/helpers.ts`. The helper builds the real app with two options changed: each report step takes two milliseconds, and so does the first retry, so the whole job pipeline runs in milliseconds. Each test file builds its own app, so each gets a freshly seeded database in memory, and no state leaks between files.

Tests call the app through `app.inject`, which gives real HTTP semantics without a socket: status codes, headers, cookies and content types. Nothing under test is mocked. The routes, the validation, the auth hooks and the SQL are all real.

A few tests show what that buys. The enrollments test "enrolls once, and replays the same response for a retry with the same key" checks the replay header, an identical body, and exactly one row. The keyset test walks every course a page at a time and proves there are forty, with no duplicates and no gaps. The report tests use Vitest's `expect.poll` to wait for a job to complete, rather than sleeping. And the SSE test listens on a real port, because a stream needs a real socket.

## The contract test

Open `apps/bff/test/contract.test.ts`. It loads `contracts/openapi.yaml`, and compiles its schemas with Ajv. OpenAPI three point one schemas are JSON Schema, so they're used as they are. Every call goes through one helper, which makes a real request, then fails unless three things are documented for that operation: the status code, the content type, and a body that validates against the schema.

The last test is the clever one: "covers every response the contract documents". It collects every method, path and status the other tests exercised, and demands that the set equals every response in the contract. Document a new response without testing it, and the build fails.

What does that catch that TypeScript can't? TypeScript checks what the code claims at compile time. It can't see the wire. A database row cast with `as`, a field that `JSON.stringify` silently drops, a null where the schema promises a string, an extra property the schema forbids, a status code nobody documented: all of that compiles. The contract test runs the real server and checks the real bytes. Lesson seven covers the contract itself.

## End-to-end: few journeys, no retries

Open `apps/web/playwright.config.ts`. Playwright starts its own BFF and web server, on ports that `pnpm dev` doesn't use, and never reuses a running server. So every run starts from a freshly seeded database. Retries are set to zero. In CI, a stray test marked "only" fails the build, and a trace is kept for every failure.

The eight tests are journeys, not pages. A learner searches, opens a course, double-clicks Enroll and gets exactly one request with an idempotency key, then reloads and stays signed in. A deep link survives sign-in. A manager's export fails once, retries and downloads. And axe checks four pages against WCAG 2.2 AA, failing on serious and critical violations.

The accessibility helper in the end-to-end support file runs axe with the WCAG A and AA rule tags, up to version 2.2, and fails only on serious or critical violations, so minor ones don't block a merge. Another test reloads the catalog, presses Tab once, and expects the skip link to have focus. Lesson five covers what those checks can and can't prove.

Two habits keep them stable. They query by role and label, the same accessibility tree a screen reader uses, so a button the test can't find by name is an accessibility bug. And they never sleep. Web-first assertions retry until they pass or time out, and the slow export raises its timeout to fifteen seconds instead of waiting.

Why no retries? A retry turns an intermittent bug into a green build. Flaky tests are bugs, in the test or in the app. And in `.github/workflows/ci.yml`, the end-to-end job only runs after contract drift, lint, unit and integration tests, and the build have passed, cheapest first. Lesson eleven covers the pipeline.

## Flaky tests and a fast suite

When an end-to-end test fails one run in twenty, reproduce it first. Run it in a loop with Playwright's repeat option, with tracing on, and read the trace of a failure. Then classify it. Is it the test, with a fixed wait, a locator that matches two elements, or state shared between tests? Is it the app, with a real race that users will hit too? Or is it the environment? Fix the cause. If you must quarantine it, give it an owner and a date. Never add retries to hide it.

To keep a suite fast as the product grows, push checks down the pyramid, and keep only journeys at the top. Set up state through the API, not the UI. Give each parallel worker its own data, a tenant per worker, so tests can run in parallel, then shard across machines.

One Coursewright detail is worth raising here. A common speed trick is to sign in once and reuse the saved cookies. With rotation on, a saved refresh cookie works exactly once. The second test that presents it trips reuse detection and revokes the session. So sign in through the API per test, or per worker and user.

## What goes where for enrolment

Put it together for the enroll feature. Unit tests own the client's concurrency and retry policy: a double-click makes one request, a 503 retries with the same key, a new intent gets a new key, and a 409 counts as enrolled. Integration tests own the server's truth: 201 once, a replay for the same key, 422 for the same key with a different body, 409 for a second enrolment, 400 without a key, and 404 across tenants, with the contract test checking every shape. End-to-end owns one journey: a real double-click in a real browser makes exactly one request, and the page says you're enrolled. Each fact is tested once, at the lowest level that can see it.

## What production would add

Today the end-to-end suite runs on one worker, with parallelism off, and every test shares one seeded database. That's fine for eight tests. As the suite grows, give each worker its own tenant, turn parallelism on, and shard across CI machines. Playwright can also fail a run that contains flaky tests, which keeps flakes visible even if someone adds retries. As of September 2026, check that option for your version. Beyond that: component tests and visual regression in Storybook, test data builders instead of hand-written objects, and mutation testing on core logic, such as the auth store, to prove the tests would fail if the code were wrong.

## Traps

Here are the traps to call out.

Sleeping in tests. A fixed wait is either too short on a slow machine or wasted time on a fast one. Use fake timers in unit tests, and web-first assertions end to end.

Letting real timers and real networks decide the order of a race. Hold the requests and flush them yourself.

Asserting implementation, such as which operator was called, instead of what the user and the network see.

Mocking the thing under test, like a BFF test that stubs its own database.

Retries in the end-to-end configuration. They hide the flake, and the bug behind it.

Querying by CSS class or test ID when a role and a name would do, and missing the accessibility bug.

And one end-to-end test per edge case, until the suite takes an hour.

## Interview drill

Let's practise. After each question there's a short pause. Pause the audio if you want more time, answer out loud, and then compare your answer with the model answer.

**Interviewer:** What goes in a unit test, an integration test and an end-to-end test for the enroll feature?

[pause 5s]

Unit tests own the client's policy: a double-click sends one request, a 503 retries with the same idempotency key after the backoff, a new intent gets a new key, and a 409 counts as enrolled, all with fake timers and the HTTP testing controller. Integration tests own the server's truth, against a real database: 201, a replay for the same key, 422 for the same key with a different body, 409, 400 and a cross-tenant 404, plus the contract test. And one end-to-end journey proves a real double-click makes one request.

**Interviewer:** How do you test a race condition deterministically?

[pause 5s]

Take control of what the race depends on: time and order. Fake timers own the clock, so a debounce or backoff fires only when the test advances it. The HTTP testing controller holds every request until the test flushes it, in any order. In Coursewright's catalog spec, the test issues an old query, then a new one, asserts that the stale request was cancelled, and flushes only the fresh one. There's no real network and no sleeping, so it gives the same answer every run, and it asserts behaviour, not operators.

**Interviewer:** An end-to-end test fails one run in twenty. What's your process?

[pause 5s]

Treat it as a bug, not noise. Reproduce it by running the test in a loop with tracing on, and read the trace of a failure. Classify the cause: the test, with a fixed wait, an ambiguous locator or shared state; the app, with a real race users will hit; or the environment. Fix the cause and keep retries at zero, as Coursewright does. If it has to be quarantined, give it an owner and a date. And add a lower-level test that pins the race, if there is one.

**Interviewer:** How do you keep an end-to-end suite under ten minutes as the product grows?

[pause 5s]

Keep only critical journeys at the top, and push every edge case down to unit and integration tests. Set up data through the API, not the UI. Isolate data per worker, so tests run in parallel, then shard across machines. Run the affected journeys on each pull request and everything nightly. And watch for traps like Coursewright's rotating refresh cookie: reusing one saved sign-in across tests would trip reuse detection, so sign in through the API per test.

**Interviewer:** What does the contract test catch that TypeScript can't?

[pause 5s]

TypeScript checks what the code claims at compile time. The contract test checks what the server actually sends. It runs the real BFF and validates each response's status, content type and body against the OpenAPI document. That catches a database row cast with `as`, a field dropped during serialization, a null where a string is promised, an undocumented status, or a wrong content type, all of which compile. And its coverage check fails if any documented response is never exercised.

## Recap

Five things to remember from this lesson.

One: three levels, each owning different facts. Unit tests for client policy, integration tests on the real app and database for server truth, and a few end-to-end journeys.

Two: races and retries become deterministic when the test owns time and order: fake timers for the clock, and the HTTP testing controller for the requests.

Three: test behaviour. Assert what the user and the network see, and pull hard logic into pure functions.

Four: the contract test checks real responses against the OpenAPI document, and demands that every documented response is exercised. TypeScript can't see the wire.

Five: end-to-end tests query by role and label, never sleep, start from fresh data, and run with zero retries, because a flaky test is a bug.

In the next lesson, we'll look at CI/CD and frontend observability: how the pipeline is ordered, how a deploy rolls out safely, and how one trace ID connects a click in the browser to a line in the BFF's logs.
