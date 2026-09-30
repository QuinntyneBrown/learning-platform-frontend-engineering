# 03 · RxJS Races and Idempotent Submits

> **Runtime:** ~21 min · **Level:** Senior · **Study guide:** [§2 State management and reactive programming](../../study-guide.md#2-state-management-and-reactive-programming) (RxJS) · **Prerequisites:** [02](../02-signals-and-zoneless-change-detection/)

**Video:** [03-rxjs-races-and-idempotent-submits.mp4](03-rxjs-races-and-idempotent-submits.mp4) · [Slides](slides.html) · **Audio lesson:** [03-rxjs-races-and-idempotent-submits.mp3](03-rxjs-races-and-idempotent-submits.mp3) · [Transcript](script.md)

## Why this video exists

"`switchMap` or `exhaustMap` for a Save button?" is the RxJS question every senior Angular interview gets to, and the follow-up is always "then why do you need an idempotency key?". Both have short answers that are easy to get subtly wrong: cancelling a POST doesn't un-send it, and no client operator can see a retry from another tab. This video builds the answers from Coursewright's two pipelines:
- the catalog search: `debounceTime` → trim → `distinctUntilChanged` → `switchMap`, with errors caught inside the inner request;
- "Load more" with `exhaustMap` and a stale-page guard;
- the enrollment controller: `exhaustMap`, one `Idempotency-Key` per intent, and `retry` with backoff for transient errors only;
- the search query in the URL, with `replaceUrl`.

## Learning objectives

By the end, the viewer can:

- State the concurrency rule of `switchMap`, `exhaustMap`, `concatMap` and `mergeMap`, and name a Coursewright use for each (or why it has none).
- Walk through the "sig" … "nals" race operator by operator, and explain how the store spec proves it deterministically.
- Explain why `catchError` belongs inside the inner observable, and what happens when an error reaches the outer stream.
- Justify `exhaustMap` for Enroll and "Load more", and explain why `switchMap` is wrong for a write.
- Explain why an `Idempotency-Key` is still needed, why it's one key per intent, and where in the code that's decided.
- Explain the retry policy (transient errors only, backoff) and why retrying a POST is only safe with the key.
- Explain `?q=` as URL state, and why `replaceUrl`.

## Interview questions this prepares you for

| Question | What a strong answer includes |
|---|---|
| Walk through what happens when a user types "sig", pauses, types "nals", and the first response arrives last. | `debounceTime(250)` emits "sig" after the pause; trim + `distinctUntilChanged` pass it; `tap` sets `status: 'loading'` (old results stay, dimmed); `switchMap` subscribes to `GET /api/courses?q=sig`. "nals" restarts the debounce; "signals" passes; `switchMap` **unsubscribes** from "sig", which aborts the `HttpClient` request, then subscribes to "signals". The late "sig" answer has no subscriber, so it can't overwrite. The server may still do the work (fine for a read). `catalog.store.spec.ts` proves it with fake timers and `HttpTestingController`: `expect(stale.cancelled).toBe(true)`. With `mergeMap`, "sig" would land last and win. |
| `switchMap` vs `exhaustMap` for a Save button? | `exhaustMap` when clicks repeat one intent: ignore new clicks while the save is in flight. `switchMap` cancels only the client's interest in the response; the POST may already have reached the server, so both saves commit while the UI shows one. `concatMap` when each click is different data that must be saved in order (successive edits). `mergeMap` never for a save. Coursewright's `EnrollmentController` uses `exhaustMap`, and the button is `busy`, never `disabled`, so a double click reaches the stream (spec: two `enroll()` calls, one request; E2E: a `dblclick` sends one POST). |
| Why is an `Idempotency-Key` needed if the button already uses `exhaustMap`? | `exhaustMap` sees one stream in one tab. It can't see a retry after a lost response (the server committed, the response never arrived), a second tab, a reload and another click, or a proxy/client that retries. Only the server can recognize a repeat. The BFF stores `(user, key)` with a request hash and the response: same key + same body replays the stored response with `Idempotency-Replayed: true`; same key + different body is `422`. The server side is lesson 07. |
| What happens when an error reaches the outer stream? | An error is terminal: the outer observable completes with an error and the pipeline is torn down. Later keystrokes still set the signal, but nothing listens, and nothing on screen says why. `catalog.store.ts` catches inside `switchMap`'s inner request: `fail()` patches `status: 'error'` with `problemMessage(error)` and returns `EMPTY`, so the outer stream lives. The spec "keeps searching after a failed request" proves it (a 503, then a successful search). `EnrollmentController` catches inside `send()` for the same reason. |
| One idempotency key per intent, or one per attempt? | Per intent. A key per attempt makes each retry look new, which recreates the duplicate. In Coursewright the key is created in `send()` (`crypto.randomUUID()`), which `exhaustMap` calls once per accepted click; `retry()` resubscribes to the same request Observable, so retries reuse it. A new click after a failure is a new intent and gets a new key. Specs: "retries a 5xx with the same Idempotency-Key", "uses a new key for a new intent". Trap: an interceptor that stamps a fresh key on every request is per attempt, because retries pass through interceptors again. (Here a duplicate enrollment would also hit the `409` check, which the client treats as success, but the key is what makes a retry return the original `201`, and it's the only protection for writes with no natural unique constraint.) |
| Which errors would you retry, and how? | Only transient ones: network failures (`status === 0`) and `5xx`. A `4xx` won't change by asking again. `retry({ count: 2, delay })` with exponential backoff: `300 * 2 ** (retryCount - 1)`, so 300 ms then 600 ms, three attempts at most; anything else is rethrown with `throwError`. After the retry, `409` (already enrolled, perhaps from another tab) is treated as success. Retrying a POST is only safe because of the idempotency key. Production: jitter, honour `Retry-After` on `429`, and a cap. |
| Why is the search query in the URL, and why `replaceUrl`? | URL state is state: `?q=` survives a reload, can be bookmarked and shared, and Back restores it. `onSearch()` navigates to the same route with `queryParams: { q: value \|\| null }` (null removes it) and `replaceUrl: true`, so typing "signals" is one history entry, not seven. The URL updates per keystroke (same route, component reused, cheap); only the request is debounced. `withComponentInputBinding` feeds `?q=` back into the `q` input and the `linkedSignal` (lessons 02 and 04). E2E asserts `?q=signals` and a signed-out deep link to `/catalog?q=forms`. |
| How do you test a race condition deterministically? | Control time and order instead of waiting: `vi.useFakeTimers()` and `vi.advanceTimersByTime(250)` for the debounce; `HttpTestingController` holds each request open, so the test decides which response arrives, and when. Assert behaviour ("the stale request was cancelled", "the query is 'angular'"), not implementation. No `sleep`, no retries. Lesson 10 covers the testing strategy. |

## Coursewright code on screen

| File | What to show |
|---|---|
| `docs/adr/0004-signals-and-rxjs-state.md` | The operator table; "each concurrency decision is one visible operator" |
| `apps/web/src/app/features/catalog/catalog.store.ts` | The "errors are caught inside each inner request" comment and `fail()`; `search`: `debounceTime(250)`, trim, `distinctUntilChanged`, `tap`, `switchMap` + inner `catchError`; `loadMore`: `filter`, `exhaustMap`, the stale-page guard, `finalize` |
| `apps/web/src/app/features/catalog/catalog.store.spec.ts` | "debounces rapid keystrokes"; "drops the slow response" (`stale.cancelled`); "keeps searching after a failed request" |
| `apps/web/src/app/features/course/enrollment-controller.ts` | `intents` Subject → `exhaustMap` + `takeUntilDestroyed`; `send()`: one key per intent; `retry` with `isTransient` and `backoff`; `409` as success; inner `catchError` |
| `apps/web/src/app/features/course/enrollment-controller.spec.ts` | Double click → one request; same key on retry; new key for a new intent; `409` → enrolled |
| `apps/web/src/app/features/course/course-page.html` | "Busy, never disabled: a double-click must reach exhaustMap, which absorbs it." |
| `apps/web/src/app/core/api/coursewright-api.ts` | `enroll()` setting the `Idempotency-Key` header |
| `apps/bff/src/routes/enrollments.ts` | What the server does with the key: replay, `idempotency-replayed`, `422` (details in lesson 07) |
| `apps/web/src/app/features/catalog/catalog-page.ts` | `onSearch()`: `queryParams: { q: value \|\| null }`, `replaceUrl: true` |
| `apps/web/e2e/learner-journey.spec.ts` | `toHaveURL(/[?&]q=signals/)`; `dblclick()` → one idempotency key |

## Run sheet

| Time | Segment | Content |
|---|---|---|
| 00:00–01:30 | Hook | The five drills. The thesis: a flattening operator is a concurrency decision, and no operator makes a write safe. |
| 01:30–02:45 | Four operators | **Diagram:** the four rules when B arrives while A is in flight. ADR-0004's table. |
| 02:45–04:00 | The search pipeline | The five steps, one highlighted at a time. |
| 04:00–06:15 | The race | **Diagram:** "sig", pause, "nals". The `switchMap` excerpt; the other three operators on the same keystrokes; cancellation is client-side; the spec. **Demo** in the Network panel (below). |
| 06:15–07:25 | Catching errors | The comment and `fail()`; a sketch of the wrong placement; the inner catch; the spec. |
| 07:25–08:45 | Load more | `exhaustMap`; the other operators on a double click; the stale-page guard. |
| 08:45–10:25 | Enroll | The controller; **diagram:** `switchMap` on a Save button; busy-not-disabled and the double-click spec. **Demo** the double click. |
| 10:25–12:30 | Idempotency key | What `exhaustMap` can't see; `send()` and the header; the server's table; **diagram:** per intent vs per attempt; the key specs. |
| 12:30–13:30 | Retry | `isTransient`, `backoff`, `retry`; `409` as success; "only safe because of the key". |
| 13:30–14:45 | URL state | `onSearch()`; seven entries vs one; only the request is debounced; URL state is state. |
| 14:45–15:20 | Trade-offs | The learning curve vs one visible operator per decision; jitter, `Retry-After`, server timeouts. |
| 15:20–16:05 | Traps | The seven traps below. |
| 16:05–21:00 | Drill and recap | Five questions, then the five points. |

## Code excerpts

### The search pipeline

```ts
// apps/web/src/app/features/catalog/catalog.store.ts
search: rxMethod<string>(
  pipe(
    debounceTime(250),
    map((query) => query.trim()),
    distinctUntilChanged(),
    tap((query) => patchState(store, { query, status: 'loading', error: null })),
    // switchMap cancels the stale request, so a slow response for an old query can't
    // arrive late and overwrite the results for the newer one.
    switchMap((query) =>
      api.searchCourses({ q: query }).pipe(
        tap(({ items, nextCursor }) =>
          patchState(store, { items, nextCursor, status: 'loaded' }),
        ),
        catchError(fail),
      ),
    ),
  ),
),
```

### One enrollment at a time, one key per intent

```ts
// apps/web/src/app/features/course/enrollment-controller.ts
constructor() {
  this.intents
    .pipe(
      // exhaustMap, not switchMap: a second click must not cancel an in-flight enrollment
      // (the server may already have done the work), nor start a second one. It is ignored.
      exhaustMap((courseId) => this.send(courseId)),
      takeUntilDestroyed(),
    )
    .subscribe();
}
// …
private send(courseId: string) {
  // One key per intent, reused by every retry: if a response is lost and the retry reaches
  // the server, the server recognizes the key and replays the first result instead of
  // enrolling twice.
  const idempotencyKey = crypto.randomUUID();
  this.status.set('pending');
  this.error.set(null);

  return this.api.enroll(courseId, idempotencyKey).pipe(
    retry({
      count: 2,
      delay: (error, retryCount) =>
        isTransient(error) ? timer(backoff(retryCount)) : throwError(() => error),
    }),
    tap(() => this.succeed()),
    catchError((error: unknown) => {
      // 409: already enrolled (say, from another tab). For the user, that's success.
      // …
      return EMPTY;
    }),
  );
}
```

### The catch in the wrong place (sketch, not in this repo)

```ts
// Don't: the first failed request completes the whole search stream.
pipe(
  debounceTime(250),
  distinctUntilChanged(),
  switchMap((query) => api.searchCourses({ q: query })),
  catchError(fail),
);
```

### A key per attempt, by accident (sketch, not in this repo)

```ts
// Don't: retry() resubscribes, the request passes through the interceptor again,
// and every attempt gets a fresh key. The server sees each retry as a new request.
export const idempotencyInterceptor: HttpInterceptorFn = (request, next) =>
  next(request.method === 'POST'
    ? request.clone({ setHeaders: { 'Idempotency-Key': crypto.randomUUID() } })
    : request);
```

## Demo

```bash
# Every flattening operator in the web app, and the comment that justifies it
git grep -nE "switchMap|exhaustMap|concatMap|mergeMap" -- apps/web/src/app

# The race, the error recovery, the double click and the key rules, as unit tests
pnpm --filter @coursewright/web test

# The server side of the key: replay, 422 for a reused key, 409 for a second enrollment
pnpm --filter @coursewright/bff test

# Run the app
pnpm dev   # open http://localhost:4200 and sign in as learner.acme / Coursewright2026!
```

With the app running and DevTools open on the Network panel (filter to Fetch/XHR):
1. **The race.** Pick a slow preset in the Network panel's throttling menu. In the catalog, type `sig`, pause, then type `nals`. The `?q=sig` request shows as cancelled; only `?q=signals` completes. The address bar shows `?q=signals`, and Back leaves the catalog rather than stepping through letters.
2. **The double click.** Open a course and double-click **Enroll**. One `POST /api/enrollments` goes out. In its request headers, find `Idempotency-Key`.
3. **The replay, server side.** Open `apps/bff/test/enrollments.test.ts` and read "enrolls once, and replays the same response for a retry with the same key" and "rejects the same key with a different body as 422". The BFF test run above exercised both through `app.inject()`. The client half, a retry of a 503 with the same key, is "retries a 5xx with the same Idempotency-Key" in `enrollment-controller.spec.ts`.

## Traps to call out

- **`switchMap` on a write.** It cancels your interest in the response, not the request.
- **`catchError` on the outer stream.** The first failure completes the stream, and the feature dies silently.
- **A new key per attempt.** Easy to do with an interceptor, because retries pass through interceptors again.
- **Debouncing a submit.** Every legitimate click waits. `exhaustMap` ignores only the duplicates.
- **Disabling the button to prevent double submits.** It hides the reason, drops focus, and doesn't stop a second tab (lessons 01 and 05).
- **Retrying `4xx` errors.** They won't change by asking again.
- **Two streams writing the same state with no guard.** A page for the old query lands after a new search; `loadMore` checks the query before appending.

## Key terms

higher-order observable · flattening operator · `switchMap` / `exhaustMap` / `concatMap` / `mergeMap` · `debounceTime` · `distinctUntilChanged` · `catchError` · `EMPTY` · `finalize` · `retry` with `delay` · exponential backoff (and jitter) · transient error · `rxMethod` · `takeUntilDestroyed` · `Idempotency-Key` · intent vs attempt · replay · URL state · `replaceUrl` · `HttpTestingController` · fake timers

## After the video

1. Change `switchMap` to `mergeMap` in the catalog store's `search`, run `pnpm --filter @coursewright/web test`, and read which test fails and why. Then change it back.
2. Design an autosave for a course description editor: which operator, what goes in the key (if anything), and what the user sees when a save fails. Compare `concatMap` with "`switchMap` plus a server-side version check".
3. Write the one-paragraph review comment you'd leave on a PR that adds an interceptor stamping `Idempotency-Key: crypto.randomUUID()` on every POST.

## References

- [`docs/study-guide.md`](../../study-guide.md), section 2 (and section 6's `Idempotency-Key` drill)
- [ADR-0004: signals for state, RxJS for events over time](../../adr/0004-signals-and-rxjs-state.md)
- [ADR-0002: contract-first REST](../../adr/0002-contract-first-rest.md) and `contracts/openapi.yaml` (`POST /enrollments`: one key per user intent, reused on retries)
- RxJS documentation: `switchMap`, `exhaustMap`, `concatMap`, `mergeMap`, `retry` (the `delay` option), `catchError`
- NgRx documentation: RxJS integration (`rxMethod`)
- Angular documentation: `HttpClient` testing (`HttpTestingController`), router navigation extras (`replaceUrl`)
- IETF HTTPAPI working group: "The Idempotency-Key HTTP Header Field" (a draft when this was written; check its current status)
