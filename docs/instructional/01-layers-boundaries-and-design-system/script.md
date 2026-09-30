# 01 · Layers, Boundaries and the Design System

Welcome to the first lesson in this series. The series prepares you for a senior frontend interview at an AI-powered enterprise learning platform company, and it uses one codebase the whole way through: Coursewright, a fictional multi-tenant learning platform, with an Angular 22 web app, a small Node backend-for-frontend, and an OpenAPI contract between them. This lesson is about the architecture question that opens most senior frontend interviews. By the end of it, you should be able to explain how you'd structure a large Angular application so it stays changeable, how a design system fits into that structure, and why the rules have to be enforced by tooling rather than by good intentions.

## The questions this lesson answers

Here are the questions this lesson prepares you for. How do you structure a large Angular application so it stays maintainable? Why is the design system's button an attribute selector, not an element? Two features need the same course card: where does it go? How do design tokens support per-tenant branding without a build per tenant? And how would you roll out a breaking change to a design-system component that's used in two hundred places?

Keep one sentence in your head while you listen. Architecture that isn't executable erodes. Every structure in this lesson, the layers, the import rules, the tokens and the primitives, exists so that the right thing is the easy thing, and the wrong thing fails the build.

## How large frontends fail

Start with the failure mode, because it's what the interviewer is really asking about. Large frontend codebases rarely fail because of one bad component. They fail through erosion. A feature imports a helper from another feature's folder because it's right there. The design system starts injecting an application service, because one component needed the current user. None of these changes is wrong on its own, and each one gets through code review. A year later, nothing can move without breaking something else.

The architecture decision record for this repository, `docs/adr/0001-workspace-and-boundaries.md`, starts from exactly that observation. It weighed three setups: separate repositories for the web app and the backend-for-frontend; an Nx monorepo with libraries, tags and Nx's module-boundary rule; or a plain pnpm workspace with the Angular CLI, and boundaries enforced by ESLint. It chose the third. The one-breath reason: the contract, the backend route and the Angular feature usually change together in one pull request, so they belong in one workspace, and at this size a lint rule can enforce the boundaries without a build system.

## The four layers

Inside the web app, folders are the architecture. There are four kinds of folder, and each has a rule about what it may import.

The design system depends on nothing in the app. It's the bottom layer: tokens, and primitives like the button, the text field, the card and the progress bar.

Core may use the design system, but never a feature and never the shell. It holds what every feature needs: the API client, the authentication store and its interceptor, the route guards, error handling and observability.

The shell may use core and the design system. It's the frame around every page: the skip link, the header, the navigation, and the main element the router renders into.

And each feature may use core and the design system, but never another feature and never the shell. Coursewright has five: login, catalog, course, reports, and not found, and every one is lazy-loaded.

The rule to remember is that shared code moves down a layer. It's never imported sideways. If the catalog and the course page both need something, it moves into core if it's a service, or into the design system if it's presentational.

Core and the design system are reached through path aliases, `@cw/core` and `@cw/design-system`, each backed by a barrel file that re-exports the public pieces. That gives each layer a public surface. A feature imports `AuthStore` from `@cw/core`, not from a file deep inside core, so core can reorganize itself without breaking anybody.

## Making the boundaries executable

Now the part that makes this more than a diagram on a wiki. Open `apps/web/eslint.config.js`. The comment at the top states the four rules in plain English, and the configuration turns each one into ESLint's `no-restricted-imports` rule, with a regular expression and a message.

The design-system block forbids `@cw/core`, and any relative path that climbs into core, features or the shell. The core block forbids features and the shell. And the feature block is the clever one. The config reads the features folder from the file system when lint runs, and generates one rule per feature, forbidding every other feature plus the shell. So a sixth feature folder is covered automatically, and nobody has to remember to update the config.

The messages matter as much as the patterns. The feature rule's error says: a feature must not import another feature or the shell; move shared code to core or the design system. The error teaches the architecture at the moment someone needs it, instead of a reviewer explaining it for the fifth time.

The same file adds two more guardrails. Selector rules require the `cw` prefix on every component and directive. And every HTML template gets Angular ESLint's template accessibility rules. Because `pnpm lint` runs in continuous integration, a violation is a failed build, not a review comment.

Be honest about the limits, because the ADR is. Lint rules check import paths, not a real dependency graph, so a creative relative path can dodge them, and Nx's tag rules can't be dodged that way. There's no project graph either, so continuous integration runs everything. The ADR names when to revisit: more than one app, or continuous integration time dominated by work a change didn't touch. Saying when you'd change your own decision is a senior signal.

## Tokens: theming as data

The design system starts with tokens. Open `design-system/tokens.css`. Tokens are CSS custom properties on the root element: colors, fonts and sizes, a spacing scale, radii, the focus ring and the transition timing, each with a prefix, like `--cw-color-primary`. The comment at the top states the contract: components read only these custom properties, so a theme, or a tenant's brand, is a matter of redefining them.

Dark mode shows how that works. A `prefers-color-scheme` media query redefines the same properties with dark values. No component knows dark mode exists. Nothing re-renders in Angular, and nothing is rebuilt. The browser recalculates styles, and that's it.

Per-tenant branding uses the same mechanism. In an enterprise learning platform, every customer wants their own colors. You don't want a build per tenant, and you don't want components branching on tenant IDs. You want the brand to be data. After sign-in, the app applies that tenant's values to the same custom properties, from a small tenant stylesheet or by setting them on the document element, and the components don't change at all.

There's a catch, and saying it is what makes the answer senior. The tokens file promises that every text and background pair meets WCAG AA, a contrast ratio of four and a half to one, and that control borders and the focus ring meet the three to one minimum for non-text contrast. A tenant who picks pale yellow as their primary color would break that promise. So brands are validated when they're configured, not when a user complains: the tenant picks a brand color, and the platform derives the text color that sits on it, or rejects the combination.

The tokens file also holds the global accessibility rules: a visible focus ring for keyboard users through `:focus-visible`, a reduced-motion override, and a visually hidden class for text that only screen readers need.

## Primitives that keep the platform's behaviour

Now the primitives. Open `design-system/button/button.ts`. The selector is `button[cwButton], a[cwButton]`. It's an attribute component, so it attaches to a native button, or to a native anchor for a link styled as a button. The template is just content projection, and the component adds a class, a secondary variant and a busy input.

Why an attribute and not an element? Because the native button already does a lot of work. It's focusable. It activates on Enter and on Space. It submits its form. It has the button role, takes its accessible name from its text, and respects the disabled attribute. A `cw-button` element that rendered a div would lose all of that, and someone would spend a sprint adding it back and still miss a case. A `cw-button` element that wrapped a real button would have to forward every attribute the inner button might need, type, form, and any ARIA attribute, so its API would grow forever. The attribute selector adds styling and conventions on top of the browser's behaviour, rather than replacing it.

The busy input sets `aria-busy` rather than disabling the button. A disabled button drops focus, hides why it's unavailable, and swallows clicks. In this codebase a double click on Enroll must reach the code designed to absorb it, the exhaust map operator from lesson three. So busy keeps the button focusable and shows a spinner, and the logic, not the markup, prevents duplicates.

Next, `design-system/text-field/text-field.ts`. The text field implements Angular's `ControlValueAccessor`, so it plugs into any Angular form like a native input would. More importantly, it owns the accessibility wiring, so a feature can't get it wrong. The label's `for` attribute points at a generated input ID. The hint and the error get IDs too, and a computed signal joins whichever exist into the input's `aria-describedby`, so a screen reader reads them when the field gets focus. An error also sets `aria-invalid`. The error text deliberately has no alert role: a form with three invalid fields would fire three alerts at once, so the form's single error summary announces instead. The spec file next to it tests exactly that.

The card has one small detail that shows design-system thinking. It takes a heading and a heading level, two, three or four. The page decides the level, because only the page knows its own outline. A component that hard-codes an h3 breaks the heading structure of every page that uses it in a different context.

## Smart and presentational

Put the layers and the primitives together and you get a simple split. Feature pages are smart: they inject stores and services and know about HTTP. Primitives are presentational: they take inputs, emit outputs, and know nothing about where data comes from.

Open `features/catalog/catalog-page.ts` to see it. The catalog page imports `Button` and `Card` from the design system, and provides a `CatalogStore` in its own providers array, so the store lives exactly as long as the page. The template composes cards and buttons, and neither of them knows it's showing courses.

One more detail shows architecture meeting performance. The text field isn't exported from the main design-system barrel. It has its own entry point, `@cw/design-system/forms`. The comment in `design-system/forms.ts` explains why: the text field pulls in Angular's forms package, about fifty-six kilobytes, and barrel re-exports weren't tree-shaken in this build, so the main barrel would have put forms into every page's initial bundle. Only the lazy login page needs it. A barrel is a public surface, and it can also be a performance trap. Lesson six comes back to this.

## Evolving the design system

Interviewers at this level push past the structure to how you'd evolve it. Three scenarios come up again and again.

First, two features need the same course card. Don't import it from the catalog feature; in this repo, lint would stop you anyway. That import couples two features' releases and ownership, and it turns one feature's internals into someone else's API. Instead, split what's generic from what's specific. The generic card, with a title, a summary and some metadata, moves down into the design system with plain inputs and no knowledge of the course model, and each feature maps its own data onto it. If the shared part is behaviour, like loading a course, it moves into core.

Second, a team wants to add a date picker to the design system. Before accepting it, you'd want its API to guarantee a few things. It works with Angular forms through the control value accessor. It's labelled, with hint and error wiring. It's fully usable from the keyboard, following the published ARIA pattern, or better, it builds on the native date input where the product allows. It's explicit about time zones, because a due date means midnight in somebody's time zone. It reads only tokens. And it arrives with tests, including an automated accessibility check.

Third, a breaking change to a component used in two hundred places. Never in one pull request. Make it additive first: ship the new API alongside the old one. Deprecate the old one, so editors strike it through, and add a lint warning for new uses. Ship a codemod, for example an Angular schematic, to migrate call sites mechanically, in batches each team can review, with visual regression tests catching surprises. Remove the old API in the next major version, when the warning count is zero. It's strangler thinking at component scale.

What production would add is predictable: a published component library built with ng-packagr, Storybook with interaction and accessibility tests per component, visual regression tests, and a written deprecation policy.

## Traps

Here are the traps to call out.

Wrapping a div in a component and calling it a button. You'll rebuild keyboard handling, focus and roles, and still miss cases.

Hard-coding colors inside components. Every hard-coded value is a tenant brand that doesn't apply and a dark mode that doesn't work.

Letting a feature import another feature just this once. It's never just once.

Letting the design system depend on the app, for example by injecting the authentication store into a primitive. From then on, it can't be tested or published on its own.

Treating barrels as free. A barrel that re-exports something heavy drags it into every bundle that touches it.

Believing lint rules are a dependency graph. They check import paths, and a creative relative path can dodge them.

And an alert role on every field error, so a form with three mistakes shouts three times.

## Interview drill

Let's practise. After each question there's a short pause. Pause the audio if you want more time, answer out loud, and then compare your answer with the model answer.

**Interviewer:** How do you structure a large Angular application so it stays maintainable?

[pause 5s]

In layers with one-way dependencies: a design system that depends on nothing in the app, core services that use only the design system, a shell, and features that use core and the design system but never each other. Shared code moves down a layer, never sideways, and each layer has a public surface through a path alias. Most importantly, the rules are executable. In Coursewright they're restricted-import lint rules generated per feature, so continuous integration fails on a violation. I'd move to Nx tags once there's more than one app, or continuous integration time is wasted on code a change didn't touch.

**Interviewer:** Why is the design system's button an attribute selector, not an element?

[pause 5s]

Because the native button already provides focus, Enter and Space activation, form submission, the button role, its accessible name and disabled semantics. An attribute component on a real button keeps all of that and adds styling on top. An element wrapping a div loses it, and an element wrapping a button has to forward every attribute forever. And busy uses `aria-busy` rather than disabled, so focus stays put and double clicks still reach the logic that absorbs them.

**Interviewer:** Two features need the same course card. Where does it go?

[pause 5s]

Not into one feature for the other to import. That couples two features' ownership and releases, and in this repo lint blocks it. The presentational part moves down into the design system, with plain inputs and no knowledge of the course model, and each feature maps its own data onto it. If the shared part is behaviour, like fetching a course, it moves into core.

**Interviewer:** How do design tokens support per-tenant branding without a build per tenant?

[pause 5s]

Tokens are CSS custom properties, and components read only tokens. So a theme is data: redefine the properties, and every component updates with no re-render and no rebuild. Dark mode in Coursewright is exactly that. A tenant brand is applied the same way after sign-in. The catch is contrast: the tokens promise WCAG AA, so tenant colors are validated at configuration time, and the platform derives the text color that sits on a brand color.

**Interviewer:** How would you roll out a breaking change to a design-system component used in two hundred places?

[pause 5s]

Additively. Ship the new API alongside the old one, deprecate the old one, and add a lint warning for new uses. Provide a codemod, such as an Angular schematic, migrate in reviewable batches with visual regression tests, and remove the old API in the next major version once the warning count is zero. It's a strangler at component scale.

## Recap

Five things to remember from this lesson.

One: large frontends fail by erosion, not by one bad component. Architecture that isn't executable erodes.

Two: four layers with one-way dependencies: design system, core, shell and features. Shared code moves down a layer, never sideways.

Three: make the rules executable. Coursewright generates a restricted-import rule per feature, with messages that teach, and continuous integration fails on a violation.

Four: tokens make theming data. Dark mode and tenant brands redefine custom properties with nothing rebuilt, and contrast is validated when a brand is configured.

Five: primitives keep the platform's behaviour. The button is an attribute on a native button, the text field owns its label and error wiring, and the page, not the card, decides the heading level.

In the next lesson, we'll look at signals and zoneless change detection: what actually triggers a render when there's no `zone.js`, and why Coursewright keeps its state in signals.
