# ADR-0004: Signals for state, RxJS for events over time

- **Status:** Accepted
- **Date:** 2026-09-30
- **Deciders:** Coursewright web team

## Context

Angular 22 is zoneless by default, and components are OnPush by default. Signals drive change detection. RxJS is still the best tool for async coordination: debouncing, cancelling, and serializing or ignoring concurrent requests. Teams that use one tool for everything end up either with `BehaviorSubject` soup or with effects that re-implement `switchMap` badly.

## Decision

- **Signals hold state and derive from it.** Components read signals in templates. Derived values use `computed`. Component inputs use `input()`.
- **RxJS handles events over time**, at the edges where timing matters. Pick the flattening operator for its concurrency rule:

| Operator | Rule | Used for |
|---|---|---|
| `switchMap` | The newest wins; cancel the previous one | Typeahead search, in the catalog store |
| `exhaustMap` | Ignore new events while one is in flight | Enroll button, "Load more" |
| `concatMap` | Queue, and run in order | Ordered saves (not needed here) |
| `mergeMap` | Run all at once, optionally with a concurrency limit | Prefetching (not needed here) |

- **Feature state uses `@ngrx/signals`.** A `signalStore` holds the state, and `rxMethod` bridges RxJS pipelines into it. The catalog store (`features/catalog/catalog.store.ts`) is the worked example: `search` = `debounceTime` → `distinctUntilChanged` → `switchMap`, with errors caught inside the inner observable so one failure doesn't kill the stream.
- **Simple reads use `httpResource`,** which is stable in v22. The course page loads its course this way and gets loading, error and value states as signals.
- **URL state is state.** The catalog query lives in `?q=`, updated with `replaceUrl` so it doesn't flood the history, and restored on load.
- **`ChangeDetectionStrategy.OnPush` is written explicitly** on every component, even though it's the v22 default, so the intent survives copy-paste into older code.

## Consequences

**Positive**

- Templates read synchronous signals, so there are no `async` pipes, no subscriptions to leak, and no `ExpressionChangedAfterItHasBeenChecked` errors.
- Each concurrency decision is one visible operator, which a reviewer can check against the table above.
- The store is testable with `HttpTestingController` and fake timers, without rendering anything.

**Negative**

- Two reactive models to learn. The line between them ("state or event?") needs judgment in review.
- `@ngrx/signals` is a dependency; plain services with signals would do for an app this size. It's here because it's the pattern a team of this size standardizes on.
