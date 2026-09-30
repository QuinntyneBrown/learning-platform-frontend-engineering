# 06 · Performance Budgets and Web Vitals

Welcome. At senior level, a performance question is rarely "how do you make it fast". It's "how do you know it's slow, for whom, and how do you stop it getting slow again". By the end of this lesson, you should be able to explain the three web vitals and how Coursewright measures them from real users, what belongs in the initial bundle and how budgets, lazy routes and deferred blocks keep it there, why keyset pagination beats an offset, and how you'd investigate a slow interaction on a low-end phone.

## The questions this lesson answers

Here are the questions this lesson prepares you for. Interaction to Next Paint is poor on the catalog page for low-end Android devices: how do you find the cause? What goes in the initial bundle, and how do you keep it there? When would you use a deferred block, and when a lazy route? Why is an offset of ten thousand slow, and what does a keyset cursor need from the index? And how would you render a list of ten thousand rows?

Keep one sentence in your head while you listen. Measure what users feel, in the field, and make regressions fail the build. Performance that isn't budgeted erodes, exactly like architecture that isn't linted.

## What users feel: three web vitals

As of September 2026, Google's Core Web Vitals are three metrics, each judged at the seventy-fifth percentile of real page visits. Check the thresholds for your year.

LCP, Largest Contentful Paint, is loading: when the largest image or block of text in the viewport has rendered. Good is two and a half seconds or less.

INP, Interaction to Next Paint, is responsiveness: the time from a click, tap or key press to the next frame the user sees, roughly the slowest interaction of the visit. Good is two hundred milliseconds or less, and poor is over five hundred.

CLS, Cumulative Layout Shift, is stability: how much visible content moves unexpectedly. Good is a score of zero point one or less.

The important word is field. Lighthouse runs one page load, on one machine, with no real user. It can't measure INP at all, because nobody interacts. Your users are on mid-range phones with forty tabs open. So you need real-user monitoring.

## How Coursewright measures them

Open `apps/web/src/app/core/observability/rum.ts`. The `Rum` service starts from an app initializer in `app.config.ts`. Its start method calls a private method that observes the vitals, and that's where the performance decision is. The first line is a dynamic import of the `web-vitals` library, with the comment: loaded lazily, because monitoring code shouldn't compete with the page for the initial bundle. In the production build, `web-vitals` is its own lazy chunk, about eight kilobytes raw and three over the wire. Starting late doesn't lose data, because the library asks the browser for buffered performance entries.

It then registers three callbacks, for LCP, INP and CLS, and each one records the metric's name, its value, the library's rating of good, needs improvement or poor, and the page URL. The service batches those events and flushes them when the page becomes hidden, or when a batch fills up. The comment explains why: hidden is the last event a page reliably gets, because mobile browsers may discard a background tab without ever firing unload, and the library reports its final values then too. Lesson eleven covers the beacon and the endpoint that receives it.

Notice what isn't recorded yet: which element the user interacted with, and what kind of device they were on. We'll come back to that.

## The initial bundle and its budget

Now the build. Open `apps/web/angular.json`. The production configuration has two budgets. The initial bundle warns at three hundred and fifty kilobytes and fails at five hundred. Any single component's styles warn at four kilobytes and fail at eight. Budgets compare raw sizes, before compression. And because continuous integration runs the production build, an initial bundle over five hundred kilobytes is a red build, not a quarterly surprise.

Here's where it stands today. The production build reports an initial total of about three hundred and thirty-three kilobytes raw, and about ninety-two kilobytes over the wire. That leaves seventeen kilobytes of headroom before the warning. The study guide measured a bare Angular app with a router and the HTTP client at about two hundred and twelve kilobytes, and the build's stats file agrees: Angular's core, router and common packages, plus RxJS, are almost all of it. Coursewright's own shell, core and design-system code is under five percent.

So what belongs in the initial bundle? Only what the first render of any page needs: the framework, the shell, authentication, the HTTP client and its interceptors, and the few primitives the shell uses. Everything a particular page needs goes in that page's chunk. When the budget warns, read the stats before you guess. Then move something out, or raise the limit as a deliberate decision.

## Lazy routes and deferred blocks

Open `apps/web/src/app/app.routes.ts`. Every feature is a `loadComponent` with a dynamic import, and the comment says the consequence: the initial bundle is just the shell, core and design system. Lesson four covers why `canMatch` also keeps a guarded feature's code from downloading at all. Each page's chunk is small: the catalog is about eight kilobytes raw, and the course page about five.

Inside a page, the tool is a deferred block. Open `features/catalog/catalog-page.html`. At the bottom, the "your enrollments" panel sits in an `@defer` block with the `on viewport` trigger. The comment says: below the fold, its code and its request wait until it scrolls into view. The component, in `my-enrollments.ts`, loads its data with a resource, so the request only starts when the component exists. Its chunk is under two kilobytes. The real saving is the request and the rendering work, not the bytes.

The block has two companions. The placeholder is a paragraph with a minimum height, and it's the element the viewport trigger watches. The loading block has a minimum of three hundred milliseconds, so once it appears it doesn't flash away.

That answers the third question. A lazy route splits by URL. It's a destination users navigate to, with its own guard and title, loaded on navigation. A deferred block splits inside a page. It's a component and its dependencies, loaded on a trigger: when it enters the viewport, on interaction or hover, when the browser is idle, on a timer, or when a condition becomes true. Use a route for a page. Use a deferred block for a heavy or below-the-fold part of a page, like a chart, a rich editor or this panel. And never defer what's above the fold. That delays the Largest Contentful Paint and makes the page jump.

## Barrels and the forms entry point

Lesson one mentioned a trap, and here are the numbers. Open `design-system/forms.ts`. The comment says the text field pulls in Angular's forms package, about fifty-six kilobytes. Barrel re-exports weren't tree-shaken in this build, so exporting it from the main design-system barrel would put forms in the initial bundle of every page. So it has its own entry point, `@cw/design-system/forms`, and only the login page imports it.

In today's build, forms sits in its own lazy chunk, about forty-six kilobytes raw and ten over the wire, shared by the login and reports pages, because the reports page uses a form control for its select. None of it is in the initial bundle. The lesson is that an import path is also a bundling decision. A barrel that re-exports something heavy drags it into every chunk that touches the barrel.

## Rendering work: zoneless, tracking and big lists

Bytes are only half of it. The other half is work on the main thread after the code arrives.

Open `app.config.ts`. The comment says zoneless is the default: there's no `zone.js`, and signals and template events schedule rendering. Lesson two covers the mechanics. The performance point is simple: no `zone.js` in the bundle, and no app-wide change detection after every timer and request. With on push components and signals, Angular refreshes only the views whose signals changed.

Lists are where rendering work piles up. In `catalog-page.html`, the results use `@for`, tracked by `course.id`. The track expression is required, and choosing it matters. When Load more appends a page, tracking by ID keeps the existing list items and adds new ones. When a new search returns fresh objects, tracking by ID reuses the DOM for courses in both results, instead of rebuilding the list.

That leads to the fifth question: ten thousand rows. First answer: don't send ten thousand rows. Page on the server, as Coursewright does, twenty at a time with a Load more button, and a limit capped at fifty by the API. If users genuinely need to scroll ten thousand rows, virtualize. The Angular CDK's virtual scroll viewport keeps only the visible rows in the DOM, using its own `*cdkVirtualFor` rather than `@for`; check that for your version. Virtualizing has costs: row heights, find in page, and screen readers, which need to know the full size and position of each row. A cheaper middle ground is the CSS `content-visibility` property, which skips rendering work for rows off screen while keeping them in the DOM.

## Keyset pagination and the index

Now the server side. Open `apps/bff/src/routes/courses.ts` and find `searchCourses`. Its comment says: keyset pagination, not OFFSET. Each page seeks straight to where the last one ended using the tenant, title and ID index, so page fifty costs the same as page one, and rows added or removed meanwhile can't shift later pages into duplicates or gaps. The ID breaks ties between equal titles.

The query filters by tenant and title, adds "title and ID greater than the cursor's title and ID" when there's a cursor, orders by title then ID, and asks for one more row than the limit. If that extra row comes back, there's another page. The cursor is the last row's title and ID, encoded so clients treat it as opaque.

Here's the fourth question. An offset of ten thousand is slow because the database has to walk ten thousand rows in order and throw them away before it returns twenty. The cost grows with every page, and inserts shift the pages under the user. A keyset cursor needs an index whose columns match the query: the equality filter first, then the sort columns in order, ending in a unique column. `apps/bff/src/db.ts` creates exactly that index, on tenant ID, title and ID, with a comment that it makes each page a range scan, however deep. And `apps/bff/test/courses.test.ts` walks all forty seeded courses in pages of seven, and checks there are no duplicates and no gaps.

Be honest about one limit. The title search is a substring match with a leading wildcard, which no ordinary index can use. The index still gives the tenant seek and the order, but the match is checked row by row. At catalog scale that's fine. At real scale, you'd use a full-text index. On the client, the search is debounced by two hundred and fifty milliseconds, and stale requests are cancelled, as lesson three shows.

## Investigating poor INP

Now the core question. INP is poor on the catalog page for low-end Android devices. How do you find the cause?

First, confirm and segment it in the field. You want the seventy-fifth percentile for the catalog route, split by device class, and you want to know which interaction is slow. Coursewright's events don't carry that yet, so step one is to add it. The web-vitals library has an attribution build that reports the element interacted with, and splits the time into input delay, processing time and presentation delay. Check the field names for your version. Add a coarse device class, like memory and CPU cores.

Second, reproduce it. Record the interaction the data points at in the DevTools Performance panel, with the CPU throttled, or on a real low-end phone through remote debugging.

Third, read the phase. A long input delay means the main thread was busy with something else when the user acted: a long task from rendering, a third-party script, or your own startup work. Long processing is your handlers and what they trigger. In Coursewright, each keystroke updates a signal and rewrites the URL through the router; cheap on a laptop, but worth measuring on a phone. A long presentation delay is style and layout, often a DOM that grew with every Load more.

Then fix by phase: break up long tasks and yield to the main thread, do less per keystroke, and shrink the DOM. Finally, verify in the field, because a lab trace proves only that the lab is faster.

What production would add: server rendering with incremental hydration for public catalog pages, optimized responsive images, Lighthouse checks in continuous integration for key pages, and attribution in the real-user data.

## Traps

Here are the traps to call out.

Measuring only with Lighthouse on a fast laptop. Your users aren't on it.

Raising the budget every time it fails. A budget nobody defends is decoration.

Re-exporting something heavy from a barrel, so it lands in every chunk.

Deferring content above the fold, which delays LCP and shifts the page.

Tracking list items by index, so the DOM is rebuilt when the data changes.

Offset pagination behind an infinite scroll.

Putting ten thousand rows in the DOM.

And loading monitoring or third-party scripts eagerly, so the tools that measure the page slow it down.

## Interview drill

Let's practise. After each question there's a short pause. Pause the audio if you want more time, answer out loud, and then compare your answer with the model answer.

**Interviewer:** INP is poor on the catalog page for low-end Android devices. How do you find the cause?

[pause 5s]

Start in the field: the seventy-fifth percentile INP for that route, segmented by device, with attribution from the web-vitals library, so I know which element and which phase, input delay, processing or presentation. Then reproduce that interaction in a DevTools trace with CPU throttling, or on a real device. Input delay means something else held the main thread, so break up long tasks. Processing means the handler does too much, like rewriting the URL on every keystroke. Presentation means layout of a large DOM, so paginate or virtualize. Then confirm the fix in field data.

**Interviewer:** What goes in the initial bundle, and how do you keep it there?

[pause 5s]

Only what the first render of every page needs: the framework, the shell, authentication, the HTTP client, and the primitives the shell uses. Every feature is a lazy route, below-the-fold parts are deferred blocks, and heavy dependencies get their own entry point, like Coursewright's forms entry point. Monitoring code is imported lazily. A budget in the production build fails continuous integration: Coursewright warns at three hundred and fifty kilobytes and fails at five hundred, and sits at about three hundred and thirty-three. When it warns, read the stats before raising it.

**Interviewer:** When would you use a deferred block, and when a lazy route?

[pause 5s]

A lazy route splits by URL. It's a page users navigate to, with its own guard and title, loaded on navigation. A deferred block splits inside a page: a component and its dependencies, loaded on a trigger such as entering the viewport, interaction, idle time or a condition, with placeholder and loading states. Coursewright defers the enrollments panel below the catalog, so its code and request wait until it's seen. Never defer what's above the fold; that hurts LCP and causes layout shift.

**Interviewer:** Why is an offset of ten thousand slow, and what does a keyset cursor need from the index?

[pause 5s]

With an offset, the database walks and discards ten thousand rows before returning a page, so cost grows with depth, and inserts shift pages into duplicates or gaps. A keyset cursor remembers the last row's sort key and seeks past it. It needs an index with the equality filters first, then the sort columns in order, ending in a unique tiebreaker. Coursewright's is tenant, title and ID, so page fifty costs the same as page one, and a test walks every course exactly once.

**Interviewer:** How would you render a list of ten thousand rows?

[pause 5s]

Mostly, I wouldn't. Page on the server with a keyset cursor and load more or paginate, as Coursewright does twenty at a time. If users really need to scroll it all, virtualize with the CDK viewport, so only visible rows are in the DOM, and accept the costs: fixed or estimated heights, find in page, and extra work for screen readers. Track rows by ID, keep heavy sorting and filtering on the server or off the main thread, and consider `content-visibility` as a cheaper middle ground.

## Recap

Five things to remember from this lesson.

One: measure what users feel, in the field. LCP for loading, INP for responsiveness, CLS for stability, at the seventy-fifth percentile. Coursewright collects them with a lazily loaded `web-vitals`.

Two: the initial bundle is the framework, the shell and core. Budgets in the production build turn growth into a failed build. Today it's about three hundred and thirty-three kilobytes raw, ninety-two over the wire.

Three: lazy routes split by URL, deferred blocks split inside a page, and a barrel can drag a heavy dependency everywhere. Give heavy code its own entry point.

Four: rendering is work. Zoneless and signals refresh only what changed, track by ID, and don't put ten thousand rows in the DOM.

Five: keyset pagination costs the same at any depth, if the index matches the filter and the sort. And poor INP is found in the field, reproduced in a trace, and fixed by phase.

In the next lesson, we'll look at contract-first REST from the frontend: how the web app and the BFF agree on every field and status code, and how you change a field without breaking anyone.
