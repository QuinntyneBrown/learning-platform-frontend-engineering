# 01 · Layers, Boundaries and the Design System

> **Runtime:** ~21 min · **Level:** Senior · **Study guide:** [§1 Component architecture and design systems](../../study-guide.md#1-component-architecture-and-design-systems) · **Prerequisites:** none

**Video:** [01-layers-boundaries-and-design-system.mp4](01-layers-boundaries-and-design-system.mp4) · [Slides](slides.html) · **Audio lesson:** [01-layers-boundaries-and-design-system.mp3](01-layers-boundaries-and-design-system.mp3) · [Transcript](script.md)

## Why this video exists

"How would you structure a large Angular application?" opens most senior frontend interviews. A weak answer draws boxes. A strong answer explains how the boxes **stay** boxes after a year of feature work. Large frontends fail by erosion: sideways imports and a design system that quietly depends on the app. This video builds the answer from Coursewright's code:
- four one-way layers;
- ESLint rules generated per feature;
- CSS custom-property tokens that make theming (and tenant branding) data;
- primitives that keep the browser's built-in behaviour instead of rebuilding it.

## Learning objectives

By the end, the viewer can:

- Describe Coursewright's four layers (design system, core, shell, features) and the one-way import rule between them.
- Explain how `apps/web/eslint.config.js` makes the boundaries executable, and name the limits of lint-based rules compared with Nx tags.
- Explain why tokens are CSS custom properties, and how dark mode and per-tenant branding work without a rebuild. Include the contrast catch.
- Justify `button[cwButton]` over a `<cw-button>` element, and `aria-busy` over `disabled`.
- Show how `cw-text-field` owns its label, hint and error wiring through `ControlValueAccessor`.
- Answer the evolution scenarios: a shared card, a new date picker, a breaking change in 200 places.

## Interview questions this prepares you for

| Question | What a strong answer includes |
|---|---|
| How do you structure a large Angular app so it stays maintainable? | One-way layers: design system → core → shell and features. Features never import each other. Shared code moves *down* a layer, never sideways. Public surfaces through path aliases and barrels. Rules enforced by lint in CI, not by review. Name when you'd move to Nx: more than one app, or CI time wasted on untouched code. |
| Why is the button an attribute selector, not an element? | A native `<button>` brings focus, Enter/Space activation, form submission, the role, the accessible name and disabled semantics. An attribute component keeps all of that. A `<cw-button>` wrapping a `div` loses it; one wrapping a `button` must forward every attribute forever. `aria-busy`, not `disabled`, keeps focus and lets `exhaustMap` absorb double clicks. |
| Two features need the same course card. Where does it go? | Not imported from one feature by another: that couples ownership and releases, and lint blocks it. The presentational card moves into the design system, with plain inputs and no domain model. Each feature maps its data onto it. Shared *behaviour* goes to core. |
| How do tokens support per-tenant branding without a build per tenant? | Components read only CSS custom properties. A theme is data: redefine the properties, and nothing re-renders or rebuilds. Dark mode already works this way. Tenant brands are applied after sign-in the same way. Contrast (AA 4.5:1 for text, 3:1 for controls and focus) is validated at configuration time, and the platform derives the text color on a brand color. |
| How would you roll out a breaking change to a component used in 200 places? | Additive first: the new API alongside the old, `@deprecated`, and a lint warning for new uses. A codemod (Angular schematic) and batched migrations with visual regression tests. Remove the old API in the next major, at zero warnings. |
| A team wants to add a date picker to the design system. What must its API guarantee? | `ControlValueAccessor`, a label, and hint/error wiring via `aria-describedby`. Full keyboard support per the ARIA pattern, or the native date input. Explicit time-zone semantics. Tokens only. Tests, including axe. |
| What are the limits of enforcing architecture with lint? | It checks import *paths*, not a dependency graph. Creative relative paths can dodge it, and there's no project graph for affected-only CI. Nx tags or Angular libraries fix both, at the cost of more tooling. |

## Coursewright code on screen

| File | What to show |
|---|---|
| `docs/adr/0001-workspace-and-boundaries.md` | The erosion problem; the three options; the layer table; "When to revisit" |
| `apps/web/eslint.config.js` | The comment stating the four rules; `restrict()`; `featureNames()` generating one rule per feature; the teaching message; selector-prefix and template-accessibility rules |
| `apps/web/tsconfig.json` | The `@cw/core`, `@cw/design-system` and `@cw/design-system/forms` path aliases |
| `apps/web/src/app/core/index.ts`, `design-system/index.ts` | Barrels as public surfaces |
| `apps/web/src/app/design-system/tokens.css` | The contract comment (AA contrast); the dark-mode media query; `:focus-visible`; reduced motion; `.cw-visually-hidden` |
| `apps/web/src/app/design-system/button/button.ts` | `selector: 'button[cwButton], a[cwButton]'`; the `aria-busy` host binding; the "busy, not disabled" comment |
| `apps/web/src/app/design-system/text-field/text-field.ts`, `.html`, `.spec.ts` | `ControlValueAccessor`; `describedBy` computed; `aria-invalid`; the "no role=alert" comment and the test asserting it |
| `apps/web/src/app/design-system/card/card.ts` | `headingLevel` input: the page decides the outline |
| `apps/web/src/app/features/catalog/catalog-page.ts` | A feature composing `Button` and `Card`, with `providers: [CatalogStore]` |
| `apps/web/src/app/design-system/forms.ts` | Why the text field has its own entry point (about 56 kB of `@angular/forms`) |

## Run sheet

| Time | Segment | Content |
|---|---|---|
| 00:00–01:30 | Hook | The series and Coursewright in one breath. The thesis: architecture that isn't executable erodes. |
| 01:30–03:00 | How frontends fail | Erosion, not one bad component. ADR-0001's three options and why a pnpm workspace + ESLint won at this size. |
| 03:00–05:00 | The four layers | Walk the layer table one row at a time. "Shared code moves down, never sideways." Path aliases and barrels as public surfaces. |
| 05:00–07:30 | Executable boundaries | `eslint.config.js`: `restrict()`, the per-feature rules generated from the file system, the message that teaches, selector and template-a11y rules. **Demo** a violation (below). The limits, and when to revisit. |
| 07:30–10:00 | Tokens | Custom properties as the contract; dark mode as proof; tenant branding as data (sketch); the contrast catch; the global focus and motion rules. |
| 10:00–13:30 | Primitives | `button[cwButton]` vs a wrapper element (three cards); busy vs disabled; the text field's wiring and its spec; the card's heading level. |
| 13:30–15:00 | Smart and presentational | The catalog page composing primitives, with a component-scoped store. The forms entry point as the first performance lesson. |
| 15:00–17:00 | Evolving the design system | Shared card; date-picker acceptance criteria; the six-step breaking change. What production would add. |
| 17:00–18:00 | Traps | The seven traps below. |
| 18:00–21:00 | Drill and recap | Five questions, then the five points. |

## Code excerpts

### The boundary rule, generated per feature

```js
// apps/web/eslint.config.js
const features = featureNames();
const restrict = (regex, message) => ({
  'no-restricted-imports': ['error', { patterns: [{ regex, message }] }],
});
// …
  ...features.map((feature) => ({
    files: [`src/app/features/${feature}/**/*.ts`],
    rules: restrict(
      `(^|/)(${[...features.filter((f) => f !== feature), 'shell'].join('|')})/`,
      'A feature must not import another feature or the shell. Move shared code to core or the design system.',
    ),
  })),
```

### The button: an attribute on a native element

```ts
// apps/web/src/app/design-system/button/button.ts
@Component({
  selector: 'button[cwButton], a[cwButton]',
  template: '<ng-content />',
  styleUrl: './button.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'cw-button',
    '[class.cw-button--secondary]': "variant() === 'secondary'",
    '[attr.aria-busy]': 'busy() || null',
  },
})
export class Button {
  readonly variant = input<ButtonVariant>('primary');
  readonly busy = input(false);
}
```

### The text field's accessibility wiring

```ts
// apps/web/src/app/design-system/text-field/text-field.ts
protected readonly describedBy = computed(
  () =>
    [this.hint() && this.hintId, this.error() && this.errorId].filter(Boolean).join(' ') || null,
);
```

### A tenant brand applied at runtime (sketch, not in this repo)

```ts
// After sign-in, from the tenant's validated brand configuration.
const root = document.documentElement;
for (const [token, value] of Object.entries(tenant.brandTokens)) {
  root.style.setProperty(token, value); // e.g. '--cw-color-primary', '#0f766e'
}
```

Validate the brand when it's configured, not when it renders: check each text/background pair against 4.5:1, and control borders and the focus ring against 3:1. Derive `--cw-color-on-primary` from the brand color instead of accepting it as input.

## Demo

```bash
# The architecture, as lint sees it
git grep -n "no-restricted-imports\|featureNames" -- apps/web/eslint.config.js

# Break a boundary on purpose, watch lint fail, then undo it
echo "import { CatalogStore } from '../catalog/catalog.store';" >> apps/web/src/app/features/course/course-page.ts
pnpm --filter @coursewright/web lint
#   error  '../catalog/catalog.store' import is restricted from being used by a pattern.
#          A feature must not import another feature or the shell. Move shared code to core or the design system
git checkout -- apps/web/src/app/features/course/course-page.ts

# Dark mode is only token values: toggle it in DevTools
pnpm dev   # open http://localhost:4200, then DevTools → Rendering → "Emulate CSS media feature prefers-color-scheme: dark"
```

With the app running, inspect the Enroll button on a course page. It's a real `<button>` element with the `cw-button` class. Tab to it and press Space.

## Traps to call out

- **A `div` called a button.** You rebuild keyboard handling, focus and roles, and still miss cases.
- **Hard-coded colors in components.** Each one is a tenant brand that doesn't apply and a dark mode that doesn't work.
- **"Just this once" cross-feature imports.** They are never just once. The lint rule says no so reviewers don't have to.
- **A design system that depends on the app.** Injecting the auth store into a primitive means it can't be tested, documented or published on its own.
- **Barrels treated as free.** Re-exporting something heavy puts it in every bundle that touches the barrel (see `design-system/forms.ts`).
- **Lint mistaken for a dependency graph.** It checks import paths; a creative relative path can dodge it.
- **`role="alert"` on every field error.** Three invalid fields, three simultaneous announcements. One summary announces; fields are described.

## Key terms

layered architecture · one-way dependencies · barrel / public surface · path alias · `no-restricted-imports` · Nx module boundaries · design tokens · CSS custom properties · `prefers-color-scheme` · WCAG AA contrast (4.5:1, 3:1 non-text) · attribute component · `ControlValueAccessor` · `aria-describedby` / `aria-invalid` / `aria-busy` · smart vs presentational · codemod / Angular schematic · deprecation policy

## After the video

1. Write the "course card moves to the design system" change as a plan. Decide which inputs the card takes, and what each feature's mapping looks like.
2. Draft the date picker's acceptance checklist as a pull-request template for design-system contributions.
3. Write a tiny validator that checks a tenant brand's primary and on-primary colors against 4.5:1, and decide what it should do on failure.

## References

- [`docs/study-guide.md`](../../study-guide.md), section 1
- [ADR-0001: workspace and boundaries](../../adr/0001-workspace-and-boundaries.md)
- Angular documentation: component selectors, host bindings, `ControlValueAccessor`
- ESLint documentation: `no-restricted-imports` (patterns with `regex`)
- WCAG 2.2: 1.4.3 Contrast (Minimum), 1.4.11 Non-text Contrast, 2.4.7 Focus Visible
- WAI-ARIA Authoring Practices: Button pattern, Date Picker Dialog pattern
