# 02 · Signals and Zoneless Change Detection

> **Runtime:** ~22 min · **Level:** Senior · **Study guide:** [§2 State management and reactive programming](../../study-guide.md#2-state-management-and-reactive-programming) (signals) and [§5 Performance](../../study-guide.md#5-performance) (zoneless) · **Prerequisites:** [01](../01-layers-boundaries-and-design-system/)

**Video:** [02-signals-and-zoneless-change-detection.mp4](02-signals-and-zoneless-change-detection.mp4) · [Slides](slides.html) · **Audio lesson:** [02-signals-and-zoneless-change-detection.mp3](02-signals-and-zoneless-change-detection.mp3) · [Transcript](script.md)

## Why this video exists

"How do signals change change detection?" is the modern Angular question, and most answers stop at "signals are faster". A strong answer names **what schedules a render** once zone.js is gone, what no longer does, and where each kind of state should live. Coursewright is zoneless and OnPush throughout, so this video builds the answer from its code:
- the zoneless `app.config.ts` and the short list of render triggers;
- signals and `computed` in a design-system primitive and in the app-wide auth state;
- the catalog's `signalStore`, its derived status text, and the `rxMethod` bridge from state to events;
- `linkedSignal` for the search box, `httpResource` and `rxResource` for reads, and the two effects the course page really needs;
- when a store is the wrong tool.

## Learning objectives

By the end, the viewer can:

- Explain what zone.js did, and list what schedules a render in a zoneless app (and what doesn't).
- Explain how a signal read in a template narrows change detection to the views that read it, and why Coursewright still writes `OnPush` out.
- Show why the text field keeps its value in a signal, and how the auth store exposes read-only computed signals.
- Describe the catalog store's state shape, `withState`/`withMethods`/`patchState`, and how `rxMethod` turns a signal into a stream.
- Choose between `computed`, `linkedSignal`, a resource and an effect, and justify each with a Coursewright example.
- Decide when *not* to use a store.

## Interview questions this prepares you for

| Question | What a strong answer includes |
|---|---|
| How do signals change change detection in a zoneless app? What still triggers a render? | zone.js patched async APIs and checked the whole tree after every task. Zoneless, Angular renders only when notified: a signal read in a template changes, a template or host listener fires, `markForCheck()` (the `async` pipe calls it), `ComponentRef.setInput()` (the router's input binding, tests), a view attached or removed. A `setTimeout`, a promise or a `subscribe` that assigns a plain field triggers nothing. A signal marks only the views that read it; OnPush ancestors are only traversed. Coursewright: `app.config.ts` has no zone provider and zone.js isn't a dependency. |
| `effect()` vs `computed()`: when is an effect the wrong tool? | `computed` is lazy, memoized, glitch-free and read-only: `statusText`, `heading`, `describedBy`, `isAuthenticated`. An effect is wrong when its result is state (setting a signal inside an effect: use `computed` or `linkedSignal`), for loading data (use a resource), and for user events (a handler or RxJS). An effect is right for syncing state into a non-signal API: the course page's `document.title` effect, and `afterRenderEffect` to focus the "You're enrolled" paragraph once it exists. ADR-0004: "effects that re-implement `switchMap` badly". |
| When would you *not* use a store? | Most of the time. One component's UI state stays as signals there (`LoginPage`: `submitted`, `pending`, `errorMessage`). A read keyed by state is a resource (`CoursePage`, `MyEnrollments`). A small page workflow is an `@Injectable()` with signals, provided by the page (`EnrollmentController`). Small app-wide state is a root service with signals (`AuthStore`). A store earns its place when several fields change together and async flows coordinate (`CatalogStore`: search + load more, tested with no rendering). ADR-0004 admits plain services would do at this size. |
| `linkedSignal` vs `computed`: why is the search box a linked signal? | It must be writable (every keystroke calls `query.set()` before the URL catches up), and it must reset when `?q=` changes from outside (Back, the header's Catalog link, a shared link). `linkedSignal(() => this.q() ?? '')` is both. `computed` is read-only; a `signal` plus an `effect` that copies the input writes a signal from an effect: an extra pass, a stale value in between, a hidden dependency. |
| `httpResource` vs an RxJS pipeline: when would you use each? | `httpResource` for a read keyed by state: `CoursewrightApi.course(courseId)` takes a function, so the URL re-derives when the `input.required` route param changes; value, error, `isLoading` and `statusCode` are signals; only the latest request counts; call it in an injection context. `rxResource` gives the same shape to an existing Observable (`myEnrollments()`). RxJS when timing or concurrency matters (debounce, `switchMap`, `exhaustMap`, appending pages, retry with backoff). Never a resource for a POST: it re-runs when its inputs change. As of September 2026 both are stable in Angular 22 (ADR-0004 and the installed type declarations); check your version. |
| What breaks when you move an existing app from zone.js to zoneless, and how do you find it? | Plain fields assigned in `subscribe`, timers, promises or third-party callbacks stop rendering: convert them to signals (or `markForCheck()`). Code that waits on `NgZone.onStable` needs `afterNextRender`. Some third-party libraries assume a zone. Tests move from `detectChanges()` to `await fixture.whenStable()`, as every spec here does. In development, `provideCheckNoChangesConfig({ exhaustive: true, interval })` (developer preview as of September 2026) surfaces bindings that changed without notifying Angular. Migrate with OnPush first, since OnPush-clean code is mostly zoneless-clean. |
| How is the app-wide auth state modelled, and how do components react to sign-in? | `AuthStore` is a root service with one private writable `session` signal and a read-only surface: `user`, `accessToken` and `isAuthenticated` as `computed`. The shell reads `user()` in its template, so the header updates with no subscription; `isManager = computed(() => this.auth.hasRole('manager'))` tracks the session through the method call. Guards read `isAuthenticated()` once per navigation (lesson 04). Refresh and token storage are lesson 08. |

## Coursewright code on screen

| File | What to show |
|---|---|
| `apps/web/src/app/app.config.ts` | "Zoneless is the default: there is no zone.js, and signals and template events schedule rendering." No zone provider |
| `apps/web/package.json` | No `zone.js` dependency |
| `apps/web/src/app/shell/shell.ts` | The OnPush house-rule comment; `user = this.auth.user`; `isManager` as a `computed` over `hasRole()` |
| `apps/web/src/app/design-system/text-field/text-field.ts` and `.spec.ts` | `value` and `disabled` signals set by `writeValue()` and `setDisabledState()`; `describedBy` computed; the spec's `setValue()` + `whenStable()` on an OnPush host |
| `apps/web/src/app/core/auth/auth.store.ts` | Private `session` signal; `user`, `accessToken`, `isAuthenticated` computed; `hasRole()` |
| `apps/web/src/app/features/catalog/catalog.store.ts` | `CatalogState` and its status union; `signalStore(withState, withMethods)`; `patchState` with a new array |
| `apps/web/src/app/features/catalog/catalog-page.ts` | `providers: [CatalogStore]`; `q = input<string>()`; `query = linkedSignal(...)`; `statusText` computed; `this.store.search(this.query)` |
| `apps/web/src/app/core/api/coursewright-api.ts` | `course(courseId: () => string)` returning `httpResource`, and its doc comment |
| `apps/web/src/app/features/course/course-page.ts` | `courseId = input.required<string>()`; `this.api.course(this.courseId)`; `notFound`, `heading`; the title `effect`; `afterRenderEffect` with `viewChild` |
| `apps/web/src/app/features/catalog/my-enrollments.ts` | `rxResource({ stream: () => this.api.myEnrollments() })`; `hasValue()` / `error()` in the template |
| `docs/adr/0004-signals-and-rxjs-state.md` | "Signals hold state"; `httpResource` stable in v22; OnPush written explicitly; the negative consequences |

## Run sheet

| Time | Segment | Content |
|---|---|---|
| 00:00–01:30 | Hook | The question, the five drills, the thesis: without zone.js, Angular renders only when told, and a signal tells it precisely. |
| 01:30–02:45 | What zone.js did | Patch everything, check everything. Why plain fields worked by accident. `app.config.ts`, and the v22 defaults as the repo states them. |
| 02:45–04:45 | What schedules a render | The trigger list and the "renders nothing" list. The catalog page trigger by trigger. **Diagram:** a signal narrows the render. OnPush written out; `Default` → `Eager`. |
| 04:45–06:45 | Signals and computed | `signal` vs `computed`. The text field's signals and the spec that proves the render. The auth store's read-only surface; the shell's `computed` over a method. |
| 06:45–08:30 | The catalog store | State shape and status union; `withState`, `withMethods`, `patchState` with a new array; page-scoped provider; `statusText`. **Diagram:** the `rxMethod` bridge. |
| 08:30–09:50 | linkedSignal | What the search box needs; `linkedSignal(() => this.q() ?? '')`; why not `computed` or signal + effect (sketch). **Demo** the reset (below). |
| 09:50–11:50 | Resources | `httpResource` in the API client; one line on the course page; the derived heading; `rxResource`; stability as of September 2026; reads only. |
| 11:50–13:20 | Effects | The title effect; `afterRenderEffect` for focus; the "wrong tool" table. |
| 13:20–14:35 | When not to use a store | ADR-0004's negative consequence; where each kind of state lives; the rule. |
| 14:35–15:10 | Trade-offs | What zoneless costs; what production would add. |
| 15:10–15:55 | Traps | The six traps below. |
| 15:55–21:00 | Drill and recap | Five questions, then the five points. |

## Code excerpts

### The search box: writable, and reset by the URL

```ts
// apps/web/src/app/features/catalog/catalog-page.ts
/** Bound from `?q=`, so a search can be bookmarked, shared, and restored by Back. */
readonly q = input<string>();

/** The search box's value: local, seeded from the URL, and reset whenever the URL changes. */
protected readonly query = linkedSignal(() => this.q() ?? '');
// …
constructor() {
  // Every change goes to the store, which debounces, trims and de-duplicates it.
  this.store.search(this.query);
}
```

### A read keyed by a route input

```ts
// apps/web/src/app/core/api/coursewright-api.ts
/** A signal-driven GET that refetches when `courseId` changes. Call it from an injection context. */
course(courseId: () => string): HttpResourceRef<Course | undefined> {
  return httpResource<Course>(() => `/api/courses/${encodeURIComponent(courseId())}`);
}

// apps/web/src/app/features/course/course-page.ts
readonly courseId = input.required<string>();
// …
protected readonly course = this.api.course(this.courseId);
protected readonly notFound = computed(() => this.course.statusCode() === 404);
```

### The two effects the course page needs

```ts
// apps/web/src/app/features/course/course-page.ts
constructor() {
  // The route's title is only "Course"; once loaded, the browser tab names the course.
  effect(() => {
    if (this.course.hasValue()) {
      this.title.setTitle(`${this.course.value().title} · Coursewright`);
    }
  });

  // The Enroll button had focus and has just been removed; without this, focus falls back
  // to <body> and a keyboard user starts again from the top of the page.
  afterRenderEffect(() => {
    if (this.enrollment.status() === 'enrolled') this.enrolledStatus()?.nativeElement.focus();
  });
}
```

### The pattern `linkedSignal` replaces (sketch, not in this repo)

```ts
// Don't: an effect that copies one signal into another.
protected readonly query = signal('');
constructor() {
  effect(() => this.query.set(this.q() ?? ''));
}
```

### A zoneless bug and its fix (sketch, not in this repo)

```ts
// Renders under zone.js; silently stale when zoneless (nothing notifies Angular).
this.api.myEnrollments().subscribe((list) => (this.count = list.items.length));

// Fixed: a signal write schedules the render.
readonly count = signal(0);
this.api.myEnrollments().subscribe((list) => this.count.set(list.items.length));
```

## Demo

```bash
# Where the zone went: only the comment mentions it
git grep -n "zone" -- apps/web/src apps/web/package.json apps/web/angular.json

# Every signal primitive in use
git grep -nE "linkedSignal|httpResource|rxResource|afterRenderEffect|effect\(|signalStore" -- apps/web/src/app

# The specs that prove it: the text field renders a form value on an OnPush host; the store needs no rendering
pnpm --filter @coursewright/web test

# Run the app
pnpm dev   # open http://localhost:4200 and sign in as learner.acme / Coursewright2026!
```

With the app running:
1. **linkedSignal reset.** Search for `forms` in the catalog: the URL gains `?q=forms`. Click **Catalog** in the header. The same page instance stays, the URL loses `?q=`, and the search box clears, because `query` re-derived from the `q` input. Press Back: the box shows `forms` again.
2. **A signal write is a render.** In DevTools → Elements, select the `cw-catalog-page` element, then in the Console run `ng.getComponent($0).query.set('signals')` (Angular's dev-mode `ng` global). The box updates and, 250 ms later, one search request goes out. No zone involved.
3. **The title effect.** Open a course and watch the tab title change from "Course · Coursewright" (the route's title) to the course's own title once the resource resolves.

## Traps to call out

- **A plain field assigned in a callback.** In `subscribe`, a timer or a promise, it changes in memory and never renders. Make it a signal.
- **A snapshot of a signal.** `readonly name = this.auth.user()?.displayName` is read once and never updates. Keep the signal, or `computed`.
- **An effect that derives or copies state.** Use `computed` or `linkedSignal`.
- **Mutating inside a signal.** `items().push(x)` keeps the reference, so nobody is notified. Replace it, as `patchState` does with `[...store.items(), ...items]`.
- **A resource outside an injection context, or for a POST.** The API client's doc comment warns about the first; enrollment is RxJS because of the second.
- **A store by default.** Most state is local; ADR-0004 says plain services would do at this size.

## Key terms

zone.js · zoneless change detection · OnPush / `Eager` · `markForCheck` · signal · `computed` (lazy, memoized, glitch-free) · `effect` · `afterRenderEffect` · `linkedSignal` · `input()` / `input.required()` · `viewChild()` · `httpResource` / `rxResource` / resource · injection context · `signalStore` · `withState` / `withMethods` / `patchState` · `rxMethod` · `fixture.whenStable()` · derived state

## After the video

1. Pick one component in any app you know that assigns a field inside `subscribe`. Rewrite it with a signal, then decide whether the subscription could become a resource.
2. Sketch what `CoursePage` would look like with a resolver and a plain field instead of `httpResource`. List what you lose (loading state in the h1, focus, cancellation) and what you'd gain.
3. The reports page keeps `job`, `exporting`, `downloading` and `error` as component signals. Write the two-sentence review comment that argues for, or against, moving them into a `signalStore`.

## References

- [`docs/study-guide.md`](../../study-guide.md), sections 2 (signals) and 5 (the zoneless talking point)
- [ADR-0004: signals for state, RxJS for events over time](../../adr/0004-signals-and-rxjs-state.md)
- Angular documentation: Signals (`computed`, `effect`, `linkedSignal`), Angular without ZoneJS (zoneless), Resources and `httpResource`, `afterRenderEffect`, component input binding
- NgRx documentation: SignalStore (`withState`, `withMethods`, `patchState`) and RxJS integration (`rxMethod`)
