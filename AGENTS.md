## Project Overview

This git repository holds a thin but comprehensive reference implementation of a full-stack product. The candidate uses it to prepare for an interview for a frontend engineering role at an AI-powered enterprise learning platform company. The codebase aims for breadth over depth: each part of the stack gets just enough real, working code to study, discuss and demo in an interview.

The product is **Coursewright**, a fictional multi-tenant learning platform made by the fictional Ashgrove Learning. The repo has three parts:
- an Angular 22 web app;
- a Node/TypeScript backend-for-frontend (BFF);
- the OpenAPI contract between them.

`docs/study-guide.md` maps each technical area of the role to the files that show it.

## Commands

Run these from the repository root. Node 22.13+ and pnpm 12 are required.

- Install: `pnpm install`
- Run both apps: `pnpm dev` (web on http://localhost:4200, BFF on http://localhost:3000)
- Test: `pnpm test` (BFF integration tests + web unit tests, all Vitest)
- Lint: `pnpm lint`
- Build: `pnpm build` (Angular production build with budgets; BFF type-check)
- End-to-end: `pnpm e2e` (Playwright + axe; starts both apps itself)
- Contract types: `pnpm contracts:generate`. `pnpm contracts:check` fails if `contracts/schema.d.ts` is stale.

## Project Structure

- `contracts/`: `openapi.yaml` (hand-written source of truth) and the generated `schema.d.ts` (`@coursewright/contracts`)
- `apps/bff/`: Fastify 5 + built-in `node:sqlite` (in-memory, seeded on start)
  - `apps/bff/src/`
  - `apps/bff/test/`
- `apps/web/`: Angular 22, zoneless and standalone
  - `apps/web/src/app/core/`: auth, HTTP interceptors, error handling, observability (`@cw/core`)
  - `apps/web/src/app/design-system/`: tokens and `cw-*` primitives (`@cw/design-system`)
  - `apps/web/src/app/shell/`: layout, skip link, focus management
  - `apps/web/src/app/features/`: one folder per lazy-loaded feature
  - `apps/web/e2e/`: Playwright specs
- `docs/`: study guide and ADRs (`docs/adr/`)
- `.github/workflows/ci.yml`

## Testing

- BFF: Vitest with Fastify's `app.inject()`. A contract test validates responses against `contracts/openapi.yaml`.
- Web: Vitest through `ng test`.
- End-to-end: Playwright with `@axe-core/playwright`.

## Code Style

- `.editorconfig` and `.prettierrc` are authoritative for formatting.
- Types that cross the wire come from `@coursewright/contracts`; never hand-write them. Change `openapi.yaml` first, then run `pnpm contracts:generate`.
- Lint enforces the web app's boundaries (`apps/web/eslint.config.js`):
  - The design system imports nothing from the app.
  - Core imports no features.
  - Features don't import each other.

## Git Workflow

- Every change is checked by continuous integration: `.github/workflows/ci.yml`.
- Commit locally only. Never push.

## Boundaries

- Never name the real hiring company anywhere: files, commits or docs. That includes its products, ticker and job-posting URL. Describe it only as "an AI-powered enterprise learning platform company".
- Never name the candidate: no name, username, profile URL or location. Write "the candidate".
- Keep the scope slim. Don't add frameworks, services or tooling the study guide doesn't need.
