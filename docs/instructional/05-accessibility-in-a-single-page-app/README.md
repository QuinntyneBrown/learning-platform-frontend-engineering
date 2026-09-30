# 05 · Accessibility in a Single-Page App

> **Runtime:** ~22 min · **Level:** Senior · **Study guide:** [§4 Accessibility](../../study-guide.md#4-accessibility) · **Prerequisites:** [01](../01-layers-boundaries-and-design-system/), [04](../04-routing-guards-and-deep-links/)

**Video:** [05-accessibility-in-a-single-page-app.mp4](05-accessibility-in-a-single-page-app.mp4) · [Slides](slides.html) · **Audio lesson:** [05-accessibility-in-a-single-page-app.mp3](05-accessibility-in-a-single-page-app.mp3) · [Transcript](script.md)

## Why this video exists

Senior accessibility questions aren't about alt text. They're about what a single-page app breaks that a page load used to do for free: focus resets, and "new page" announcements. And they ask whether you can keep a whole team from breaking it again. A weak answer lists ARIA attributes. A strong answer names the duty the app took over from the browser, shows the code that fulfils it, and shows the test that keeps it fulfilled. This video builds that answer from Coursewright's code:
- route focus and a page announcement after every path change (`shell/route-focus.ts`);
- one polite live announcer, plus `role="status"` regions that change only when results settle;
- one `role="alert"` summary per form, busy instead of disabled, and focus placed deliberately after the Enroll button disappears;
- native elements first, with ARIA only filling gaps;
- template lint, axe on real pages and a keyboard path in Playwright, plus the limits of all three.

## Learning objectives

By the end, the viewer can:

- Explain what a route change in a single-page app fails to do for screen-reader and keyboard users, and how `route-focus.ts` restores focus and an announcement, including why it ignores query-only changes and the initial load.
- Explain how live regions work, why `LiveAnnouncer` clears and re-sets its text on a later task, and why a region must exist before its text changes.
- Announce async results and job progress without announcing every keystroke or every percentage.
- Design form error handling: fields described with `aria-describedby` and `aria-invalid`, one summary with `role="alert"`, and busy rather than disabled buttons.
- Decide where focus goes when the focused element is removed, using `afterRenderEffect`.
- Review a custom `div` dropdown against the native `select` and the ARIA pattern.
- Name the WCAG 2.2 AA criteria that single-page apps most often break, and describe a team definition of done that keeps accessibility working.

## Interview questions this prepares you for

| Question | What a strong answer includes |
|---|---|
| A screen-reader user says "nothing happens" after clicking a link in your SPA. What's wrong, and how do you fix it? | The router swapped the content without a page load, so focus stayed on a link that no longer exists (and fell back to `<body>`), and the screen reader had nothing to announce. Fix: after each `NavigationEnd` whose *path* changed, wait for the render (`afterNextRender`), focus the new page's `main h1` (falling back to `<main>`) with `tabindex="-1"`, and announce "`<title>` page loaded" through a polite live region. Ignore query-only changes (`?q=` while typing) with `distinctUntilChanged` on the path, and `skip(1)` the initial load. Keep one `h1` whose text changes, so focus isn't dropped while data loads. Coursewright: `shell/route-focus.ts`; the learner-journey spec asserts the `h1` is focused. |
| How do you announce async results ("12 courses found") without announcing every keystroke? | A `role="status"` region (polite by definition) that is **always rendered**, because a live region must exist before its text changes. Its text is a `computed` of the store: "Searching…", "20+ courses found", "No courses match …". The search is debounced (250 ms) so the region changes after the user pauses. Short text (a count, not the list), polite not assertive. For long-running work, announce state transitions (queued, running with the attempt, completed, failed), not percentages; the native `<progress>` exposes its value for anyone who wants it. |
| Review a custom dropdown built from `div`s. What's missing? | First: why not a native `<select>`? The reports page uses one. Otherwise: an accessible name from a label; roles (combobox or button, `listbox`, `option`); state (`aria-expanded`, the selected option); keyboard (Tab to reach, arrows, Enter, Escape, Home/End, typeahead); focus returning to the control on close; a visible focus ring; target size. Point to the ARIA Authoring Practices pattern or a tested headless library (the Angular CDK listbox). Coursewright's template lint rejects a click-only `div` (`click-events-have-key-events`, `interactive-supports-focus`). |
| Which WCAG 2.2 criteria does a sticky header most often break? | 2.4.11 Focus Not Obscured (Minimum), AA: tabbing backwards or following a skip link scrolls the focused element under the header; fix with `scroll-padding-top` equal to the header height. 1.4.10 Reflow: at 400% zoom a sticky header can fill most of the viewport; let it scroll away on short viewports. 2.5.8 Target Size (Minimum), AA: 24 × 24 CSS px or enough spacing for the icon buttons headers pack in. Verify with a keyboard at high zoom, not only axe. (Coursewright's header isn't sticky.) |
| How would you make accessibility part of the definition of done for a whole team? | Accessible primitives in the design system so most screens inherit correct behaviour. Template lint and axe on real pages, blocking in CI (Coursewright already does both). A keyboard pass in the PR template; a screen-reader pass (NVDA, VoiceOver, TalkBack) on key journeys each release. Design annotations for headings, focus order and names. Accessibility bugs triaged by severity like any other. A champion per team, and training. Production adds Storybook a11y tests, forced-colors styles and a VPAT for enterprise buyers. |
| Why does Coursewright's skip link move focus itself instead of relying on `href="#main"`? | With `<base href="/">`, a plain `#main` link resolves to `/#main`, which navigates away from the current route. The click handler calls `preventDefault()` and focuses `<main>` (`id="main"`, `tabindex="-1"`). The `href` stays so it's still a real link. It's off-screen until focused. `shell.spec.ts` checks that it's the first focusable element and that clicking it focuses `<main>`; the E2E keyboard test presses Tab then Enter. |
| Why busy instead of disabled, and where does focus go when the focused button disappears? | A disabled button drops focus, is skipped by Tab and hides why it's unavailable; `aria-busy` keeps focus and still lets `exhaustMap` absorb repeats (lesson 03). When enrolling succeeds, the Enroll button is replaced by "You're enrolled"; without help focus falls to `<body>`. `course-page.ts` uses `afterRenderEffect` to focus the new paragraph (`tabindex="-1"`) once it's rendered, and the controller announces "You're enrolled". Rule: whenever you remove the focused element, decide where focus goes. |
| What does automated accessibility testing catch, and what doesn't it? | Catches: missing names and labels, invalid ARIA, contrast, click-only elements (angular-eslint template rules on every template; axe tagged `wcag2a` to `wcag22aa`, failing on serious/critical, on the sign-in, catalog, course and reports pages). Role and label queries in Playwright double as checks. Misses (perhaps two-thirds of issues): whether focus goes somewhere sensible, whether announcements make sense, whether Tab order matches reading order. That needs a keyboard walkthrough and screen-reader passes. |

## Coursewright code on screen

| File | What to show |
|---|---|
| `apps/web/src/app/shell/route-focus.ts` | The comment; `NavigationEnd` → path only → `distinctUntilChanged` → `skip(1)`; `afterNextRender`; focus `main h1` with `tabindex="-1"`; ``announce(`${title} page loaded`)`` |
| `apps/web/src/app/shell/shell.ts`, `shell.html`, `shell.css` | `focusPageOnNavigation()` in the constructor; the skip link and `skipToMain()` with its `<base href>` comment; `<main id="main" tabindex="-1">`; `aria-label="Main"`; `ariaCurrentWhenActive="page"`; the thicker active underline |
| `apps/web/src/app/shell/shell.spec.ts` | The skip link is the first focusable element and focuses `<main>` |
| `apps/web/src/app/design-system/live-announcer.ts` | One polite, atomic, visually hidden region; clear, then set 100 ms later |
| `apps/web/src/app/design-system/tokens.css` | `:focus-visible`; `[tabindex='-1']:focus:not(:focus-visible)`; reduced motion; `.cw-visually-hidden` |
| `apps/web/src/app/design-system/progress/progress.ts` | A native `<progress>` with a visible label; the percentage `aria-hidden` |
| `apps/web/src/app/features/catalog/catalog-page.html`, `.ts` | `role="search"` with a real label; the always-rendered `role="status"` paragraph; `statusText` |
| `apps/web/src/app/features/login/login-page.html`, `login-page.spec.ts` | The one-alert comment; `role="alert"` summary; `novalidate`; `autocomplete`; the spec counting alerts and `aria-invalid` inputs |
| `apps/web/src/app/features/course/course-page.ts`, `.html` | One `h1` whose text changes; busy Enroll button; `#enrolledStatus` with `tabindex="-1"`; `afterRenderEffect` focusing it |
| `apps/web/src/app/features/reports/reports-page.ts`, `.html` | The native `<select>` with hint; `cw-progress`; the always-rendered status region; `statusText` by job state |
| `apps/web/eslint.config.js` | `angular.configs.templateAccessibility` on every `**/*.html` |
| `apps/web/e2e/support.ts`, `accessibility.spec.ts`, `learner-journey.spec.ts` | axe tags and the serious/critical filter; the four scanned pages; the Tab/Enter skip-link test; `toBeFocused()` on the course `h1` |

## Run sheet

| Time | Segment | Content |
|---|---|---|
| 00:00–01:30 | Hook | The five questions. Thesis: an SPA takes over the browser's jobs, so it inherits its accessibility duties. |
| 01:30–02:30 | A page load for free | Multi-page vs SPA diagram: focus reset, title, reading from the top vs focus on `<body>` and silence. Three things to put back. |
| 02:30–04:45 | Route focus | `route-focus.ts` top to bottom: the pipeline diagram, the query-only filter, `skip(1)`, `afterNextRender`, `tabindex="-1"`, the announcement. The `:focus-visible` rule for script-focused headings. One `h1` whose text changes. The Playwright assertion. |
| 04:45–07:15 | Live regions | `LiveAnnouncer`: polite vs assertive, clear-then-set. The catalog's `role="status"` and `statusText`; the debounce timeline diagram. The reports page: native `<progress>`, status by job state, not percentage. |
| 07:15–08:50 | Forms and focus | The login error summary and its spec. Busy vs disabled. The Enroll button disappearing and `afterRenderEffect` placing focus. |
| 08:50–10:05 | Skip link and landmarks | `shell.html` and `shell.ts`: why the link moves focus itself. `nav aria-label="Main"`, `ariaCurrentWhenActive`. `shell.spec.ts`. **Demo** the keyboard path (below). |
| 10:05–11:25 | Native first | Button, progress, select. "No ARIA is better than bad ARIA." The div-dropdown review, and **demo** lint rejecting it. |
| 11:25–12:45 | Testing | Three levels. Template rules; the axe helper; the keyboard test; what automation can't tell you. |
| 12:45–14:30 | WCAG 2.2 and done | Focus Not Obscured, Target Size, Accessible Authentication. The sticky-header diagram. The definition of done; what production would add. |
| 14:30–15:15 | Traps | The eight traps below. |
| 15:15–21:00 | Drill and recap | Five questions, then the five points. |

## Code excerpts

### Route focus: only a new path counts

```ts
// apps/web/src/app/shell/route-focus.ts
router.events
  .pipe(
    filter((event) => event instanceof NavigationEnd),
    // Only a new path counts: query-only changes (the catalog's ?q=) must not steal focus
    // from the search box while the user types.
    map((event) => event.urlAfterRedirects.split(/[?#]/)[0]),
    distinctUntilChanged(),
    // On the initial load the screen reader already reads the new document from the top.
    skip(1),
    takeUntilDestroyed(),
  )
  .subscribe(() => {
    afterNextRender(
      () => {
        const target =
          document.querySelector<HTMLElement>('main h1') ?? document.getElementById('main');
        if (target) {
          target.setAttribute('tabindex', '-1');
          target.focus();
        }
        const title = titles.buildTitle(router.routerState.snapshot);
        if (title) announcer.announce(`${title} page loaded`);
      },
      { injector },
    );
  });
```

### One polite live region, re-announceable

```ts
// apps/web/src/app/design-system/live-announcer.ts
announce(message: string): void {
  const region = (this.region ??= this.createRegion());
  // Clear, then set on a later task: screen readers announce changes to a region, so this
  // also re-announces a message identical to the previous one. The region must already be in
  // the DOM when its text changes, which is why the first call creates it before setting text.
  region.textContent = '';
  clearTimeout(this.pending);
  this.pending = setTimeout(() => (region.textContent = message), 100);
}
```

### One alert per form

```html
<!-- apps/web/src/app/features/login/login-page.html -->
<!-- One alert for the whole form: it is inserted with its text, so screen readers announce it once. -->
@if (errorMessage(); as message) {
  <p class="error-summary" role="alert">{{ message }}</p>
}
```

### Focus after the focused button disappears

```ts
// apps/web/src/app/features/course/course-page.ts
// The Enroll button had focus and has just been removed; without this, focus falls back
// to <body> and a keyboard user starts again from the top of the page.
afterRenderEffect(() => {
  if (this.enrollment.status() === 'enrolled') this.enrolledStatus()?.nativeElement.focus();
});
```

### Keeping focus clear of a sticky header (sketch, not in this repo)

```css
/* Coursewright's header isn't sticky. If it were: */
.header {
  position: sticky;
  top: 0;
}
html {
  scroll-padding-top: var(--header-height); /* focused and fragment targets land below it */
}
@media (max-height: 30rem) {
  .header { position: static; } /* at high zoom, let it scroll away (Reflow) */
}
```

## Demo

```bash
# Every live region and alert in the web app
git grep -n 'role="status"\|role="alert"\|aria-live' -- apps/web/src

# The unit tests for the skip link, the text field's wiring and the login form's single alert
pnpm --filter @coursewright/web test

# Template lint rejects a click-only div (linted from stdin; no file is written)
printf '<div class="select" (click)="toggle()">{{ selected() }}</div>\n' \
  | pnpm --filter @coursewright/web exec eslint --stdin --stdin-filename src/app/features/catalog/dropdown-sketch.html
#   error  click must be accompanied by either keyup, keydown or keypress event for accessibility  @angular-eslint/template/click-events-have-key-events
#   error  Elements with interaction handlers must be focusable  @angular-eslint/template/interactive-supports-focus

# axe on four pages, plus the keyboard path (starts its own BFF and web server)
pnpm --filter @coursewright/web exec playwright test e2e/accessibility.spec.ts
```

Then run `pnpm dev`, open http://localhost:4200 and sign in as `learner.acme` / `Coursewright2026!`:
1. Reload the catalog and press Tab: the skip link appears. Press Enter: focus moves to `<main>` and the URL doesn't change.
2. Type in the search box: focus stays put while `?q=` updates. In DevTools, open the Accessibility pane on the status paragraph under the search box to see its `status` role, and watch its text settle after you stop typing.
3. Click a course. In the console, `document.activeElement` is the `h1`. The DevTools Elements panel shows the visually hidden `aria-live="polite"` region at the end of `<body>` with "Course page loaded".
4. Tab to Enroll and press Enter: focus lands on "You're enrolled".
5. Sign in as `manager.acme`, export a report, and watch the status line change by state while the progress bar fills.
6. DevTools → Rendering → "Emulate CSS media feature prefers-reduced-motion: reduce": the busy spinner stops animating.

For the real test, turn on a screen reader (NVDA on Windows, VoiceOver with Cmd+F5 on a Mac) and repeat steps 1 to 4.

## Traps to call out

- **Moving focus on every navigation.** Query-only changes (`?q=`) would steal focus from the search box on every keystroke.
- **Creating a live region with its text.** A region must be in the DOM before its text changes; insert-with-text is often silent.
- **Announcing every keystroke or every progress tick.** Debounce, and announce settled results and state changes.
- **`role="alert"` on every field error.** Three invalid fields, three interruptions. One summary alerts; fields are described.
- **Disabled buttons while working.** Focus drops and the reason disappears. Use `aria-busy`.
- **A `div` with a click handler.** Use the native element; lint says so.
- **`outline: none` globally.** Use `:focus-visible`, as `tokens.css` does.
- **A clean axe run treated as proof.** Automation finds a minority of issues; do the keyboard and screen-reader passes.

## Key terms

route focus · `tabindex="-1"` · live region · `aria-live` polite / assertive · `aria-atomic` · `role="status"` · `role="alert"` · error summary · `aria-describedby` / `aria-invalid` · `aria-busy` · `aria-current="page"` · skip link · landmarks (`main`, `nav`, `search`) · `:focus-visible` · `prefers-reduced-motion` · visually hidden · `afterNextRender` / `afterRenderEffect` · axe · angular-eslint template accessibility · WCAG 2.2 AA · Focus Not Obscured · Target Size (Minimum) · Accessible Authentication · Reflow · VPAT / accessibility conformance report

## After the video

1. Write the accessibility review comments for a custom `div` dropdown in a pull request, then decide which ones the lint rules already cover and which need a person.
2. Draft a pull-request template section for accessibility: the keyboard path, focus after actions, what gets announced, and when a screen-reader pass is required.
3. Design the announcements for a bulk-enrollment job (lesson 09): which state changes go in the status region, what goes in an alert, and where focus goes when the job finishes.

## References

- [`docs/study-guide.md`](../../study-guide.md), section 4
- Lesson 01 (the text field's wiring, busy vs disabled), lesson 02 (`afterRenderEffect`), lesson 03 (the debounced search), lesson 04 (the title strategy)
- WCAG 2.2 (as of September 2026, the current W3C Recommendation): 2.4.1 Bypass Blocks, 2.4.3 Focus Order, 2.4.7 Focus Visible, 2.4.11 Focus Not Obscured (Minimum), 2.5.8 Target Size (Minimum), 3.3.1 Error Identification, 3.3.8 Accessible Authentication (Minimum), 4.1.3 Status Messages, 1.4.10 Reflow
- WAI-ARIA Authoring Practices Guide: the Combobox and Listbox patterns; "No ARIA is better than bad ARIA"
- Angular documentation: `afterNextRender`, `afterRenderEffect`, `RouterLinkActive` (`ariaCurrentWhenActive`), the CDK listbox
- angular-eslint documentation: the template accessibility rules
- axe-core and `@axe-core/playwright` documentation
