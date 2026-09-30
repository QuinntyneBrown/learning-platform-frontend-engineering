# 05 · Accessibility in a Single-Page App

Welcome. Accessibility questions in a senior frontend interview rarely stop at alt text. They probe what a single-page app breaks that a plain website gets for free, and whether you can make a team keep it working. By the end of this lesson, you should be able to explain how Coursewright restores focus and announcements after a route change, how it announces async results without shouting, why it reaches for native elements first, and how accessibility gets tested, from lint rules to a keyboard path in Playwright.

## The questions this lesson answers

Here are the questions this lesson prepares you for. A screen-reader user says nothing happens after clicking a link in your single-page app: what's wrong, and how do you fix it? How do you announce async results, like twelve courses found, without announcing every keystroke? What's missing from a custom dropdown built from divs? Which WCAG 2.2 criteria does a sticky header most often break? And how would you make accessibility part of a whole team's definition of done?

Keep one sentence in your head while you listen. A single-page app takes over jobs the browser used to do, so it inherits the browser's accessibility duties. Wherever the app replaces a page load, it must move focus and announce the change itself. Everywhere else, it should leave the work to native elements.

## What a page load gave you for free

Start with what a traditional website gets without trying. You click a link, the browser loads a new document, and three things happen. Focus resets to the top of the page. The screen reader announces the new page's title. And it starts reading the new content from the top.

A single-page app does none of that by default. The router swaps the content inside the main element, the URL changes, and the document stays. The link you clicked may no longer exist, so focus falls back to the body. The screen reader has nothing to announce, so it says nothing. A sighted user sees a new page. A screen-reader user hears silence, and assumes the click failed. That's the "nothing happens" complaint.

So there are three things to put back: a meaningful title, focus in a sensible place, and an announcement. Lesson four covered the title strategy. This lesson covers the other two.

## Route focus and announcement

Open `apps/web/src/app/shell/route-focus.ts`. Its comment names the problem: without a page load, a screen reader stays wherever it was and says nothing. The function it exports is called once, from the shell's constructor.

It listens to the router's events and keeps only the ones that end a navigation. Then come two filters that matter. It strips the query string and the fragment, and ignores a navigation whose path hasn't changed. The comment explains why: the catalog writes the search text into the URL as you type, and a query-only change must not steal focus from the search box. And it skips the very first navigation, because on the initial load the screen reader already reads the new document from the top.

For every real page change, it waits for Angular's next render, so the new page is in the DOM. It looks for the h1 inside main, and falls back to the main element itself. It sets a tab index of minus one, which makes a heading focusable from script without adding it to the Tab order, and focuses it. The screen reader reads the heading, so the user hears the page's name, and their next Tab starts from the top of the new content. Finally, it announces the route's title, for example "Catalog page loaded".

Two details make this work. A focused heading isn't a control, so `design-system/tokens.css` hides the focus ring on elements with a tab index of minus one, unless the browser decides focus should be visible. And the page must not replace its heading while focus is on it. In `features/course/course-page.ts`, the heading is a computed signal: "Loading course…", then the course title, or "Course not found". The comment says why it's one h1 whose text changes: route focus lands on it while the course is still loading, and replacing the element would drop that focus. The learner journey in Playwright clicks a course and asserts that its h1 is focused.

## Live regions: announcing what changed

A live region is the other way to tell a screen reader something changed. Screen readers watch it: when its text changes, they read the new text, and focus stays where it is.

Open `design-system/live-announcer.ts`. It's one app-wide region, created on first use, visually hidden, with `aria-live` set to polite and `aria-atomic` set to true. Polite means the screen reader finishes what it's saying first. Assertive would interrupt, so keep that for errors.

The announce method has a quirk worth explaining. It clears the text, then sets the message a hundred milliseconds later. The comment gives two reasons. Screen readers announce changes, so clearing first lets an identical message be announced again. And a region must already be in the DOM when its text changes. A region inserted together with its text is often not announced at all. Two things call it: route focus, and the enrollment controller, which announces "You're enrolled".

The catalog uses the other kind of live region: an element with `role="status"`, which is polite by definition. In `features/catalog/catalog-page.html`, one paragraph under the search box has that role. Its text is a computed signal: empty, then "Searching…", then a count such as "twenty courses found", with a plus sign when more pages exist, or "No courses match" and the query.

That answers the second question. The region changes only when the results change, and the search is debounced by two hundred and fifty milliseconds, so it settles after the user pauses. Lesson three covers that pipeline. The region is always rendered, even when it's empty, and a comment on the reports page says why: a live region must exist before its text changes to be announced. The search box sits inside an element with `role="search"`, a landmark screen-reader users can jump to, and it has a real label.

The reports page shows the same restraint with progress. `design-system/progress/progress.ts` wraps a native progress element, which already has the progress bar role and exposes its value, and adds a visible label as its accessible name. The page's status region changes only when the job's state changes: queued, running with the attempt number, completed or failed. Nobody hears "forty percent, sixty percent, eighty percent".

## Forms, errors and focus after an action

Lesson one showed the text field's own wiring. This lesson adds the form-level half. Open `features/login/login-page.html`. Above the form is an error summary: a paragraph with `role="alert"`, rendered only when there's a message. The comment says it's one alert for the whole form, inserted with its text, so screen readers announce it once. Field errors have no alert role; they're read when the user reaches each field. The spec file proves both. A wrong password produces exactly one alert. Empty fields produce one alert and two invalid inputs, with no request sent.

Buttons that are working show busy, not disabled. Lesson one explained why: a disabled button drops focus, is skipped by the Tab key, and hides why it's unavailable.

Now the subtle one. On the course page, a successful enrollment replaces the Enroll button with a paragraph that says "You're enrolled". The button had focus, and it's just been removed. Without help, focus falls back to the body, and a keyboard user starts again from the top of the page. `course-page.ts` fixes that with an `afterRenderEffect`: once the status is enrolled and the paragraph has rendered, it focuses the paragraph, which has a tab index of minus one. Lesson two covers why it runs after rendering. The rule to take away: whenever you remove the element that has focus, decide where focus goes next.

## The skip link and landmarks

Open `shell/shell.html`. The first element is a skip link, "Skip to main content", pointing at `#main`. Without it, keyboard users tab through the whole header on every page. The CSS keeps it off-screen until it has focus.

Its click handler is the interesting part. The comment in `shell/shell.ts` explains it: a plain link to hash main would resolve against the base href, which is slash, and navigate to slash hash main, which changes the route. So the handler prevents that navigation and moves focus to main itself. It keeps the href, so it's still a real link. The main element has the ID main and a tab index of minus one, so script can focus it.

The header holds a nav element labelled "Main". Each navigation link sets `aria-current` to page when its route is active, so a screen reader says "current page", and the visual cue is a thicker underline, not a color change. `shell/shell.spec.ts` tests the skip link: it's the first focusable element, its href is hash main, and clicking it focuses main.

## Native elements first

Notice how little ARIA there is. The button is an attribute on a native button. The progress bar is a native progress element. The reports page uses a native select, with a label and a hint. ARIA only fills gaps, like the live regions and the current page. The saying is: no ARIA is better than bad ARIA.

That's the lens for the third question: a custom dropdown built from divs. The first review comment is: why isn't this a native select? If there's a real reason, list what the divs don't give you. A name, from a label. Roles: a combobox or button, a listbox, and options. State: expanded, and which option is selected. Keyboard: Tab to reach it, arrow keys, Enter, Escape, Home, End, and typing to jump. Focus that returns to the control when the list closes. A visible focus ring, and a target big enough to tap. Then point to the published ARIA pattern, or a tested headless library such as the Angular CDK's listbox. Coursewright's lint would object first: a div with a click handler breaks the template rules for keyboard events and focus.

## Testing it: lint, axe and the keyboard

Coursewright tests accessibility at three levels.

Lint runs on every template. `apps/web/eslint.config.js` applies Angular ESLint's template accessibility rules to every HTML file: alt text, labels associated with controls, click handlers that also handle keys, interactive elements that can take focus, valid ARIA, and no autofocus.

End-to-end tests run axe. In `apps/web/e2e/support.ts`, a helper runs an axe scan tagged for WCAG A and AA, up to 2.2, and fails on serious or critical violations. `e2e/accessibility.spec.ts` scans the sign-in, catalog, course and reports pages. It also walks a keyboard path: reload the catalog, press Tab, expect the skip link to be focused, press Enter, expect main to be focused. And the tests find controls by role and label, so a button without an accessible name can't even be clicked by them.

Then be honest about the limits. Automated checks find perhaps a third of real issues. They can't tell whether focus went somewhere sensible, whether an announcement makes sense, or whether the Tab order matches the reading order. That takes a keyboard walkthrough and a screen-reader pass: NVDA on Windows, VoiceOver on a Mac and an iPhone, TalkBack on Android.

## WCAG 2.2 and the definition of done

As of September 2026, WCAG 2.2 is the current W3C Recommendation, and level AA is what enterprise contracts usually ask for. Check this for your market. Version 2.2 added criteria that single-page apps trip over. Focus Not Obscured, at AA: the focused element mustn't be completely hidden by content the author added, like a sticky header or a cookie banner. Target Size Minimum, at AA: pointer targets at least twenty-four by twenty-four CSS pixels, or enough space around them. Coursewright's buttons and inputs are at least forty-four pixels tall. And Accessible Authentication, also at AA: no memory test or puzzle to sign in. The login fields' autocomplete attributes let a password manager fill them.

That sets up the fourth question. Coursewright's header doesn't stick, but many do. A sticky header most often breaks Focus Not Obscured: tab backwards, or follow a skip link, and the focused element scrolls up under the header. The fix is `scroll-padding-top`, set to the header's height. It also strains Reflow: at four hundred percent zoom, a sticky header can fill most of the screen. And its icon buttons are often too small for Target Size.

The fifth question is about making this routine. Design annotates headings, focus order and names. The pull-request template asks for a keyboard pass. Lint and axe block the build, as they already do here. Key journeys get a screen-reader pass before each release. Accessibility bugs are triaged by severity, like any other bug. What production would add: Storybook accessibility tests per component, forced-colors styles, and an accessibility conformance report, a VPAT, for enterprise buyers.

## Traps

Here are the traps to call out.

Moving focus on every navigation, including query changes. The user types one letter and loses the search box.

Creating a live region at the same moment you put text in it. It's often not announced.

Announcing every keystroke, or every tick of a progress bar.

An alert role on every field error, so one bad submit shouts three times.

Disabling a button while it works. It loses focus and explains nothing.

A div with a click handler standing in for a button or a select.

Removing focus outlines globally. Use focus-visible instead.

And treating a clean axe run as proof that the app is accessible.

## Interview drill

Let's practise. After each question there's a short pause. Pause the audio if you want more time, answer out loud, and then compare your answer with the model answer.

**Interviewer:** A screen-reader user says nothing happens after clicking a link in your single-page app. What's wrong, and how do you fix it?

[pause 5s]

The router swapped the content without a page load, so focus stayed on a link that no longer exists, and the screen reader had nothing to announce. The fix restores what a page load did. After each navigation that changes the path, wait for the render, move focus to the new page's h1 with a tab index of minus one, and announce the page title through a polite live region. Skip query-only changes, so typing in a search box doesn't lose focus, and skip the initial load. Coursewright does this in `route-focus.ts`, and a Playwright test asserts the h1 is focused.

**Interviewer:** How do you announce async results, like twelve courses found, without announcing every keystroke?

[pause 5s]

Put the count in a status region, an element with `role="status"` that's always in the DOM, and change its text only when the results settle. Debounce the search, so the request and the announcement come after the user pauses. Keep the message short: a count, not the list. It's polite, never assertive, so it doesn't interrupt typing. For long-running work, announce state changes like queued, running and completed, not every percentage. Coursewright's catalog and reports pages both work this way.

**Interviewer:** Review a custom dropdown built from divs. What's missing?

[pause 5s]

First, why not a native select? If there's a real reason, check it against the ARIA pattern. It needs an accessible name from a label, roles for the combobox, listbox and options, and state for expanded and selected. It needs full keyboard support: Tab, arrows, Enter, Escape, Home, End and typing to jump. Focus has to return to the control when the list closes, with a visible focus ring and a big enough target. I'd suggest a tested headless library instead, and our template lint would flag the click-only div anyway.

**Interviewer:** Which WCAG 2.2 criteria does a sticky header most often break?

[pause 5s]

Focus Not Obscured, at AA: tabbing backwards or following a skip link scrolls the focused element under the header. The fix is `scroll-padding-top` equal to the header's height. Reflow: at four hundred percent zoom the header can take most of the viewport, so let it scroll away on short screens. And Target Size, because headers pack small icon buttons, and each needs twenty-four by twenty-four CSS pixels or enough spacing. I'd check all three with a keyboard at high zoom, not only with axe.

**Interviewer:** How would you make accessibility part of the definition of done for a whole team?

[pause 5s]

Make the right thing cheap and the wrong thing hard to ship. Accessible primitives in the design system, so most screens inherit the right behaviour. Template lint and axe in end-to-end tests, blocking in continuous integration, as Coursewright does. A keyboard pass in every pull-request checklist, and a screen-reader pass on key journeys before each release. Design annotations for headings, focus order and names. Accessibility bugs triaged by severity like any other. And a champion in each team, with training, so it doesn't depend on one person.

## Recap

Five things to remember from this lesson.

One: a single-page app removes the page load, so it must restore what the page load did. A title, focus on the new page's h1, and an announcement, but not for query-only changes.

Two: live regions must exist before their text changes. Coursewright uses one polite announcer for the app, and status regions that change only when results or job states settle.

Three: one alert per form, with fields described rather than shouting. Busy, not disabled. And when you remove the element that has focus, decide where focus goes.

Four: native elements first. A native button, select and progress bar bring roles, keys and state for free. ARIA only fills gaps.

Five: test at every level: template lint, axe on real pages, a keyboard path in Playwright, and people with screen readers. Automation catches only part of it.

In the next lesson, we'll look at performance budgets and web vitals: what goes in the initial bundle, how Coursewright keeps it there, and how to investigate a slow interaction on a low-end phone.
