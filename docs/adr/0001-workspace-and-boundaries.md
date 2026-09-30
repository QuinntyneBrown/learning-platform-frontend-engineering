# ADR-0001: One pnpm workspace, with boundaries enforced by lint

- **Status:** Accepted
- **Date:** 2026-09-30
- **Deciders:** Coursewright web team

## Context

Coursewright has a web app, a backend-for-frontend (BFF) and the contract between them. They change together: most features touch the contract, the BFF route and the Angular feature in one pull request.

Frontend codebases at scale rarely fail on one bad component. They fail through erosion: a feature imports another feature's internals, the design system starts depending on app services, and after a year nothing can move without breaking something else.

We considered three setups:

1. **Separate repositories** for the web app and the BFF.
2. **Nx monorepo** with libraries, tags and `@nx/enforce-module-boundaries`.
3. **A plain pnpm workspace** with the Angular CLI, and boundaries enforced by ESLint.

## Decision

Use one pnpm workspace with three packages:
- `apps/web`: the Angular CLI application;
- `apps/bff`: the Fastify service;
- `contracts`: the OpenAPI document and its generated types.

Inside the web app, folders are the architecture:

| Folder | May import | Must not import |
|---|---|---|
| `design-system/` | nothing from the app | core, features, shell |
| `core/` | design-system | features, shell |
| `shell/` | core, design-system | features |
| `features/<name>/` | core, design-system | other features, shell |

`core` and `design-system` are reached through the path aliases `@cw/core` and `@cw/design-system`, each backed by a barrel file. The rules live in `apps/web/eslint.config.js` as `no-restricted-imports` patterns, so `pnpm lint` and CI fail on a violation. The feature list is read from the file system, so a new feature folder is covered automatically.

## Consequences

**Positive**

- A contract change, the BFF change and the UI change land in one commit and one CI run.
- The boundaries are executable rather than tribal knowledge. A reviewer doesn't have to spot a cross-feature import.
- The Angular CLI setup stays small, so there's little to learn before reading the code.

**Negative**

- No project graph and no "affected" builds: CI runs everything. That's fine at this size and would not be at fifty libraries.
- Lint-based rules check import paths, not a real dependency graph. They can be bypassed with a deep relative path that dodges the patterns; Nx tags can't.

**When to revisit.** Move to Nx (or Angular libraries with ng-packagr) once there is more than one app, or when CI time is dominated by work that a change didn't touch.
