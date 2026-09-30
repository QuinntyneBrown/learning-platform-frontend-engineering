# 10 · Testing: Unit, Integration and E2E

> **Runtime:** ~21 min · **Level:** Senior · **Study guide:** [§9 Testing: unit, integration and E2E](../../study-guide.md#9-testing-unit-integration-and-e2e) · **Prerequisites:** [03](../03-rxjs-races-and-idempotent-submits/), [05](../05-accessibility-in-a-single-page-app/), [08](../08-browser-auth-tokens-and-refresh/), [09](../09-async-jobs-sse-and-polling/)

**Video:** [10-testing-unit-integration-and-e2e.mp4](10-testing-unit-integration-and-e2e.mp4) · [Slides](slides.html) · **Audio lesson:** [10-testing-unit-integration-and-e2e.mp3](10-testing-unit-integration-and-e2e.mp3) · [Transcript](script.md)

## Why this video exists

Every candidate can recite "unit, integration, end-to-end". Senior interviews ask what belongs at each level, how you make a race or a retry come out the same way every run, and what you do about a test that fails once in twenty. This video answers from Coursewright's real specs and numbers:
- 32 web unit tests (Vitest through `ng test`), 55 BFF integration tests on the real app and a real in-memory SQLite database, and 8 Playwright + axe journeys;
- races and backoff made deterministic with fake timers and `HttpTestingController`, asserting behaviour rather than operators;
- a contract test that checks every real response against `openapi.yaml`, and fails if any documented response is never exercised;
- an E2E setup with its own servers, fresh data, role and label queries, no sleeps and `retries: 0`;
- a process for flaky tests, and a Coursewright-specific trap: a saved sign-in doesn't survive refresh-token rotation.

## Learning objectives

By the end, the viewer can:

- Describe Coursewright's three levels, their runners and their sizes, and what each level owns.
- Test a race deterministically, as `catalog.store.spec.ts` does, and explain why it asserts cancellation and results rather than "`switchMap` was called".
- Test time-based policy (debounce, backoff, polling) with fake timers, advancing by the exported policy and testing the boundary.
- Explain what BFF integration tests gain from `app.inject`, a real database and no mocks of the thing under test.
- Explain how the contract test works, including its coverage check, and what it catches that TypeScript can't.
- Explain the Playwright configuration choices (ports, `reuseExistingServer: false`, `retries: 0`, `forbidOnly`, traces), the axe threshold, and why queries use roles and labels.
- Run a flaky-test investigation, and keep an E2E suite fast as it grows.
- Split the enroll feature's tests across the three levels.

## Interview questions this prepares you for

| Question | What a strong answer includes |
|---|---|
| What goes in a unit test vs an integration test vs an E2E test for the enroll feature? | **Unit** (`enrollment-controller.spec.ts`, fake timers + `HttpTestingController`): a double-click sends one request (`exhaustMap`); a 503 retries after `backoff(1)` with the same `Idempotency-Key`; a new intent gets a new key; a 409 counts as enrolled. **Integration** (`enrollments.test.ts`, real app and SQLite): 201; a replay for the same key with `Idempotency-Replayed: true` and an identical body; 422 for the same key with a different body; 409 for a second enrolment; 400 for a missing or short key; 404 for another tenant's course; plus the contract test on every shape. **E2E** (`learner-journey.spec.ts`): a real double-click produces exactly one POST carrying a key, and "You're enrolled" appears. Each fact tested once, at the lowest level that can see it. |
| How do you test a race condition deterministically? | Own time and order. Fake timers (`vi.useFakeTimers()`) own the clock, so the debounce fires only on `vi.advanceTimersByTime(250)`. `HttpTestingController` holds every request until the test flushes it, in any order. "drops the slow response for an older query when a newer query is issued": search "react", advance, hold it; search "angular", advance, hold it; assert `stale.cancelled` is true, flush only the fresh request, and check the query and items. No network, no sleep, the same answer every run, and it asserts what the user and network see, not which operator ran. |
| An E2E test fails 1 run in 20. What's your process? | A bug, not noise. Reproduce in a loop (`--repeat-each`) with tracing on (Coursewright keeps traces on failure), and read a failing trace. Classify: the test (a fixed wait, a locator matching two elements, shared state), the app (a real race users will hit), or the environment. Fix the cause and keep `retries: 0`; add a lower-level test that pins the race. Quarantine only with an owner and a date. Production: `failOnFlakyTests` makes flakes fail the run even if someone adds retries (as of September 2026; check your Playwright version). |
| How do you keep an E2E suite under 10 minutes as the product grows? | Only critical journeys at the top; push edge cases down to unit and integration tests. Set up state through the API, not the UI. Give each worker its own data (a tenant per worker) so `fullyParallel` and more workers are safe (Coursewright runs one worker today, on one seeded database), then shard across CI machines. Run affected journeys per PR and everything nightly. Coursewright trap: with refresh-token rotation, a saved `storageState` cookie works once; the next test that presents it trips reuse detection, so sign in through the API per test (or per worker and user). |
| What does the contract test catch that TypeScript can't? | TypeScript checks what the code claims at compile time; `contract.test.ts` checks the real bytes. Each call goes through `expectCall`, then `expectToMatchContract`: the status must be documented for the operation, the content type documented, and the body valid against the schema (Ajv 2020, since OpenAPI 3.1 schemas are JSON Schema 2020-12, with `ajv-formats`, and `additionalProperties: false` throughout the contract). It catches a row cast with `as`, a field `JSON.stringify` drops, `null` where a string is promised, an undocumented status or content type. "covers every response the contract documents" fails if any documented method/path/status is never exercised. |
| Why does Coursewright run Playwright with `retries: 0`? | A retry turns an intermittent bug into a green build, and flaky tests are bugs in the test or the app. With zero retries a flake is visible the first time it happens. The rest of the config supports determinism: its own BFF (:3100) and web server (:4300), `reuseExistingServer: false` so every run starts from a freshly seeded database, `forbidOnly` in CI, `trace: 'retain-on-failure'`, and the HTML report uploaded as a CI artifact even when tests fail. |
| Why not mock the database in BFF tests? | Because the database is part of what's under test: SQL, constraints (`UNIQUE (user_id, course_id)`), transactions and tenant scoping. SQLite in memory makes the real thing fast: 55 tests in about two seconds. `buildTestApp` builds the real Fastify app with only job timings shortened (`jobStepMs: 2`, `retryBaseMs: 2`), each file gets a freshly seeded database, and `app.inject` gives real HTTP semantics (status, headers, cookies, content types) without a socket. Waiting uses `expect.poll`, not sleep; the SSE test listens on a real port. |
| How do you test streaming (SSE) code? | Split it. The parsing is a pure function (`parseSse`), tested with strings, including a message split mid-line. The client (`JobProgress`) is tested by stubbing the global `fetch` with a `Response` built from an event-stream string (and checking the `traceparent` header), and its fallback with a rejected `fetch` plus fake timers and `expectNone`/`expectOne` around the 1 s boundary. The server side is an integration test against a real listening socket that reads the whole stream and checks ordered, unique ids and a terminal last event. |

## Coursewright code on screen

| File | What to show |
|---|---|
| `apps/web/angular.json`, `apps/bff/vitest.config.ts`, `apps/web/tsconfig.spec.json` | `@angular/build:unit-test`; the BFF's Node environment and `test/**/*.test.ts`; `vitest/globals` |
| `apps/web/src/app/features/catalog/catalog.store.spec.ts` | Fake timers in `beforeEach`; the debounce test; the race test (`stale.cancelled`); "keeps searching after a failed request" |
| `apps/web/src/app/features/course/enrollment-controller.spec.ts` | One request per double-click; retry with the same key after `backoff(1)`; a new key per intent; 409 as enrolled |
| `apps/web/src/app/features/reports/job-progress.spec.ts` | `parseSse` split-chunk test; stubbed `fetch`; the `pollDelay(1) - 1` boundary with `expectNone` |
| `apps/web/src/app/core/auth/auth.interceptor.spec.ts` | `expectOne('/api/auth/refresh')` as a counter for concurrent 401s |
| `apps/web/src/app/design-system/text-field/text-field.spec.ts`, `features/login/login-page.spec.ts`, `shell/shell.spec.ts` | A host component; `aria-describedby` and `aria-invalid`; inputs found by label text; the `safeReturnUrl` `it.each`; the skip link |
| `apps/bff/test/helpers.ts` | `buildTestApp` (`jobStepMs: 2`, `retryBaseMs: 2`); `login` returning a bearer header |
| `apps/bff/test/enrollments.test.ts`, `courses.test.ts`, `auth.test.ts`, `reports.test.ts` | Idempotent replay; the keyset walk (40 courses); rotation and reuse; `expect.poll`; the real-port SSE test |
| `apps/bff/test/contract.test.ts` | `expectCall`, `expectToMatchContract`, and "covers every response the contract documents" |
| `apps/web/playwright.config.ts` | Ports 3100/4300; `reuseExistingServer: false`; `retries: 0`; `forbidOnly`; `workers: 1`; `trace: 'retain-on-failure'` |
| `apps/web/e2e/*.spec.ts`, `apps/web/e2e/support.ts` | Role and label queries; no fixed waits; the axe helper's tags and serious/critical threshold; the keyboard test |
| `.github/workflows/ci.yml` | `verify` (contract drift → lint → test → build) before `e2e` (`needs: verify`); the Playwright report uploaded `if: ${{ !cancelled() }}` |

## Run sheet

| Time | Segment | Content |
|---|---|---|
| 00:00–01:30 | Hook | Test strategy, not test types. The five questions. The thesis: cheapest level that can see it; own time and order. |
| 01:30–02:30 | Three levels | The pyramid with real numbers; the two runners; the real terminal output. **Demo** both suites (below). |
| 02:30–04:15 | A race | The pipeline under test; fake timers own time, `HttpTestingController` owns order; the debounce test; the race as a diagram; the race test; behaviour, not operators. **Demo** breaking the operator. |
| 04:15–05:45 | Time and retries | The retry test with the same key; advance by the exported policy; the 1 ms boundary; the interceptor counter; the pure parser. |
| 05:45–06:30 | Components | The text field's accessibility assertions; finding inputs by label; the open-redirect table test. |
| 06:30–07:50 | BFF integration | `buildTestApp`; `app.inject`; no mocks; the replay test; the keyset walk; `expect.poll`. |
| 07:50–09:05 | Contract test | `expectToMatchContract`; the coverage check; what TypeScript can't see (lesson 07 owns the contract itself). |
| 09:05–11:05 | End-to-end | The Playwright config; the eight tests; the axe helper; roles and labels; no sleeps; `retries: 0`; CI order (lesson 11 owns the pipeline). |
| 11:05–12:30 | Flaky and fast | The one-in-twenty process; keeping the suite fast; the saved-sign-in-meets-rotation trap. |
| 12:30–13:20 | What goes where | The enrolment table: unit, integration, E2E. |
| 13:20–14:05 | Production | Parallel workers with isolated data, sharding, `failOnFlakyTests`, Storybook, builders, mutation testing. |
| 14:05–15:00 | Traps | The seven traps below. |
| 15:00–20:30 | Drill and recap | Five questions, then the five points. |

## Code excerpts

### A race, owned by the test

```ts
// apps/web/src/app/features/catalog/catalog.store.spec.ts
it('drops the slow response for an older query when a newer query is issued', () => {
  store.search('react');
  vi.advanceTimersByTime(250);
  const stale = http.expectOne((r) => r.params.get('q') === 'react');

  store.search('angular');
  vi.advanceTimersByTime(250);
  const fresh = http.expectOne((r) => r.params.get('q') === 'angular');

  // switchMap unsubscribed from the old request, which cancels it: it can never land.
  expect(stale.cancelled).toBe(true);
  fresh.flush(page('Angular Signals in Practice'));

  expect(store.query()).toBe('angular');
  expect(store.items().map((c) => c.title)).toEqual(['Angular Signals in Practice']);
});
```

### Advance by the policy

```ts
// apps/web/src/app/features/course/enrollment-controller.ts
/** 300 ms, then 600 ms. */
export const backoff = (retryCount: number) => 300 * 2 ** (retryCount - 1);

// apps/web/src/app/features/course/enrollment-controller.spec.ts (excerpt)
first.flush(null, { status: 503, statusText: 'Service Unavailable' });
vi.advanceTimersByTime(backoff(1));

const retry = http.expectOne('/api/enrollments');
expect(retry.request.headers.get('Idempotency-Key')).toBe(key);
```

### The contract test's coverage check

```ts
// apps/bff/test/contract.test.ts (excerpt)
expect(response.statusCode, `${method.toUpperCase()} ${url}: ${response.body}`).toBe(status);
expectToMatchContract(response, method, path);
exercised.add(`${method} ${path} ${status}`);
// …
it('covers every response the contract documents', () => {
  const documented = Object.entries(contract.paths).flatMap(([path, operations]) =>
    Object.entries(operations as Record<string, Operation>).flatMap(([method, { responses }]) =>
      Object.keys(responses).map((status) => `${method} ${path} ${status}`),
    ),
  );
  expect([...exercised].sort()).toEqual(documented.sort());
});
```

### Deterministic E2E by configuration

```ts
// apps/web/playwright.config.ts (excerpt)
// E2E runs its own BFF and web server on separate ports, so it never collides
// with `pnpm dev` and always starts from a freshly seeded in-memory database.
const BFF_PORT = 3100;
const WEB_PORT = 4300;
const isCI = !!process.env['CI'];

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: isCI,
  retries: 0,
  workers: 1,
  // …
});
```

### Signing in per test through the API (sketch, not in this repo)

```ts
// e2e/fixtures.ts: each test gets its own refresh cookie, so rotation never sees a replay.
import { test as base, expect } from '@playwright/test';
import { PASSWORD } from './support';

export const test = base.extend<{ signIn: (username: string) => Promise<void> }>({
  signIn: async ({ page }, use) => {
    await use(async (username) => {
      // page.request shares the page's cookie jar, so the httpOnly cw_refresh cookie lands there.
      const response = await page.request.post('/api/auth/login', {
        data: { username, password: PASSWORD },
      });
      expect(response.ok()).toBe(true);
    });
  },
});
```

The next `page.goto()` runs the app initializer's `restore()`, which refreshes with that cookie. A single `storageState` file shared by many tests would present the same refresh cookie twice, and the BFF's reuse detection would revoke the session.

## Demo

```bash
# The pyramid's lower two levels, with real numbers
pnpm --filter @coursewright/web test
#   Test Files  7 passed (7)
#        Tests  32 passed (32)
pnpm --filter @coursewright/bff test
#   Test Files  6 passed (6)
#        Tests  55 passed (55)

# One spec on its own
pnpm --filter @coursewright/web test --include src/app/features/catalog/catalog.store.spec.ts

# Break the race on purpose: exhaustMap ignores the newer search, and only the race test fails
# (no request for "angular" is ever sent). Then undo it.
sed -i 's/switchMap((query) =>/exhaustMap((query) =>/' apps/web/src/app/features/catalog/catalog.store.ts
pnpm --filter @coursewright/web test --include src/app/features/catalog/catalog.store.spec.ts
git checkout -- apps/web/src/app/features/catalog/catalog.store.ts

# The E2E configuration choices, in one grep
git grep -n "retries\|forbidOnly\|reuseExistingServer\|retain-on-failure\|PORT =" -- apps/web/playwright.config.ts
```

With time, run the E2E suite once (`pnpm e2e`; the first run needs `pnpm --filter @coursewright/web exec playwright install chromium`). It starts its own BFF on :3100 and web server on :4300, so it doesn't collide with `pnpm dev`. To show the flaky-test workflow, run one spec repeatedly with traces: `pnpm --filter @coursewright/web exec playwright test e2e/reports.spec.ts --repeat-each=10 --trace=on`, then open a trace with `pnpm --filter @coursewright/web exec playwright show-trace <path to trace.zip>`.

## Traps to call out

- **Sleeping in tests.** Too short on a slow machine, wasted time on a fast one. Fake timers in unit tests; web-first assertions in E2E.
- **Letting real timers and networks order a race.** Hold the requests and flush them yourself.
- **Asserting implementation** ("`switchMap` was called") instead of what the user and the network see.
- **Mocking the thing under test**, like a BFF test that stubs its own database.
- **Retries in the E2E config.** They hide the flake and the bug behind it.
- **CSS-class or test-id queries** where a role and a name would do. You miss the accessibility bug the query would have found.
- **One E2E test per edge case**, until the suite takes an hour.

## Key terms

test pyramid · unit / integration / end-to-end · Vitest · `@angular/build:unit-test` · jsdom · `TestBed` · `fixture.whenStable()` · fake timers (`vi.useFakeTimers`, `advanceTimersByTime`, `advanceTimersByTimeAsync`) · `HttpTestingController` (`expectOne`, `expectNone`, `flush`, `cancelled`, `verify`) · `vi.stubGlobal` · `app.inject` · in-memory SQLite · `expect.poll` · contract test · Ajv / JSON Schema 2020-12 · coverage of documented responses · Playwright · web-first assertions · `getByRole` / `getByLabel` · axe (`@axe-core/playwright`) · `retries: 0` · `forbidOnly` · trace viewer · `--repeat-each` · `failOnFlakyTests` · sharding · `storageState` · quarantine

## After the video

1. Write the missing test the study guide hints at: flush the fresh response, then prove that nothing the stale request could do changes `items`. Why can't `HttpTestingController` flush a cancelled request, and what does that tell you about the assertion Coursewright chose?
2. Add a BFF test that sends a learner's report request with an *invalid* body and expects 403, not 400, proving the role hook runs before validation (lesson 08).
3. Sketch how you'd enable `fullyParallel` for Coursewright's E2E suite: which tests share state today (the learner journey enrols `learner.acme`), and how a tenant per worker would change the seed.

## References

- [`docs/study-guide.md`](../../study-guide.md), section 9
- Angular documentation: testing with the unit-test builder (Vitest), `TestBed`, `HttpTestingController`
- Vitest documentation: fake timers, `vi.stubGlobal`, `expect.poll`
- Fastify documentation: testing with `inject` (light-my-request)
- Ajv documentation: JSON Schema 2020-12, `ajv-formats`; the OpenAPI 3.1 specification (schema objects as JSON Schema)
- Playwright documentation: locators and web-first assertions, `retries`, `forbidOnly`, the trace viewer, `--repeat-each`, `failOnFlakyTests`, sharding, authentication and `storageState`
- Deque axe-core rule tags (`wcag2a` … `wcag22aa`)
