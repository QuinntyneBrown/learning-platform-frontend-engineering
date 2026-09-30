# 04 · Routing, Guards and Deep Links

Welcome. Routing questions sound simple, and they hide the senior details: which guard runs when, what a failed guard costs, and whether a link someone bookmarked still works after a reload and a sign-in. By the end of this lesson, you should be able to explain Coursewright's route table, choose between `canMatch`, `canActivate` and a resolver, keep deep links working behind authentication, and explain why the return URL has to be validated.

## The questions this lesson answers

Here are the questions this lesson prepares you for. Can match, can activate or a resolver: when does each run, and what does each cost? Where would you put a "you have unsaved changes" check? How do you keep deep links working behind authentication? How does lazy loading interact with preloading, and when would you preload? And why must the return URL be validated, and what's wrong with a link to slash slash evil dot example?

Keep one sentence in your head while you listen. Every URL is an entry point: it has to survive a reload, a sign-in, and a hostile link.

## The route table

Open `apps/web/src/app/app.routes.ts`. Paths from here on are relative to `apps/web/src/app`. The comment at the top makes two claims: every feature is lazy-loaded, so the initial bundle is just the shell, core and the design system; and can match, not can activate, also keeps a guarded feature's code from downloading at all. Hold on to that second claim. We'll test it.

The table itself is short. The empty path redirects to the catalog, with a full path match. The login route has no guard. The catalog, the course page with its course ID parameter, and the reports page each have a `canMatch` guard, and reports has two: the auth guard, then a role guard for managers. Last comes the wildcard, which loads the not-found page. Every page has a title, and every page uses `loadComponent` with a dynamic import, so each feature is its own chunk, fetched on first use. Lesson six measures what that saves.

## The guards

Now `core/auth/guards.ts`. The auth guard is a can-match function. It reads the auth store's is-authenticated signal, which lesson two covered. That's a plain read, once per navigation. If you're signed in, it returns true.

If you're not, it doesn't navigate. It returns a URL tree for the login page, with a `returnUrl` query parameter. The value comes from the router's current navigation: the URL being navigated to, including its query string. It reads that because a can-match guard runs before the router has built the new route state, so the navigation in progress is the only place the full address lives. As of September 2026, the current navigation is a signal in Angular 22; older versions had a get-current-navigation method. Check this for your version.

Why return a URL tree instead of calling navigate and returning false? Because the router treats a returned URL tree as a redirect of the navigation it's already running. It cancels this one and starts the redirect itself. A guard that navigates on its own starts a second navigation that races the first, and the outcome depends on timing.

The role guard is a factory. Given a role, it returns a can-match function that asks the auth store whether the user has it, and returns true or false. Its doc comment explains the choice: when it fails, the router falls through to the wildcard route, so a learner sees "Page not found" and the page's existence doesn't leak. The BFF does the same with other tenants' resources: a four hundred and four, not a four hundred and three. And the comment ends with the line that matters most: the BFF still enforces the role itself. Guards are user experience. Authorization happens on the server, and lesson eight shows the test that proves it.

## canMatch, canActivate or a resolver

So here's the core question. When does each run, and what does each cost?

`canMatch` runs during matching, while the router decides which route a URL even means. If it returns false, the router tries the next route. That's the fall-through that sends a learner to the not-found page. If it returns a URL tree, the router redirects. Because matching happens on every navigation, including the catalog's query-only changes, a can-match guard must be cheap. Coursewright's guards read a signal.

`canActivate` runs after a route has matched, before it's activated. If it returns false, the navigation is cancelled. There's no fall-through. The user stays where they were, or, on a deep link, sees nothing at all. By default it runs again only when the route's parameters change.

A resolver runs after the guards, and the navigation waits for its data. That's its cost: the old page stays on screen, or on a first load the page stays empty, while the network works, and an error fails the whole navigation unless you handle it. Coursewright has no resolvers. The course page renders at once with a loading heading and an `httpResource`, as lesson two showed, so the navigation never waits on the network and focus can land on the heading straight away.

Now test the comment's claim about downloads. In the router that's installed here, a route's `loadComponent` code is fetched after the guards have run. So for these routes, a failing can-activate guard wouldn't download the component either. Where can match really saves a download is `loadChildren`, whose child routes are fetched during matching. As of September 2026, that's how Angular 22's router behaves; check this for your version. The stronger reasons for can match here are the fall-through, and the fact that two routes can share a path, chosen by a guard, like a manager dashboard and a learner dashboard at the same URL.

## Route inputs and titles

Next, `app.config.ts`. The router is provided with `withComponentInputBinding`, and its comment says: route params, query params and data arrive as component inputs.

You've seen three of them. The course page's course ID is an `input.required`, bound from the route parameter. The login page's `returnUrl` is an optional input, bound from the query string. And the catalog's `q` is bound from the query string too. None of these pages injects the activated route to read a parameter. The input is a signal, so everything derives from it, and a test can set it directly: the login page's spec does exactly that.

Two details are worth knowing. When names collide, route data wins over path parameters, which win over query parameters. And any query parameter can set an input with the same name. So treat an input bound from the URL as user input. The return URL is the example.

Titles come from `shell/title-strategy.ts`. It extends the router's title strategy, builds the page title from the route, and sets it with the product name after it. Its comment explains why that matters: it's the first thing a screen reader reads. Every page has a title, including the not-found page, and the course page upgrades its title once the course loads. Next door, `shell/route-focus.ts` moves focus to the new page's heading and announces it after each path change. Lesson five teaches that one.

## Deep links behind authentication

Now the deep-link question. Three things must go right.

First, the server must serve the app for any path. When you reload a course page, the browser asks the host for that exact path. A static host has to answer with the app's index page, and let the router take it from there. The Angular dev server does that for you. In production, it's a rewrite rule on the host or the CDN, and without it every deep link is a four hundred and four on reload.

Second, the session must be known before the first navigation. Look at `app.config.ts` again. An app initializer calls the auth store's restore method, with the comment: runs before the first navigation, so guards already know whether the user is signed in. The access token lives only in memory, so after a reload the store is empty. Restore calls the refresh endpoint, and the browser sends the HttpOnly refresh cookie. A valid cookie restores the session. A four hundred and one just means signed out. Without the initializer, the auth guard would see a signed-out user on every reload, and bounce a signed-in learner to the login page. The cost is one round trip before the app renders, so a production app often puts a simple splash screen in the index page. Lesson eight covers the refresh itself.

Third, the address must survive the sign-in. The guard puts the whole URL, query string included, into the return URL. After sign-in, the login page navigates there, once the value has been validated. The end-to-end suite proves the round trip: it opens the catalog with a query for forms while signed out, signs in, and expects to land back on that exact URL, with the forms course in the list.

## Validating the return URL

Open `features/login/return-url.ts`. The safe-return-URL function accepts a value only if it starts with a single slash, and rejects anything starting with two slashes, or with a slash and a backslash. Everything else falls back to the catalog.

The comment gives the threat: without the check, a crafted link to the login page with a return URL pointing at evil dot example would turn a real sign-in into a phishing redirect. The user sees the real domain, types a real password, and lands on a lookalike page that says "session expired, please sign in again". Slash slash evil dot example is a protocol-relative URL: it keeps the scheme and replaces the host. Browsers treat a backslash like a slash in web addresses, so slash backslash is the same trick in disguise.

Be precise here, because it's the kind of detail interviewers probe. Angular's router treats a string passed to navigate-by-URL as a path inside the app. With the installed version, slash slash evil dot example parses to the in-app path slash evil dot example. So today the router itself wouldn't leave the site. The check still earns its place, because return URLs rarely stay inside the router. An identity provider redirect, a full-page location change, or a server-side redirect after sign-in would all follow the value literally. Validate user input where you accept it.

The spec in `features/login/login-page.spec.ts` covers both halves. One test keeps an in-app path with its query string, and a parameterized test rejects each hostile form. And a component test signs in with an off-site return URL and asserts that the page navigates to the catalog instead.

## Lazy loading and preloading

Every feature is lazy, and no preloading strategy is configured: the router is provided with input binding and nothing else. So each feature's code downloads the first time someone visits it.

You can change that. The preload-all-modules strategy fetches every lazy route in the background after the first navigation. A custom strategy can preload only routes flagged in their route data, or skip preloading on a slow connection. Preload the next likely page, like the course page from the catalog, and only after the first page is interactive. Let analytics tell you which routes users actually visit next.

One more detail from the installed router, as of September 2026. The preloader doesn't run can-match guards. So with preload-all-modules, a learner's browser would download the reports chunk too. That isn't a security problem, because the code isn't secret and the server enforces the role. But it undoes the download argument for can match. Lesson six covers the bundle side, including deferred blocks.

## Unsaved changes

Where would you put a "you have unsaved changes" check? In a can-deactivate guard on the route, with the component exposing whether it's dirty. Coursewright doesn't have one yet; the study guide lists it under what production would add. The guard runs on every router navigation away from the page, including the Back button.

It doesn't cover a reload, closing the tab, or typing a new address. Those need a before-unload listener, which can only show the browser's own generic prompt. For in-app navigation, prefer an accessible dialog of your own to the browser's confirm box, and consider saving drafts automatically, so the question rarely needs asking.

## Trade-offs and what production would add

The app initializer trades a round trip at startup for a guard that's never wrong about the session. Guards are user experience, and the server stays the authority. What production would add, from the study guide: can-deactivate guards for dirty forms, a preloading strategy tuned by analytics, and route-level error boundaries. And don't forget the host's fallback rule for deep links.

## Traps

Here are the traps to call out.

Can activate where you wanted a fall-through. The learner gets a cancelled navigation instead of "Page not found".

A guard that navigates and returns false. It starts a second navigation that races the first. Return a URL tree.

Treating a guard as authorization. It hides a link. The server has to say no.

An unvalidated return URL. It turns your sign-in page into a phishing tool.

Restoring the session after the first navigation. Every reload bounces a signed-in user to the login page.

No fallback rule on the host. Deep links work until someone presses reload.

And an expensive can-match guard. It runs on every navigation.

## Interview drill

Let's practise. After each question there's a short pause. Pause the audio if you want more time, answer out loud, and then compare your answer with the model answer.

**Interviewer:** `canMatch`, `canActivate` or a resolver: when does each run, and what does each cost?

[pause 5s]

Can match runs during matching, on every navigation. False makes the router try the next route, so Coursewright's role guard sends a learner to "Page not found" without revealing the page, and a URL tree redirects. It must be cheap. Can activate runs after a route has matched; false cancels the navigation, with no fall-through. A resolver runs after the guards, and the navigation waits for its data, so the user watches the old page or a blank one. Coursewright uses can match, and loads data in the page with a resource instead of a resolver.

**Interviewer:** Where would you put a "you have unsaved changes" check?

[pause 5s]

In a can-deactivate guard on the route, with the component exposing whether it's dirty, for example from its form. It runs on every router navigation away, including the Back button. It doesn't catch a reload, a closed tab, or a typed address, so I'd add a before-unload listener for those, which only gets the browser's generic prompt. In the app I'd use an accessible dialog rather than the browser's confirm box, and I'd consider saving drafts automatically, so the prompt is rare.

**Interviewer:** How do you keep deep links working behind authentication?

[pause 5s]

Three things. The host serves the index page for any app path, so a reload doesn't four-oh-four. The session is restored before the first navigation: Coursewright's app initializer calls the refresh endpoint with the HttpOnly cookie, so the guard knows you're signed in after a reload. And the guard returns a URL tree to the login page carrying the full URL, query string included, as the return URL. After sign-in, the login page validates it and navigates back. An end-to-end test proves the round trip.

**Interviewer:** How does lazy loading interact with preloading, and when would you preload?

[pause 5s]

Each Coursewright feature is a lazy chunk, and there's no preloading, so code downloads on first visit. Preload-all-modules fetches every lazy route after the first navigation; a custom strategy can preload only flagged routes, or skip slow connections. I'd preload the next likely page once the first one is interactive, guided by analytics. One catch: the preloader doesn't run can-match guards, so preloading everything would send the reports chunk to learners too. That's not a security hole, because the server enforces roles, but it wastes their bandwidth.

**Interviewer:** Why must `returnUrl` be validated, and what's wrong with `//evil.example`?

[pause 5s]

Because it's user input on a trusted page. A crafted sign-in link could send a user who just typed their real password to a lookalike site. Two leading slashes make a protocol-relative URL to another host, and a slash then a backslash does the same, because browsers treat backslashes as slashes. Coursewright's safe-return-URL function accepts only single-slash paths and falls back to the catalog. Angular's router would treat the string as an in-app path, but return URLs often reach a location change or a server redirect, so validate where you accept them.

## Recap

Five things to remember from this lesson.

One: every feature is lazy-loaded, every route has a title, and the wildcard catches everything else.

Two: can match runs during matching and can fall through; can activate runs after matching and cancels; a resolver makes the navigation wait. Guards return URL trees, and they're user experience; the server enforces access.

Three: route parameters and query parameters arrive as signal inputs, so pages don't read the activated route, and tests set them directly. Treat them as user input.

Four: deep links need a host fallback, a session restored before the first navigation, and a return URL that carries the full address through the sign-in.

Five: validate the return URL to single-slash, in-app paths. Preload deliberately, and remember the preloader ignores can match.

In the next lesson, we'll look at accessibility in a single-page app: the skip link, moving focus and announcing each new page, and why a busy button isn't a disabled one.
