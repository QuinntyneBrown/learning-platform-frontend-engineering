# 04 · Routing, Guards and Deep Links

> **Runtime:** ~21 min · **Level:** Senior · **Study guide:** [§3 Routing](../../study-guide.md#3-routing) · **Prerequisites:** [01](../01-layers-boundaries-and-design-system/), [02](../02-signals-and-zoneless-change-detection/)

**Video:** [04-routing-guards-and-deep-links.mp4](04-routing-guards-and-deep-links.mp4) · [Slides](slides.html) · **Audio lesson:** [04-routing-guards-and-deep-links.mp3](04-routing-guards-and-deep-links.mp3) · [Transcript](script.md)

## Why this video exists

"`canMatch`, `canActivate` or a resolver?" sounds like trivia, but the follow-ups test whether you know **when each runs in a navigation** and what a failure costs the user. The other routing questions are about entry points: a link someone bookmarked has to survive a reload, a sign-in and a hostile `returnUrl`. This video answers both from Coursewright's code:
- the lazy route table in `app.routes.ts`, with `canMatch` guards and a wildcard;
- `authGuard` returning a `UrlTree` with `returnUrl`, and `roleGuard('manager')` falling through to "Page not found";
- `withComponentInputBinding`, the title strategy, and a pointer to route focus;
- deep links: the host fallback, the session restored in an app initializer before the first navigation, and the return trip through sign-in;
- `safeReturnUrl`, the open-redirect guard, and what the installed router really does with `//evil.example`;
- preloading, and where an unsaved-changes check belongs.

## Learning objectives

By the end, the viewer can:

- Walk through Coursewright's route table: redirect, lazy `loadComponent` routes, `canMatch` guards, titles and the wildcard.
- Explain where `canMatch`, `canActivate` and resolvers run in a navigation, what `false` and a `UrlTree` do in each, and what a resolver costs.
- Test the "canMatch keeps code from downloading" claim against how the router loads `loadComponent` and `loadChildren`.
- Explain why guards return a `UrlTree`, and why guards are UX while the server enforces access.
- Explain `withComponentInputBinding`: what it binds, the precedence rules, and why bound inputs are user input.
- Keep deep links working behind authentication: host fallback, `provideAppInitializer` + `restore()`, and `returnUrl`.
- Explain why `returnUrl` is validated, what `//evil.example` and `/\evil.example` do, and where the check really matters.
- Choose a preloading approach, and place an unsaved-changes check.

## Interview questions this prepares you for

| Question | What a strong answer includes |
|---|---|
| `canMatch` vs `canActivate` vs a resolver: when does each run, and what does each cost? | `canMatch` runs during route matching, on every navigation (including query-only changes, so keep it cheap; Coursewright's read a signal). `false` makes the router try the next route: `roleGuard('manager')` sends a learner to the `**` "Page not found" without revealing the page; a `UrlTree` redirects. `canActivate` runs after a route matched; `false` cancels the navigation, with no fall-through (on a deep link, nothing renders); by default it re-runs only when params change. A resolver runs after guards and the navigation waits for its data (old page or blank page meanwhile; an error fails the navigation). Coursewright has no resolvers: the course page renders at once with an `httpResource` and a "Loading course…" h1. On downloads: in the installed Angular 22 router, `loadComponent` code is fetched after guards, so a failing `canActivate` wouldn't download it either; `canMatch` saves the download for `loadChildren`, whose child routes are fetched while matching. As of September 2026; check your version. |
| Where would you put a "you have unsaved changes" check? | A `CanDeactivate` guard on the route, with the component exposing its dirty state (`hasUnsavedChanges()`, or a form's `dirty`). It runs on router navigations away, including Back. It doesn't cover reload, closing the tab or a typed URL: add a `beforeunload` listener, which only gets the browser's generic prompt. Use an accessible in-app dialog (the guard can return an `Observable<boolean>`) rather than `window.confirm`, and consider autosaving drafts. Coursewright doesn't have one yet; the study guide lists it under production. |
| How do you keep deep links working behind authentication? | (1) The host serves `index.html` for any app path (the dev server does; production needs a CDN/host rewrite), or a reload 404s. (2) The session is known before the first navigation: `provideAppInitializer(() => inject(AuthStore).restore())` calls the refresh endpoint with the HttpOnly cookie; a 401 just means signed out. The access token is memory-only, so without this every reload bounces a signed-in user to `/login`. Cost: one round trip before render (consider a splash in `index.html`). (3) `authGuard` returns `createUrlTree(['/login'], { queryParams: { returnUrl } })` with the full URL from `router.currentNavigation()`, query string included; after sign-in the login page calls `navigateByUrl(safeReturnUrl(this.returnUrl()))`. The E2E test opens `/catalog?q=forms` signed out and lands back on it. |
| How does lazy loading interact with preloading strategies, and when would you preload? | Every feature is a `loadComponent` chunk; `provideRouter(routes, withComponentInputBinding())` has no `withPreloading`, so each chunk downloads on first visit. `PreloadAllModules` fetches every lazy route after the first navigation; a custom `PreloadingStrategy` can preload routes flagged in `data`, or skip slow connections. Preload the next likely page (catalog → course) after the first page is interactive, guided by analytics. Catch, verified in the installed router: the preloader doesn't run `canMatch`, so `PreloadAllModules` would send the reports chunk to learners. Not a security issue (the server enforces roles), but it undoes the download benefit. Lesson 06 covers budgets and `@defer`. |
| Why must `returnUrl` be validated, and what's wrong with `//evil.example`? | It's user input on a trusted page: a crafted `/login?returnUrl=…` link could send a user who just typed their real password to a lookalike "session expired" page. `//evil.example` is protocol-relative (same scheme, another host); `/\evil.example` is the same, because browsers treat `\` as `/`. `safeReturnUrl()` accepts only values starting with a single `/`, rejects `//` and `/\`, and falls back to `/catalog`. Precise nuance: Angular's router treats a `navigateByUrl` string as an in-app path (the installed parser turns `//evil.example` into `/evil.example`), but return URLs often reach `window.location`, an identity provider or a server redirect, so validate where you accept them. Tests: `it.each` over the hostile forms; the login page navigates to `/catalog` for an off-site `returnUrl`. |
| Why should a guard return a `UrlTree` instead of calling `router.navigate()` and returning `false`? | A returned `UrlTree` is a redirect of the current navigation: the router cancels it and runs the redirect itself, in order. A guard that navigates starts a second navigation racing the first, so the result depends on timing (and it's harder to test). `authGuard` returns `router.createUrlTree(['/login'], { queryParams: { returnUrl } })`; `roleGuard` returns a boolean so it can fall through instead. |
| What does `withComponentInputBinding()` change, and what should you watch for? | Route params, query params and route data are set as component inputs (the router calls `ComponentRef.setInput`), so pages declare `input()`s instead of injecting `ActivatedRoute`: `courseId = input.required<string>()`, `returnUrl = input<string>()`, `q = input<string>()`. They're signals, so derived state and resources follow them (lesson 02), and tests set them with `setInput()` (the login spec does). Watch for: precedence on name clashes (data over path params over query params), absent params set the input to `undefined` by default, and any query param can set a same-named input, so treat URL-bound inputs as user input. |

## Coursewright code on screen

| File | What to show |
|---|---|
| `apps/web/src/app/app.routes.ts` | The two-claim comment; the redirect; `loadComponent` per feature; `canMatch: [authGuard]`; `canMatch: [authGuard, roleGuard('manager')]`; titles; `**` |
| `apps/web/src/app/core/auth/guards.ts` | `authGuard`: `isAuthenticated()`, `router.currentNavigation()?.extractedUrl`, `createUrlTree` with `returnUrl`; `roleGuard` and its "canMatch, not canActivate" comment |
| `apps/web/src/app/features/not-found/not-found-page.ts` | "The page you asked for doesn't exist, or you don't have access to it." |
| `apps/web/src/app/app.config.ts` | `provideRouter(routes, withComponentInputBinding())` and its comment; `TitleStrategy`; `provideAppInitializer(() => inject(AuthStore).restore())` and "Runs before the first navigation" |
| `apps/web/src/app/core/auth/auth.store.ts` | `restore()`: "a 401 just means signed out" |
| `apps/web/src/app/features/course/course-page.ts`, `login/login-page.ts`, `catalog/catalog-page.ts` | `input.required<string>()` and `input<string>()` bound from the route |
| `apps/web/src/app/shell/title-strategy.ts` | `PageTitleStrategy`: "<title> · Coursewright" |
| `apps/web/src/app/shell/route-focus.ts` | Path-only `distinctUntilChanged`, `skip(1)` (taught in lesson 05) |
| `apps/web/src/app/features/login/return-url.ts` | `safeReturnUrl()` and its threat comment |
| `apps/web/src/app/features/login/login-page.ts` and `.spec.ts` | `navigateByUrl(safeReturnUrl(this.returnUrl()))`; the `it.each` open-redirect cases; "ignores an off-site returnUrl after signing in" |
| `apps/web/e2e/learner-journey.spec.ts` | "opening a protected page signed out goes to sign-in, then back to that page"; the reload that stays signed in |

## Run sheet

| Time | Segment | Content |
|---|---|---|
| 00:00–01:20 | Hook | The five drills. The thesis: every URL is an entry point. |
| 01:20–02:30 | The route table | The two-claim comment; the table; one chunk and one title per page. |
| 02:30–04:30 | The guards | `authGuard`; **diagram:** signed out → `UrlTree` → login → back; why not navigate + `false`; `roleGuard`; "the BFF still enforces the role itself". |
| 04:30–06:40 | canMatch vs canActivate | **Diagram:** where each runs in a navigation. The three cards. Testing the download claim. |
| 06:40–08:15 | Route inputs and titles | `withComponentInputBinding`; three bound inputs; precedence and "it's user input"; `PageTitleStrategy`; route focus (pointer to 05). |
| 08:15–10:15 | Deep links | The three requirements; the host fallback; the app initializer and `restore()`; **diagram:** a reload with and without it; the return trip and its E2E test. **Demo** (below). |
| 10:15–12:05 | Validating returnUrl | `safeReturnUrl`; the phishing flow; what a browser does with each value; what the router does; the specs. |
| 12:05–13:15 | Preloading | No preloading today; a flagged-route strategy (sketch); the preloader ignores `canMatch`. |
| 13:15–14:00 | Unsaved changes | A `CanDeactivate` sketch; what it covers vs `beforeunload`. |
| 14:00–14:30 | Trade-offs | The startup round trip; guards as UX; production additions. |
| 14:30–15:15 | Traps | The seven traps below. |
| 15:15–21:00 | Drill and recap | Five questions, then the five points. |

## Code excerpts

### The guards

```ts
// apps/web/src/app/core/auth/guards.ts
/** Signed-out users go to the login page, which sends them back here afterwards. */
export const authGuard: CanMatchFn = () => {
  if (inject(AuthStore).isAuthenticated()) {
    return true;
  }
  const router = inject(Router);
  const returnUrl = router.currentNavigation()?.extractedUrl.toString() ?? '/';
  return router.createUrlTree(['/login'], { queryParams: { returnUrl } });
};

/**
 * canMatch, not canActivate: when it fails, the router falls through to the `**` route, so
 * a learner sees "Page not found" and the page's existence doesn't leak. The BFF does the
 * same with cross-tenant resources (404, not 403). The BFF still enforces the role itself.
 */
export function roleGuard(role: Role): CanMatchFn {
  return () => inject(AuthStore).hasRole(role);
}
```

### The session before the first navigation

```ts
// apps/web/src/app/app.config.ts
// withComponentInputBinding: route params, query params and data arrive as component inputs.
provideRouter(routes, withComponentInputBinding()),
// …
// Runs before the first navigation, so guards already know whether the user is signed in.
provideAppInitializer(() => inject(AuthStore).restore()),
```

### The open-redirect guard

```ts
// apps/web/src/app/features/login/return-url.ts
export function safeReturnUrl(url: string | null | undefined): string {
  if (!url || !url.startsWith('/') || url.startsWith('//') || url.startsWith('/\\')) {
    return DEFAULT_URL;
  }
  return url;
}
```

### Preload only flagged routes (sketch, not in this repo)

```ts
@Injectable({ providedIn: 'root' })
export class FlaggedPreloading implements PreloadingStrategy {
  preload(route: Route, load: () => Observable<unknown>): Observable<unknown> {
    return route.data?.['preload'] ? load() : of(null);
  }
}
// provideRouter(routes, withComponentInputBinding(), withPreloading(FlaggedPreloading))
// { path: 'courses/:courseId', data: { preload: true }, canMatch: [authGuard], loadComponent: … }
```

### An unsaved-changes guard (sketch, not in this repo)

```ts
export interface HasUnsavedChanges {
  hasUnsavedChanges(): boolean;
}

// ConfirmDialog is hypothetical: an accessible dialog whose ask() returns Observable<boolean>.
export const unsavedChangesGuard: CanDeactivateFn<HasUnsavedChanges> = (page) =>
  !page.hasUnsavedChanges() || inject(ConfirmDialog).ask('Discard your changes?');

// Tab close and reload need beforeunload; the browser shows its own generic prompt.
```

## Demo

```bash
# The route table and every guard
git grep -nE "canMatch|canActivate|canDeactivate|loadComponent|title:" -- apps/web/src/app

# Everything that touches returnUrl
git grep -n "returnUrl" -- apps/web/src apps/web/e2e

# The open-redirect unit tests (safeReturnUrl and LoginPage)
pnpm --filter @coursewright/web test

# Run the app
pnpm dev   # web on http://localhost:4200, BFF on :3000
```

In the browser, with DevTools open on the Network panel:
1. **A deep link, signed out.** In a fresh window, open `http://localhost:4200/catalog?q=forms`. You land on Sign in, and the address bar carries `returnUrl` (URL-encoded). Sign in as `learner.acme` / `Coursewright2026!`: you're back on `/catalog?q=forms`, with "Reactive Forms Deep Dive" in the list.
2. **The fall-through.** Still signed in as the learner, open `http://localhost:4200/reports`. The page says "Page not found", and the URL stays `/reports`: `roleGuard` returned `false` during matching and the router fell through to `**`. Sign in as `manager.acme` and the same URL shows Reports.
3. **Restore before the first navigation.** Open a course and reload. The first API call is `POST /api/auth/refresh` (the app initializer), then `GET /api/courses/…`. You stay on the course page, signed in. The tab title goes from "Course · Coursewright" to the course's name.
4. **The open-redirect guard.** Sign out, open `http://localhost:4200/login?returnUrl=//evil.example` and sign in. You land on `/catalog`.

## Traps to call out

- **`canActivate` where you wanted a fall-through.** A learner gets a cancelled navigation (a blank page on a deep link) instead of "Page not found".
- **A guard that navigates and returns `false`.** Two navigations race. Return a `UrlTree`.
- **A guard treated as authorization.** It hides a link; the server has to say no (lesson 08).
- **An unvalidated `returnUrl`.** Your sign-in page becomes a phishing tool the day the value reaches `location` or a server redirect.
- **Restoring the session after the first navigation.** Every reload bounces a signed-in user to `/login`.
- **No host fallback rule.** Deep links work until someone presses reload.
- **An expensive `canMatch`.** It runs on every navigation, including query-only changes.

## Key terms

`Routes` · `loadComponent` / `loadChildren` · `pathMatch: 'full'` · wildcard route (`**`) · `CanMatchFn` · `canActivate` · resolver · `CanDeactivateFn` · `UrlTree` / `createUrlTree` · fall-through · `router.currentNavigation()` · `withComponentInputBinding` · `input.required()` · `TitleStrategy` · `provideAppInitializer` · SPA fallback (rewrite to `index.html`) · deep link · `returnUrl` · open redirect · protocol-relative URL · `PreloadingStrategy` / `PreloadAllModules` / `withPreloading` · `beforeunload`

## After the video

1. Add a manager-only dashboard and a learner dashboard at the same path (`home`) using two routes with `canMatch`. Decide the order, and what a signed-out user sees.
2. Rewrite `safeReturnUrl` with `new URL(url, location.origin)` and an origin comparison. List one input where your version and the current one disagree, and decide which is right.
3. Sketch where the course page would need a `CanDeactivate` guard if it gained an inline review form, and write the acceptance criteria for its dialog (keyboard, focus return, wording).

## References

- [`docs/study-guide.md`](../../study-guide.md), section 3
- [ADR-0003: auth token storage](../../adr/0003-auth-token-storage.md) (why the session is restored from a cookie on reload)
- Angular documentation: Routing (`canMatch`, `canActivate`, `canDeactivate`, resolvers), lazy loading and preloading strategies, `withComponentInputBinding`, `TitleStrategy`, `provideAppInitializer`
- OWASP Cheat Sheet Series: Unvalidated Redirects and Forwards
- WHATWG URL Standard: how backslashes and scheme-relative URLs are parsed
