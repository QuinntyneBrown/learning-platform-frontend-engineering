# 06 · Performance Budgets and Web Vitals

> **Runtime:** ~22 min · **Level:** Senior · **Study guide:** [§5 Performance](../../study-guide.md#5-performance) · **Prerequisites:** [01](../01-layers-boundaries-and-design-system/), [02](../02-signals-and-zoneless-change-detection/), [04](../04-routing-guards-and-deep-links/)

**Video:** [06-performance-budgets-and-web-vitals.mp4](06-performance-budgets-and-web-vitals.mp4) · [Slides](slides.html) · **Audio lesson:** [06-performance-budgets-and-web-vitals.mp3](06-performance-budgets-and-web-vitals.mp3) · [Transcript](script.md)

## Why this video exists

A senior performance answer isn't a list of tricks. It says how you know the app is slow and for whom, what you changed, and how the build stops it getting slow again. Interviewers probe that with field metrics (LCP, INP, CLS), bundle budgets, code splitting, list rendering and pagination. This video answers from Coursewright's code and a real production build:
- `web-vitals` is loaded lazily from `core/observability/rum.ts` and reports from real users;
- budgets in `angular.json` fail CI, and today's initial bundle is 332.79 kB raw, 92.41 kB estimated transfer;
- every feature is a lazy route, the enrollments panel is `@defer (on viewport)`, and forms has its own entry point;
- `@for … track course.id`, zoneless rendering, and what to do about 10,000 rows;
- keyset pagination on a `(tenant_id, title, id)` index, proven by a test and a query plan;
- a step-by-step investigation of poor INP on low-end Android.

## Learning objectives

By the end, the viewer can:

- Define LCP, INP and CLS, their "good" thresholds at the 75th percentile, and why field data beats a lab run.
- Explain how `rum.ts` collects web vitals without adding to the initial bundle, and what it doesn't record yet (attribution, device class).
- Read an Angular production build's chunk table, state what belongs in the initial bundle, and explain how budgets keep it there.
- Choose between a lazy route and a `@defer` block, and explain the placeholder, loading and trigger options.
- Explain how a barrel re-export can pull a heavy dependency into every page, and how a separate entry point fixes it.
- Explain why `OFFSET` degrades with depth and what a keyset cursor needs from an index, using Coursewright's query and index.
- Walk through an INP investigation: segment in the field, reproduce in a trace, read the phase, fix by phase, verify.

## Interview questions this prepares you for

| Question | What a strong answer includes |
|---|---|
| INP is poor on the catalog page for low-end Android devices. How do you find the cause? | Start in the field: p75 INP for the catalog route segmented by device class. Coursewright's RUM events carry `name`, `value`, `rating` and `url` only, so add `web-vitals/attribution` (`interactionTarget`, `inputDelay`, `processingDuration`, `presentationDelay` in web-vitals 6; check your version) and a coarse device class. Reproduce that interaction in the DevTools Performance panel with CPU throttling, or on a real phone via remote debugging. Read the phase: input delay → something else held the main thread (long tasks, third-party, startup); processing → the handler (here each keystroke sets a signal and calls `router.navigate` with `replaceUrl`); presentation → style/layout of a big DOM (a list grown by Load more). Fix by phase (yield/break up long tasks, do less per keystroke, shrink the DOM), then confirm in field data. |
| What goes in the initial bundle, and how do you keep it there? | Only what every page's first render needs: the framework, router, shell, auth, `HttpClient` and interceptors, and the primitives the shell uses. Every feature is a lazy `loadComponent`; below-the-fold parts use `@defer`; heavy dependencies get their own entry point (`@cw/design-system/forms`); monitoring is imported lazily (`web-vitals` is an 8 kB lazy chunk). Budgets in `angular.json` (initial: warn 350 kB, error 500 kB; component styles: 4/8 kB, raw sizes) fail `pnpm build` in CI. Today: 332.79 kB raw, 92.41 kB transfer; the framework is almost all of it. When the budget warns, read `ng build --stats-json` before raising it. |
| `@defer` vs a lazy route: when would you use each? | A lazy route splits by URL: a page users navigate to, with its own guard and title, loaded on navigation. `@defer` splits inside a page: a standalone component and its dependencies, loaded on a trigger (`on viewport`, `interaction`, `hover`, `idle`, `timer`, `when`), with `@placeholder`, `@loading` (Coursewright uses `minimum 300ms` to avoid flashing) and prefetch. Coursewright defers `cw-my-enrollments` on viewport, so its 1.9 kB chunk and its `GET /api/me/enrollments` wait until it's seen. Never defer above the fold: it delays LCP and shifts layout. |
| Why is `OFFSET 10000` slow, and what does a keyset cursor need from the index? | `OFFSET` reads 10,000 rows in order and discards them before returning a page, so cost grows with depth, and inserts shift pages into duplicates or gaps. Keyset remembers the last row's sort key and seeks past it: `(c.title, c.id) > (?, ?) ORDER BY c.title, c.id LIMIT limit + 1`. It needs an index with the equality filter first, then the sort columns in order, ending in a unique tiebreaker: `courses_tenant_title_id ON courses (tenant_id, title, id)`. The query plan is `SEARCH c USING INDEX courses_tenant_title_id (tenant_id=? AND (title,id)>(?,?))` with no temp B-tree for the sort. The cursor is opaque base64url JSON; a test walks all 40 courses in pages of 7 with no duplicates or gaps. Limit: the `LIKE '%q%'` match is checked row by row; at scale use a full-text index. |
| How would you render a list of 10,000 rows? | Mostly don't: page on the server with a keyset cursor (Coursewright loads 20 at a time with Load more; the API caps `limit` at 50). If users truly need to scroll everything, virtualize with the CDK's `cdk-virtual-scroll-viewport` and `*cdkVirtualFor` (not `@for`; check your version), accepting the costs: known or estimated row heights, find-in-page, and screen readers needing set size and position. Track by ID. Keep heavy sorting and filtering on the server or off the main thread. `content-visibility: auto` is a cheaper middle ground that skips rendering off-screen rows. |
| How do you measure web vitals from real users without slowing the page? | `rum.ts` starts from an app initializer and dynamically imports `web-vitals`, so the library is a separate lazy chunk, and it reads buffered performance entries, so starting late loses nothing. It registers `onLCP`, `onINP` and `onCLS`, batches events, and flushes on `visibilitychange` to hidden (the last event a page reliably gets on mobile) or when the batch reaches 10. Transport (`sendBeacon`, `text/plain`) and alerting are lesson 11. |
| How can a barrel file make your bundle bigger? | Barrel re-exports weren't tree-shaken in this build, so re-exporting `TextField` from `design-system/index.ts` would have put `@angular/forms` (about 56 kB, per `forms.ts`) in the initial bundle of every page. `@cw/design-system/forms` is a separate entry point; in today's build forms is a shared lazy chunk (45.98 kB raw, 9.82 kB transfer) loaded only by the login and reports pages. An import path is a bundling decision; check the stats file when a budget moves. |
| What does zoneless change for performance? | No `zone.js` in the bundle, and no app-wide change detection after every timer, promise or request. With OnPush and signals, Angular refreshes only views whose signals changed; template events and signal writes schedule rendering (the comment in `app.config.ts`). It doesn't fix a slow handler or a huge DOM; those still show up as INP processing and presentation delay. Mechanics are lesson 02. |

## Coursewright code on screen

| File | What to show |
|---|---|
| `apps/web/src/app/core/observability/rum.ts` | The lazy `import('web-vitals')` and its comment; `onLCP`/`onINP`/`onCLS`; `record()` fields; the `visibilitychange` flush and `MAX_BATCH` |
| `apps/web/src/app/app.config.ts` | `provideAppInitializer(() => inject(Rum).start())`; the zoneless comment |
| `apps/web/angular.json` | The `initial` and `anyComponentStyle` budgets |
| `.github/workflows/ci.yml` | "Build (fails on Angular bundle budgets)" |
| `apps/web/src/app/app.routes.ts` | Every feature a `loadComponent`; the comment about the initial bundle and `canMatch` |
| `apps/web/src/app/features/catalog/catalog-page.html`, `.css` | `@for (course of store.items(); track course.id)`; the `@defer (on viewport)` block with `@placeholder` and `@loading (minimum 300ms)`; `.deferred { min-height: 6rem }` |
| `apps/web/src/app/features/catalog/my-enrollments.ts` | "costs nothing until it's seen"; `rxResource` |
| `apps/web/src/app/features/catalog/catalog.store.ts`, `catalog-page.ts` | `debounceTime(250)`; the two `patchState` calls; `onSearch()` rewriting the URL per keystroke |
| `apps/web/src/app/design-system/forms.ts`, `index.ts` | Why `TextField` has its own entry point |
| `apps/bff/src/routes/courses.ts` | The keyset comment; `searchCourses`; `limit + 1`; the opaque cursor |
| `apps/bff/src/db.ts` | `CREATE INDEX courses_tenant_title_id ON courses (tenant_id, title, id)` and its comment |
| `apps/bff/test/courses.test.ts` | "walks every course exactly once, in title order" |

## Run sheet

| Time | Segment | Content |
|---|---|---|
| 00:00–01:30 | Hook | The five questions. Thesis: measure in the field, make regressions fail the build. |
| 01:30–02:45 | Web vitals | LCP, INP, CLS and their thresholds (as of September 2026). Lab vs field. |
| 02:45–04:15 | Measuring in the field | `rum.ts`: the lazy import, the three callbacks, the hidden-page flush. What isn't recorded yet. |
| 04:15–06:00 | The initial bundle | Budgets and the CI step. **Demo** the build's chunk table (below). The composition bar: framework vs Coursewright's code. What belongs in the initial bundle. |
| 06:00–08:15 | Lazy and deferred | `app.routes.ts`; the `@defer` diagram and code; placeholder and loading; route vs defer. **Demo** the deferred chunk and request in the Network panel. |
| 08:15–09:10 | Barrels | `forms.ts`; the chunk graph showing forms shared by login and reports. |
| 09:10–11:00 | Rendering work | Zoneless and OnPush; `track course.id`; ten thousand rows: page, virtualize, `content-visibility`. |
| 11:00–13:10 | Keyset pagination | The comment; the query; OFFSET vs keyset diagram; the index and its query plan; the test; the `LIKE` limit and the debounce. |
| 13:10–15:10 | Investigating INP | The four steps; the attribution sketch; the phase diagram; `onSearch()`; fixes by phase. What production would add. |
| 15:10–15:50 | Traps | The eight traps below. |
| 15:50–21:00 | Drill and recap | Five questions, then the five points. |

## Code excerpts

### The budget

```json
// apps/web/angular.json (production configuration)
"budgets": [
  {
    "type": "initial",
    "maximumWarning": "350kB",
    "maximumError": "500kB"
  },
  {
    "type": "anyComponentStyle",
    "maximumWarning": "4kB",
    "maximumError": "8kB"
  }
],
```

### Real-user monitoring, loaded lazily

```ts
// apps/web/src/app/core/observability/rum.ts
// Loaded lazily: monitoring code shouldn't compete with the page for the initial bundle.
private async observeWebVitals(): Promise<void> {
  const { onCLS, onINP, onLCP } = await import('web-vitals');
  const report = ({ name, value, rating }: Metric) =>
    this.record({ kind: 'web-vital', name, value, rating, url: this.url() });
  onLCP(report);
  onINP(report);
  onCLS(report);
}
```

### Deferred below the fold

```html
<!-- apps/web/src/app/features/catalog/catalog-page.html -->
<!-- Below the fold: its code and its request wait until it scrolls into view. -->
@defer (on viewport) {
  <cw-my-enrollments />
} @placeholder {
  <p class="deferred">Your enrollments</p>
} @loading (minimum 300ms) {
  <p class="deferred">Loading your enrollments…</p>
}
```

### Keyset pagination and its index

```ts
// apps/bff/src/routes/courses.ts
const where = ['c.tenant_id = ?', "c.title LIKE ? ESCAPE '\\'"];
const params: SQLInputValue[] = [tenantId, `%${escapeLike(q)}%`];
if (after) {
  where.push('(c.title, c.id) > (?, ?)'); // SQLite row values compare title first, then id
  params.push(after.title, after.id);
}
const sql = `
  SELECT ${SUMMARY_COLUMNS}
  FROM courses c
  WHERE ${where.join(' AND ')}
  ORDER BY c.title, c.id
  LIMIT ?`;
```

```sql
-- apps/bff/src/db.ts
-- Keyset pagination seeks to (title, id) within one tenant and reads forward in that order.
-- This index makes each page a range scan, however deep the page is.
CREATE INDEX courses_tenant_title_id ON courses (tenant_id, title, id);
```

`EXPLAIN QUERY PLAN` for the search with a cursor, run against `db.ts` and the seed (not part of the repo):

```text
SEARCH c USING INDEX courses_tenant_title_id (tenant_id=? AND (title,id)>(?,?))
CORRELATED SCALAR SUBQUERY 1
SEARCH l USING INDEX sqlite_autoindex_lessons_2 (course_id=?)
```

### INP attribution (sketch, not in this repo)

```ts
// Field names from web-vitals 6 (the version in apps/web/package.json); check yours.
// The RumEvent schema in contracts/openapi.yaml would change first (lesson 07).
import { onINP } from 'web-vitals/attribution';

onINP(({ name, value, rating, attribution }) => {
  this.record({
    kind: 'web-vital', name, value, rating, url: this.url(),
    target: attribution.interactionTarget,
    inputDelay: attribution.inputDelay,
    processing: attribution.processingDuration,
    presentation: attribution.presentationDelay,
    cores: navigator.hardwareConcurrency,
  });
});
```

## Demo

```bash
# The chunk table: initial total, estimated transfer, and every lazy chunk (writes only to apps/web/dist/)
pnpm --filter @coursewright/web build
#   Initial total  | 332.79 kB | 92.41 kB     (September 2026)
#   web-vitals     |   8.19 kB |  2.89 kB
#   catalog-page   |   7.78 kB |  3.14 kB  ... and a 45.98 kB unnamed chunk: @angular/forms

# What's inside each chunk: writes apps/web/dist/web/browser-stats.json (an esbuild metafile)
pnpm --filter @coursewright/web exec ng build --stats-json

# Where the code splits
git grep -n "loadComponent\|@defer\|import('web-vitals')" -- apps/web/src

# The keyset test (walks every page) and the debounce test (fake timers)
pnpm --filter @coursewright/bff test
pnpm --filter @coursewright/web test
```

Load `browser-stats.json` into esbuild's online bundle analyzer to see the initial chunk broken down by package. Then run `pnpm dev`, open http://localhost:4200 and sign in as `learner.acme` / `Coursewright2026!`:
1. DevTools → Network. Scroll the catalog to the bottom: a new JavaScript chunk and `GET /api/me/enrollments` appear only when "Your enrollments" scrolls into view.
2. Click Load more: the new request carries `cursor=`, and the Elements panel flashes only the newly added list items.
3. DevTools → Performance, set CPU throttling to 4× or 6× slowdown, record typing "signals" in the search box, and inspect the interaction's input delay, processing and presentation delay.
4. Switch to another tab: the BFF terminal logs a `rum event` line per metric, beaconed when the page became hidden.
5. Run Lighthouse on the catalog for the lab view, and note that it reports no INP.

## Traps to call out

- **Measuring only in Lighthouse on a fast laptop.** Lab data can't measure INP and doesn't look like your users' devices.
- **Raising the budget every time it fails.** A budget nobody defends is decoration. Read the stats first.
- **Heavy re-exports in a barrel.** They land in every chunk that touches the barrel. Give heavy code its own entry point.
- **Deferring above the fold.** It delays LCP and shifts the page.
- **Tracking by index.** Reordered or replaced data rebuilds the DOM; track by a stable ID.
- **OFFSET behind infinite scroll.** Cost grows with depth, and inserts cause duplicates and gaps.
- **Ten thousand rows in the DOM.** Page on the server, or virtualize.
- **Eager monitoring or third-party scripts.** The tools that measure the page shouldn't slow it down.

## Key terms

Core Web Vitals · LCP · INP (input delay, processing duration, presentation delay) · CLS · p75 · field vs lab data · RUM · `web-vitals` attribution build · buffered performance entries · initial bundle · budget (`initial`, `anyComponentStyle`) · raw vs estimated transfer size · lazy route / `loadComponent` · `@defer` (`on viewport`, `@placeholder`, `@loading`, prefetch) · code splitting · barrel file / entry point · tree-shaking · zoneless · OnPush · `@for … track` · virtual scrolling (`cdk-virtual-scroll-viewport`) · `content-visibility` · keyset pagination · `OFFSET` · composite index · query plan · debounce

## After the video

1. Add the attribution fields to the INP event as a design: the `RumEvent` schema change in `openapi.yaml`, the `rum.ts` change, and what the BFF would log. Decide how to keep the payload small.
2. Pick a heavy dependency a new feature might need (a charting library, say) and plan how it stays out of the initial bundle: route, `@defer` trigger, entry point, and a budget check.
3. Write the SQL for "page 3 of courses sorted by duration, then ID" with keyset pagination, and the index it needs. What changes when duration isn't unique?

## References

- [`docs/study-guide.md`](../../study-guide.md), section 5
- [ADR-0006: observability](../../adr/0006-observability.md) (performance guardrails in CI; RUM)
- Lesson 02 (zoneless and signals), lesson 03 (the debounced search), lesson 04 (lazy routes and `canMatch`), lesson 11 (RUM transport and alerting)
- web.dev: the Core Web Vitals, INP and "Optimize INP" guides (thresholds as of September 2026)
- `web-vitals` library documentation: the attribution build
- Angular documentation: deferrable views (`@defer`), build budgets, `@for` and `track`, zoneless
- Angular CDK documentation: scrolling (virtual scroll)
- SQLite documentation: row values, `EXPLAIN QUERY PLAN`, and the query planner
