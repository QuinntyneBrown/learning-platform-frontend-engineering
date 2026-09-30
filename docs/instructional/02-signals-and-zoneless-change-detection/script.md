# 02 · Signals and Zoneless Change Detection

Welcome. This lesson is about the question behind most modern Angular interviews: now that there's no `zone.js`, what makes the screen update? Coursewright's web app is zoneless, every component is on push, and its state lives in signals. By the end of this lesson, you should be able to explain what schedules a render in a zoneless app, when to reach for `computed`, `linkedSignal`, an effect or a resource, and when a store is more machinery than the problem needs.

## The questions this lesson answers

Here are the questions this lesson prepares you for. How do signals change change detection in a zoneless app, and what still triggers a render? When is an effect the wrong tool, and what would you use instead? When would you not use a store, and just keep a signal in the component? Why is the catalog's search box a `linkedSignal` and not a `computed`? And when would you load data with `httpResource` rather than an RxJS pipeline?

Keep one sentence in your head while you listen. Without zone.js, Angular renders only when something tells it to, and a signal is the most precise way to tell it: it says what changed, and which views read it.

## What zone.js used to do

Start with what went away. For most of Angular's life, a library called zone.js patched every asynchronous browser API: timers, promises, event listeners and network requests. When any callback finished, the zone told Angular, and Angular checked the whole component tree from the root down. It had no idea what had changed, so it checked everything.

That made plain class fields work by accident: assign a property in a subscription callback, and the zone noticed. The costs were a whole-tree check after every async task, patched browser APIs, and one more library in every bundle.

Now open `apps/web/src/app/app.config.ts`. Paths from here on are relative to `apps/web/src/app`. The comment above the providers says: zoneless is the default; there is no zone.js, and signals and template events schedule rendering. zone.js isn't even a dependency. As of September 2026, the repo's comments and ADR-0004 say Angular 22 is zoneless by default and components are on push by default, and the installed type declarations agree. Check this for your version.

## What schedules a render now

So what does schedule a render? Angular's own list is short. Updating a signal that a template reads. A template or host event listener firing. The change detector's mark-for-check method, which the async pipe calls for you. Setting a component input through its component reference, which is what the router and the tests do. And attaching or removing a view.

Just as important is what isn't on the list: a timer finishing, a promise resolving, or a subscription callback that assigns a plain field. None of those renders anything. The value changes in memory, and the screen doesn't.

Walk the catalog page to see the list in action. Typing in the search box fires the template's input listener, and the handler sets a signal. When the search response arrives, the network callback itself doesn't matter. What matters is that the store writes the results into signals the template reads, which marks the page's view as dirty, and Angular schedules one render.

Signals also make the render narrow. Angular marks the views that read the changed signal for refresh, and marks their ancestors only as having a child to refresh. Change detection walks down to the dirty view without re-checking the on push components it passes through. Lesson six comes back to the performance angle.

Every component in Coursewright still declares on push. The comment in `shell/shell.ts` explains the house rule: it's already the default in version twenty-two, but writing it out keeps the intent when code is copied into older apps. As of September 2026, the old check-always strategy is deprecated in favour of one called eager. Check this for your version.

## Signals and computed, even in a primitive

A writable signal holds a value you set. A `computed` derives a value from other signals. It's lazy, it's memoized, and it's glitch-free: when two of its inputs change together, nobody sees it computed from one new value and one old one.

The design system's text field shows why this matters even in a primitive. Open `design-system/text-field/text-field.ts`. Its value and its disabled flag are two writable signals, bound in the template. The forms API calls the text field's write-value and set-disabled-state methods from outside its template, for example when a form is reset. No template listener fires, so with a plain field the input would go on showing the old value. Because those methods set signals, the render is scheduled. The spec next to it proves it: the host sets the form control's value, waits for the fixture to be stable, and expects the input to show it.

The same file derives `describedBy` with a `computed`. A derived value is a `computed`, never a field you remember to update.

The app-wide authentication state has the same shape. Open `core/auth/auth.store.ts`, a plain root service. The session is one private writable signal, and the public surface is three computed signals: the user, the access token, and whether you're authenticated. The shell's template reads the user signal, so the header updates on sign-in and sign-out with no subscription. And the shell's manager check is a `computed` that calls the store's has-role method. That method reads the session signal, so the computed tracks it, even with a method call in between. How the session is refreshed is lesson eight.

## The catalog store

Now the one real store. Open `features/catalog/catalog.store.ts`. It uses `signalStore` from `@ngrx/signals`. The state has six fields: the query, the items, the next cursor, a status, a loading-more flag, and an error. The status is a union of four strings, idle, loading, loaded and error, so the page can't be in two states at once.

`withState` turns each field into a signal on the store. `withMethods` adds behaviour, and injects the API client through a default parameter. Every write goes through `patchState`, which replaces the fields you pass. That's why load-more builds a new array by spreading the old items and the new ones. Pushing into the existing array would keep the same reference, and the signal wouldn't notice.

The catalog page provides the store itself, so it's created and destroyed with the page.

The page derives its status line in `features/catalog/catalog-page.ts`. The `statusText` computed reads five store signals and returns strings like "Searching" or "twelve plus courses found". Derived, it can never disagree with the data.

The store's methods are RxJS pipelines wrapped in `rxMethod`, which lesson three walks through. One detail belongs here. The page's constructor passes the query signal itself to the store's search method, not its value. Inside NgRx, `rxMethod` creates an effect that reads the signal and pushes each new value into the pipeline. That's the hand-off in ADR-0004: signals for state, RxJS for events over time, and one small bridge between them.

## linkedSignal: local state that resets

That query signal is the interesting one. The page has an input, `q`, bound from the `?q=` query parameter. The search box needs its own value, because it changes on every keystroke, before the URL catches up. But when the URL changes from outside, through the Back button or a shared link, the box must follow.

That's what `linkedSignal` is for. The page declares the query as a linked signal of the `q` input, falling back to an empty string. It's writable: the input handler sets it on every keystroke. And whenever `q` changes, it resets to the URL's value. The doc comment says it in one line: local, seeded from the URL, and reset whenever the URL changes.

Compare the alternatives. A `computed` would follow the URL, but it's read-only, so the keystroke handler couldn't set it. A plain signal plus an effect that copies the input into it would work, but an effect that writes a signal costs an extra pass, can show a stale value in between, and hides the dependency. A linked signal states the relationship in one declaration.

Navigating with `replaceUrl` belongs to lesson three, and binding query parameters to inputs to lesson four.

## Resources: reads as signals

Next, loading data. Open `core/api/coursewright-api.ts` and find the course method. It takes a function that returns a course ID, and returns an `httpResource` whose URL is built from it. The doc comment reads: a signal-driven GET that refetches when the course ID changes; call it from an injection context.

The course page, `features/course/course-page.ts`, uses it in one line. The course ID is an `input.required` bound from the route parameter, and a field initializer passes that input signal to the API's course method. What comes back is a resource: its value, its error, its loading state and even the HTTP status code are signals. When the course ID changes, it fetches again, and only the latest request counts.

Everything else on the page derives from that. The not-found flag is a computed that checks for a four hundred and four. The heading is a computed too, with a comment worth reading: one h1 whose text changes, rather than one h1 per state, because route focus lands on it while the course is still loading. That's lesson five's topic, but notice how cheap it is when the heading is derived state.

`features/catalog/my-enrollments.ts` shows the sibling, `rxResource`. Its comment says it turns an Observable into signals for value, status and error, so an existing Observable method gets the same shape. Both go through `HttpClient`, so the interceptors apply either way.

As of September 2026, ADR-0004 says `httpResource` is stable in version twenty-two, and the installed declarations mark both resource functions stable. They were experimental for several releases, so check this for your version.

One rule: resources are for reads. Enrolling is a POST that must not run twice, and a resource re-runs whenever its inputs change. That's why enrollment is an RxJS pipeline, in lesson three.

## Effects: the escape hatch

That leaves effects. An effect runs a function whenever the signals it read change. It runs asynchronously, as part of change detection, not at the moment a signal is set. Its job is to push signal state into something that isn't a signal.

The course page has two legitimate ones. The first sets the browser tab's title. Its comment says: the route's title is only "Course"; once loaded, the browser tab names the course. The document title isn't a signal, so an effect is the bridge.

The second is an `afterRenderEffect`. When the enrollment succeeds, the Enroll button is replaced by a "You're enrolled" paragraph, and the effect moves focus to it. It has to run after rendering, because before that the paragraph doesn't exist. The page finds it through a `viewChild` signal, which only has a value once the paragraph is in the DOM. Lesson five explains why focus has to move.

Effects are the wrong tool when the result is state. If you're setting a signal inside an effect, you probably wanted a `computed` or a `linkedSignal`. They're wrong for loading data, where a resource gives you loading states and drops stale requests. And they're wrong for user events, which belong in the handler or an RxJS pipeline. ADR-0004 names the failure mode: effects that re-implement switch map badly.

## When not to use a store

Here's the question that separates judgment from habit. ADR-0004's negative consequences say that `@ngrx/signals` is a dependency, and plain services with signals would do for an app this size. It's there because it's what a team of this size standardizes on.

Coursewright shows the range. State that belongs to one component stays there: the login page keeps submitted, pending and the error message as three signals. A single read keyed by state is a resource, like the course. A small workflow owned by one page is a plain injectable with signals: `EnrollmentController` exposes a status and an error, and the course page provides it. Small app-wide state is a root service with signals, like the auth store. The catalog earns its store: six fields that change together, two async flows that coordinate, and a spec that tests it without rendering anything.

So the rule is: start with a signal where the state is used. Promote it when a second consumer needs it, or when the coordination grows.

## Trade-offs and what production would add

Zoneless isn't free. Code that assigned plain fields in callbacks silently stops updating, and some third-party libraries still assume a zone. Tests change too: the specs here await the fixture's when-stable method instead of forcing change detection, which lesson ten covers. And the ADR's other cost is two reactive models, so "is this state, or an event?" becomes a review question.

What production would add: entity collections with `withEntities`, optimistic updates with rollback, cross-tab sync through `BroadcastChannel`, and store devtools.

## Traps

Here are the traps to call out.

Assigning a plain field in a subscription or a timer and expecting the screen to update. In a zoneless app it won't. Make it a signal.

Copying a signal's value into a field once. That snapshot never changes again. Keep the signal, or derive with `computed`.

Using an effect to derive state, or to copy one signal into another. Use `computed` or `linkedSignal`.

Mutating an array or an object inside a signal. The reference doesn't change, so nothing is notified. Replace it, the way `patchState` does.

Creating a resource outside an injection context, or using one for a POST.

And reaching for a store by default. Most state is local, and a signal is enough.

## Interview drill

Let's practise. After each question there's a short pause. Pause the audio if you want more time, answer out loud, and then compare your answer with the model answer.

**Interviewer:** How do signals change change detection in a zoneless app, and what still triggers a render?

[pause 5s]

Without zone.js, Angular no longer checks the tree after every async task. It renders when notified: a signal read by a template changes, a template or host listener fires, mark-for-check is called, which the async pipe does, an input is set through the component reference, or a view is attached or removed. A timer, a promise, or a subscription that assigns a plain field triggers nothing. Signals are the precise trigger: Angular refreshes only the views that read the changed signal, and walks past on push ancestors without re-checking them.

**Interviewer:** When is an effect the wrong tool, and what would you use instead?

[pause 5s]

When the result is state. A `computed` derives read-only state, lazily and glitch-free, like the catalog's status text. A `linkedSignal` covers writable state that resets from a source, like the search box. Loading data belongs in a resource, and user events belong in handlers or RxJS. An effect is for pushing signal state into something that isn't a signal: Coursewright uses one to set the document title, and an after-render effect to move focus once the element exists.

**Interviewer:** When would you not use a store, and just keep a signal in the component?

[pause 5s]

Most of the time. State used by one component stays there as a signal, like the login page's pending flag. A read keyed by state is a resource, like the course page. A small workflow owned by one page is a plain injectable with signals, like the enrollment controller, and small app-wide state is a root service with signals, like the auth store. I'd use a store when several fields change together, multiple async flows coordinate, and I want one unit to test without rendering, like the catalog store.

**Interviewer:** Why is the search box a linked signal and not a computed?

[pause 5s]

It needs two things at once. It must be writable, since every keystroke sets it before the URL catches up, and a computed is read-only. And it has to reset when the query parameter changes from outside, through the Back button or a shared link. A linked signal is writable, and re-derives from its source whenever the source changes. The alternative, a plain signal plus an effect that copies the input into it, writes a signal from an effect, which adds a pass and hides the dependency.

**Interviewer:** When would you load data with `httpResource` rather than an RxJS pipeline?

[pause 5s]

For a read keyed by state. The course page passes its route input to `httpResource`, and gets the value, error, loading state and status code as signals, refetching when the ID changes, with no subscription to manage. I'd use RxJS when timing or concurrency matters: debouncing, cancelling stale requests, ignoring duplicates, appending pages, or retrying with backoff. That's why search and enrollment are pipelines. And never a resource for a write, because a resource re-runs whenever its inputs change.

## Recap

Five things to remember from this lesson.

One: without zone.js, Angular renders only when it's notified: a signal read in a template, a template listener, mark-for-check, an input set through the component reference, or a view attached or removed. Timers and promises alone do nothing.

Two: signals make rendering precise. Only views that read a changed signal are refreshed, and Coursewright still writes out on push.

Three: derive, don't copy. `computed` for read-only state, `linkedSignal` for local state that resets from a source, and an effect only to push state into something that isn't a signal.

Four: resources for reads, RxJS for events over time. `httpResource` loads the course, and pipelines handle search and enrollment.

Five: start with a signal where the state is used. Promote it to a service, then a store, only when sharing or coordination demands it.

In the next lesson, we'll look at RxJS races and idempotent submits: how the catalog search survives a slow response, why the Enroll button uses exhaust map, and why the server still needs an idempotency key.
