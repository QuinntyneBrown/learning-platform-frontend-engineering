# coursewright

A slim, working reference of a full-stack learning platform, built for interview preparation. **Coursewright** is a fictional multi-tenant learning product made by the fictional Ashgrove Learning. It has three parts:
- an Angular 22 web app;
- a Node/TypeScript backend-for-frontend (BFF);
- the OpenAPI contract between them.

Tests cover every layer, and CI runs them all.

The scope is deliberately thin. Each technical area gets just enough real code to read, run, change and talk about. **Start with [`docs/study-guide.md`](docs/study-guide.md)**: it maps each area to the files that show it, with talking points and interview drill questions.

## What's here

```
contracts/          openapi.yaml (hand-written source of truth) + generated schema.d.ts
apps/bff/           Fastify 5 + node:sqlite (in-memory, seeded on start) on :3000
  src/auth/           access tokens, rotating refresh tokens, bearer + role guards
  src/routes/         auth, courses (keyset, ETag), enrollments (Idempotency-Key), reports + jobs (202, SSE), rum
  src/jobs/           JobQueue interface, in-memory queue with retry + dead-letter, report worker
  src/contract.ts     validates request bodies against openapi.yaml's schemas
  src/observability.ts  W3C traceparent, trace_id on every log line, Server-Timing
  test/               integration tests + contract test against openapi.yaml
apps/web/           Angular 22 (zoneless, standalone, OnPush) on :4200
  src/app/core/       auth store + interceptors, API client, error handler, RUM
  src/app/design-system/  tokens + cw-* primitives (button, text field, card, progress, live announcer)
  src/app/shell/      layout, skip link, focus + announcement on navigation, title strategy
  src/app/features/   login, catalog, course, reports, not-found (all lazy-loaded)
  e2e/                Playwright + axe
docs/               study guide + ADRs 0001–0006
.github/workflows/  CI: contract drift, lint, test, build (budgets), E2E
```

## Prerequisites

- Node **22.13+** (`.nvmrc`). The BFF uses the built-in `node:sqlite`.
- pnpm **12** (`npm i -g pnpm@12`, or `corepack enable`).

There's no Docker and no database server to install.

## Getting started

```bash
pnpm install
pnpm dev            # BFF on http://localhost:3000, web on http://localhost:4200
```

Open http://localhost:4200 and sign in. Every account's password is `Coursewright2026!`.

| Username | Name | Tenant | Roles |
|---|---|---|---|
| `learner.acme` | Riley Chen | Acme Corp | learner |
| `manager.acme` | Morgan Patel | Acme Corp | learner, manager |
| `learner.globex` | Sam Okafor | Globex Industries | learner |
| `manager.globex` | Jordan Rivera | Globex Industries | learner, manager |

The database is in memory, so restarting the BFF resets it.

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | Runs the BFF and the web app in watch mode |
| `pnpm test` | BFF integration + contract tests, web unit tests (Vitest) |
| `pnpm lint` | ESLint, including the web app's architectural boundaries and template accessibility rules |
| `pnpm build` | Angular production build (fails on bundle budgets) + BFF type-check |
| `pnpm e2e` | Playwright + axe; starts its own BFF (:3100) and web server (:4300) |
| `pnpm contracts:generate` | Regenerates `contracts/schema.d.ts` from `openapi.yaml` |
| `pnpm contracts:check` | Fails if the generated types are stale (CI runs this) |

The first `pnpm e2e` needs a browser: `pnpm --filter @coursewright/web exec playwright install chromium`.

## A five-minute tour

1. **Search** the catalog with devtools' Network tab open. Type quickly: one request fires per pause, and a newer query cancels an older one (`switchMap`). The query lives in the URL.
2. **Open a course and double-click Enroll.** One `POST /api/enrollments` goes out (`exhaustMap`), carrying an `Idempotency-Key`.
3. **Reload the page.** You stay signed in, even though the access token was only in memory. The httpOnly refresh cookie restores the session.
4. **Sign in as `manager.acme`, open Reports, and export with "Simulated failures" set to 1.** Progress streams over SSE, the first attempt fails, and the retry succeeds. Try 3 to see retries run out.
5. **Compare a response's `traceparent` header with the BFF's log lines.** The same `trace_id` appears on every line for that request.
6. **Tab from the top of any page.** The first stop is "Skip to main content", and after each navigation focus moves to the new page's heading.

## Where to start

1. [`docs/study-guide.md`](docs/study-guide.md): one section per technical area, with files, talking points and drills.
2. [`docs/adr/`](docs/adr/): the six decisions that shape the code, with their trade-offs.
3. [`contracts/openapi.yaml`](contracts/openapi.yaml): read the API before reading either side of it.

## Out of scope, on purpose

This repo doesn't include:
- Nx, SSR, Storybook or i18n;
- a real identity provider;
- the PHP platform services, MySQL, AWS (SNS, SQS, S3), Docker or OpenTelemetry exporters.

The study guide's "What production would add" notes and the ADRs show where each would plug in.
