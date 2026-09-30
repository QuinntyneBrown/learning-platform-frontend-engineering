# ADR-0002: Contract-first REST with a hand-written OpenAPI document

- **Status:** Accepted
- **Date:** 2026-09-30
- **Deciders:** Coursewright web team

## Context

The web app and the BFF are written by different people at different times. Drift between them shows up as `undefined` in a template, found by a user. The frontend also calls platform services owned by other teams, and those contracts have to be read, reviewed and versioned like code.

## Decision

`contracts/openapi.yaml` (OpenAPI 3.1) is the source of truth, written by hand and reviewed in pull requests.

- `pnpm contracts:generate` runs openapi-typescript to produce `contracts/schema.d.ts`. Both apps import wire types from `@coursewright/contracts`, and nobody hand-writes a wire type.
- CI runs `pnpm contracts:check`, which regenerates the types and fails on any diff, so the committed types can't drift from the YAML.
- The BFF validates request bodies against the contract's schemas, and its contract test (`apps/bff/test/contract.test.ts`) validates real responses against the documented schema for each operation and status.

The contract also fixes the HTTP semantics the UI relies on:

| Concern | Choice | Why |
|---|---|---|
| Errors | RFC 9457 `application/problem+json`, with `traceId` | One error shape for every endpoint; the trace ID links a user report to the logs |
| Pagination | Keyset (`cursor`), ordered by `(title, id)` | Stable under inserts, and constant cost at any depth, unlike `OFFSET` |
| Caching | Strong `ETag` + `If-None-Match` → `304` | Cheap revalidation without stale data |
| Retries | `Idempotency-Key` on `POST /enrollments` | A retried or double-submitted request can't enroll twice |
| Tenancy | The tenant comes from the token; another tenant's resource is a `404` | A `403` would confirm that the resource exists |
| Long work | `202 Accepted` + `Location` + events (see [ADR-0005](0005-async-jobs.md)) | No request held open for minutes |

## Consequences

**Positive**

- Type errors appear at compile time on both sides of the wire, in the same pull request.
- The contract test catches a response that the types can't: a missing field, a wrong enum value, `null` where the schema says string.
- The YAML is readable by product, QA and other teams without reading code.

**Negative**

- The YAML is verbose, and writing it first feels slower than writing the handler first.
- Generated types describe shapes, not behaviour. Idempotency and ETag semantics are enforced only by tests.

**Production note.** Add `oasdiff breaking` against `main` in CI, so a breaking change needs an explicit version bump.
