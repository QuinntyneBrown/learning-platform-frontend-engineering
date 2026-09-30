# 07 · Contract-First REST from the Frontend

> **Runtime:** ~22 min · **Level:** Senior · **Study guide:** [§6 REST APIs and service contracts](../../study-guide.md#6-rest-apis-and-service-contracts) · **Prerequisites:** [03](../03-rxjs-races-and-idempotent-submits/)

**Video:** [07-contract-first-rest-from-the-frontend.mp4](07-contract-first-rest-from-the-frontend.mp4) · [Slides](slides.html) · **Audio lesson:** [07-contract-first-rest-from-the-frontend.mp3](07-contract-first-rest-from-the-frontend.mp3) · [Transcript](script.md)

## Why this video exists

Senior frontend interviews treat the API boundary as the frontend's problem too: "rename this field without downtime", "what does the server do when the same idempotency key arrives with a different body?", "what does the user see for a 409?". A strong answer shows a contract that both sides are held to, not a wiki page. This video walks Coursewright's version:
- `contracts/openapi.yaml` is hand-written; `schema.d.ts` is generated, and CI fails if they differ;
- the web imports only generated types (`core/api/models.ts`);
- the BFF validates request bodies against the contract's own schemas;
- a contract test validates every real response and fails if any documented response isn't exercised;
- problem details, and where each status code lands in the UI;
- the server side of ETags and idempotency keys;
- a zero-downtime rename of `durationMinutes`.

## Learning objectives

By the end, the viewer can:

- Explain ADR-0002's contract-first decision, its HTTP conventions, and its stated costs.
- Trace a contract change from `openapi.yaml` through `openapi-typescript`, `contracts:check`, `models.ts` and the compiler, and name what typed HTTP calls do *not* guarantee.
- Explain how `bff/contract.ts` validates requests against the contract, and what `contract.test.ts` catches that TypeScript can't.
- Map each status code (400, 401, 403, 404, 409, 422, 0/5xx) to a UI decision, using `problem.ts` on both sides.
- Explain the course ETag (`private, no-cache`, a hash of the exact bytes, 304) and compare it with `max-age`.
- Explain server-side idempotency: key + request hash, replay, 422, the transaction, and the multi-instance caveat.
- Plan an expand/migrate/contract rename, including the wait for old tabs and the reversed order for request fields.

## Interview questions this prepares you for

| Question | What a strong answer includes |
|---|---|
| The backend team wants to rename `durationMinutes` to `duration`. How do you roll it out with zero downtime? | Expand, migrate, contract. Add `duration` to the three schemas (`CourseSummary`, `Lesson`, `Course`) next to `durationMinutes`, marked `deprecated: true` (openapi-typescript emits `@deprecated`, so editors strike through uses). The BFF sends both; because every schema has `additionalProperties: false`, the contract must change before the BFF, and the contract test enforces that order. Deploy the BFF. Move the web to `duration`; the generated types and Angular's strict template type-checking (on by default in the repo's Angular 22) find the three template reads. Deploy. Wait until old tabs (yesterday's JS) and other consumers are gone, based on data. Then remove the old field and regenerate. For request fields, reverse it: the server accepts both first. A unit change (minutes → ISO 8601 duration) is a new field. If a platform service renames, the BFF can absorb it in `toCourseSummary()`. |
| The same `Idempotency-Key` arrives twice: once with the same body, once with a different one. What does the server do, and why store a hash of the request? | `routes/enrollments.ts` requires the header (8–100 chars, else 400) and hashes the *validated* fields in a fixed order (`sha256(JSON.stringify({ courseId }))`), so whitespace or key order can't make one request look like two. It looks up `(user_id, key)` in `idempotency_keys`. Same hash: a retry, so it replays the saved status and body with `idempotency-replayed: true` and enrolls nothing. Different hash: 422 `/problems/idempotency-key-reused`. Without the hash, a client bug that reused a key for another course would silently get the first course's 201, and the user would think they'd enrolled. A new key goes through the tenant check (404) and the already-enrolled check (409), then the enrollment and its replayable response are inserted in one transaction. `DatabaseSync` is synchronous, so requests can't interleave in one process; with several instances, insert the key row first, marked in progress, let its primary key reject the concurrent duplicate (409 "in progress"), then save the response on that row. `created_at` exists for a sweeper to expire keys after a day; no sweeper is written yet. |
| Where does each status code end up in the UI of a form? | 400: rare if the client validates first; the problem's `detail` goes in the form's single `role="alert"`. 401: the auth interceptor refreshes once and retries once, then sends to sign-in (lesson 08); on the sign-in form it's "Username or password is incorrect." 403: a message, but the UI shouldn't have offered the action (`roleGuard`); the server decides. 404: the page changes ("Course not found" as the h1), not an alert. 409: can be success (already enrolled → "You're enrolled"). 422: a bug signal to log. 0/5xx: retried with backoff for enroll (300 ms, 600 ms), then `problemMessage()`. Every problem has a `traceId`; production would show it as a support reference. |
| ETag vs `Cache-Control: max-age`: what does each save, and what does each risk? | Course detail: a strong ETag (SHA-256 of the exact JSON sent, so `enrolled` changes it) with `private, no-cache`. The browser's HTTP cache revalidates with `If-None-Match` and turns a 304 into the cached 200, with no app code. Saves the bytes; costs a round trip and the server's query (the code comment says so); never stale. `max-age` skips the request for its lifetime, but can show stale data (an Enroll button after enrolling) that can't be recalled. Per-user responses must be `private` either way. ETags for per-user state; a short `max-age` (or `stale-while-revalidate`) plus an ETag for shared, slow-changing data. |
| How would you detect contract drift between two teams' services? | In one repo: one hand-written spec, generated types, `contracts:check` (regenerate + `git diff --exit-code`) first in CI, request validation against the spec's schemas, and a contract test that validates every response against the documented status/content type/schema and fails if any documented response isn't exercised. Between teams: consumer-driven contract tests (Pact) verified in the provider's pipeline, `oasdiff breaking` against main (ADR-0002's production note), and a generated client. In production, validate sampled responses against the schema and alert on violations. |
| What does the contract test catch that TypeScript can't? | TypeScript checks your code against the types you believe; it never sees the wire. The contract test runs the real app (`app.inject()`) and validates each response with a JSON Schema 2020-12 validator (Ajv 2020): a missing required field, a wrong enum value, `null` where a string is promised, an extra field (`additionalProperties: false`), an undocumented status or content type. Its last test compares the set of exercised `method path status` triples with every response the YAML documents. |
| How do the web app's types stay in sync with `openapi.yaml`? | `openapi-typescript` generates `contracts/schema.d.ts`; `@coursewright/contracts` exports it. `core/api/models.ts` only aliases `components['schemas'][...]` (and `operations['searchCourses']['parameters']['query']`), so nothing is hand-written. `pnpm contracts:check` fails CI if the committed types are stale. Limit: `http.get<CoursePage>()` is a cast, and paths are strings; a generated client would type those too. |
| What is RFC 9457 problem details, and what is `traceId` for? | One error shape for every endpoint, `application/problem+json`: `type` (`about:blank` by default, or a URI like `/problems/already-enrolled` for errors clients handle specially), `title`, `status`, `detail`, plus Coursewright's `traceId` (the request ID, which is the W3C trace ID). The BFF's error handler turns validation failures into 400s and unexpected errors into a bare 500 that echoes no internals; the `traceId` finds the log line. The web's `problemMessage()` shows `detail ?? title`, or a connection message for status 0. |

## Coursewright code on screen

| File | What to show |
|---|---|
| `docs/adr/0002-contract-first-rest.md` | Context (drift found by a user); the decision; the HTTP semantics table; the negative consequences; the `oasdiff` production note |
| `contracts/openapi.yaml` | The conventions in `info.description`; `required` + `additionalProperties: false`; the enrollment operation's prose and responses; shared `components.responses`; `Problem` |
| `contracts/package.json`, root `package.json` | `generate` (openapi-typescript); `exports` including the YAML; `contracts:generate` and `contracts:check` |
| `.github/workflows/ci.yml` | "Contract drift" as the first check |
| `apps/web/src/app/core/api/models.ts`, `coursewright-api.ts` | Aliases of generated types; `CourseSearchParams` from the operation; typed methods; the `Idempotency-Key` header |
| `apps/bff/src/contract.ts`, `app.ts`, `routes/enrollments.ts` | `componentSchemas()` with `$id`; `app.addSchema`; `body: { $ref: 'EnrollmentRequest#' }` |
| `apps/bff/test/contract.test.ts` | `expectToMatchContract()`; the enrollment calls (201, replayed 201, 422, 409, 404, 400, 401); "covers every response the contract documents" |
| `apps/bff/src/problem.ts`, `apps/web/src/app/core/problem.ts` | `sendProblem()`; the 500 comment; `problemMessage()` |
| `apps/web/src/app/features/course/enrollment-controller.ts` | `isTransient`; 409 treated as success |
| `apps/bff/src/routes/courses.ts` | The ETag, `private, no-cache`, `matchesIfNoneMatch`, 304 |
| `apps/bff/src/routes/enrollments.ts`, `apps/bff/src/db.ts` | Header schema; request hash; 422/replay; the transaction; the concurrency comment; `idempotency_keys` and its sweeper comment |
| `apps/bff/test/enrollments.test.ts`, `courses.test.ts` | Replay, 422, 409, 400 tests; the 304 and ETag-change tests |

## Run sheet

| Time | Segment | Content |
|---|---|---|
| 00:00–01:15 | Hook | The five questions. Thesis: the contract is code. |
| 01:15–02:30 | Why contract-first | ADR-0002: context, decision (the "one source, checked four ways" diagram), the HTTP semantics, the costs. |
| 02:30–03:45 | The contract | Conventions; strict schemas both ways; behaviour documented with the shape. |
| 03:45–05:30 | YAML to compiler | `contracts/package.json`; `contracts:check` in CI; `models.ts`; `CoursewrightApi`; a typed call is not a check. |
| 05:30–07:00 | Holding the server | `contract.ts` and `addSchema`; `contract.test.ts` and its coverage test. **Demo** a deliberate contract failure (below). |
| 07:00–09:10 | Status codes | `sendProblem()`; `problemMessage()`; the status table; 409 as success in the controller. |
| 09:10–10:40 | ETag and 304 | The handler; the revalidation sequence diagram; ETag vs `max-age`. **Demo** a 304 in DevTools. |
| 10:40–12:30 | Idempotency | Header schema and request hash; the decision flowchart; replay/422; the transaction; concurrency; why store a hash. **Demo** replay and 422 with curl. |
| 12:30–14:50 | The rename | Where `durationMinutes` lives; expand/migrate/wait/contract; the deprecated sketch and its generated output; request fields; two cautions; production additions. |
| 14:50–15:35 | Traps | The eight traps below. |
| 15:35–21:00 | Drill and recap | Five questions, then the five points. |

## Code excerpts

### Stale types fail CI

```json
// package.json (root)
"contracts:generate": "pnpm --filter @coursewright/contracts run generate",
"contracts:check": "pnpm contracts:generate && git diff --exit-code -- contracts/"
```

### The BFF validates request bodies against the contract itself

```ts
// apps/bff/src/contract.ts
export function componentSchemas(contract: OpenApiDocument): JsonSchema[] {
  return Object.entries(contract.components.schemas).map(([name, schema]) => ({
    $id: name,
    ...(toSharedRefs(schema) as JsonSchema),
  }));
}
```

```ts
// apps/bff/src/routes/enrollments.ts
{ schema: { headers: enrollHeadersSchema, body: { $ref: 'EnrollmentRequest#' } } },
```

### Every documented response is exercised

```ts
// apps/bff/test/contract.test.ts
it('covers every response the contract documents', () => {
  const documented = Object.entries(contract.paths).flatMap(([path, operations]) =>
    Object.entries(operations as Record<string, Operation>).flatMap(([method, { responses }]) =>
      Object.keys(responses).map((status) => `${method} ${path} ${status}`),
    ),
  );
  expect([...exercised].sort()).toEqual(documented.sort());
});
```

### A strong ETag from the exact bytes

```ts
// apps/bff/src/routes/courses.ts
const body = JSON.stringify(course);
const etag = `"${sha256(body)}"`;
// `private`: the body is per-user, so shared caches must not keep it.
// `no-cache`: the browser may keep it but must revalidate first, which the ETag makes cheap.
reply.header('etag', etag).header('cache-control', 'private, no-cache');

if (matchesIfNoneMatch(request.headers['if-none-match'], etag)) {
  return reply.code(304).send();
}
```

### Idempotency: replay or 422

```ts
// apps/bff/src/routes/enrollments.ts
const requestHash = sha256(JSON.stringify({ courseId }));
// …
if (saved) {
  if (saved.request_hash !== requestHash) {
    return sendProblem(reply, {
      status: 422,
      type: '/problems/idempotency-key-reused',
      title: 'Idempotency key reused',
      detail:
        'This Idempotency-Key was already used for a different request. Create a new key.',
    });
  }
  return reply
    .code(saved.status_code)
    .header('idempotency-replayed', 'true')
    .type('application/json; charset=utf-8')
    .send(saved.response_body);
}
```

### The expand step of the rename (sketch, not in this repo)

```yaml
# contracts/openapi.yaml, in CourseSummary, Lesson and Course
required: [id, title, summary, level, durationMinutes, duration]
properties:
  durationMinutes: { type: integer, deprecated: true, description: Use `duration`. }
  duration: { type: integer }
```

openapi-typescript 7.13 generates:

```ts
/**
 * @deprecated
 * @description Use `duration`.
 */
durationMinutes: number;
duration: number;
```

```ts
// apps/bff/src/routes/courses.ts, toCourseSummary(), during the expand phase (sketch)
durationMinutes: row.duration_minutes,
duration: row.duration_minutes,
```

## Demo

```bash
# Where the field lives (outside the generated schema.d.ts)
git grep -n "durationMinutes" -- contracts/openapi.yaml apps

# The drift check CI runs first: regenerate the types and fail on any diff
pnpm contracts:check

# The contract test, plus the idempotency and ETag tests
pnpm --filter @coursewright/bff test
```

Break the contract on purpose, then undo it: add `rating: 5,` inside `toCourseSummary()` in `apps/bff/src/routes/courses.ts`, run `pnpm --filter @coursewright/bff test`, and watch the contract test fail on an additional property. The BFF's type-check, `pnpm --filter @coursewright/bff build`, fails too, because `CourseSummary` has no `rating`. Then `git checkout -- apps/bff/src/routes/courses.ts`.

With `pnpm dev` running, replay and misuse an idempotency key against the BFF on :3000:

```bash
TOKEN=$(curl -s -X POST localhost:3000/api/auth/login -H 'content-type: application/json' \
  -d '{"username":"learner.acme","password":"Coursewright2026!"}' \
  | node -pe 'JSON.parse(require("fs").readFileSync(0, "utf8")).accessToken')

enroll() { curl -s -i -X POST localhost:3000/api/enrollments -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -H "idempotency-key: $1" -d "{\"courseId\":\"$2\"}"; }

enroll demo-key-0001 crs-acme-004   # 201
enroll demo-key-0001 crs-acme-004   # 201 again, with idempotency-replayed: true
enroll demo-key-0001 crs-acme-005   # 422, /problems/idempotency-key-reused
enroll demo-key-0002 crs-acme-004   # 409, /problems/already-enrolled

# A 304: send the ETag back
ETAG=$(curl -s -i localhost:3000/api/courses/crs-acme-002 -H "authorization: Bearer $TOKEN" \
  | tr -d '\r' | sed -n 's/^etag: //p')
curl -s -i localhost:3000/api/courses/crs-acme-002 -H "authorization: Bearer $TOKEN" \
  -H "if-none-match: $ETAG" | head -1   # HTTP/1.1 304 Not Modified
```

In the browser (http://localhost:4200, `learner.acme` / `Coursewright2026!`), open a course, go back, and open it again with DevTools → Network: the second `GET /api/courses/…` shows 304, and the app still renders the course. Enroll, and the next load is a 200 with a new ETag, because `enrolled` is in the body.

## Traps to call out

- **Hand-writing a wire type "just this once".** It drifts the day the YAML changes. Alias the generated type.
- **Treating `http.get<T>()` as validation.** It's a cast. The contract test is what checks the wire.
- **Renaming a field in one release.** Open tabs run yesterday's JavaScript. Expand, migrate, wait, contract.
- **403 for another tenant's resource.** It confirms the resource exists. Coursewright returns 404.
- **A new idempotency key per retry.** That defeats the point; one key per intent (lesson 03).
- **A key without a request hash.** A reused key would silently replay the wrong response; Coursewright answers 422.
- **An ETag computed from anything but the bytes sent.** A stale 304 is worse than no cache.
- **Error bodies that echo internals.** Return a problem with a `traceId`; log the details.

## Key terms

contract-first · OpenAPI 3.1 · JSON Schema 2020-12 · openapi-typescript · generated types · `contracts:check` · `additionalProperties: false` · request validation (`addSchema`, `$ref`) · contract test · consumer-driven contract testing (Pact) · `oasdiff` · RFC 9457 problem details · `about:blank` · `traceId` · 400 / 401 / 403 / 404 / 409 / 422 · ETag · `If-None-Match` · 304 Not Modified · `Cache-Control: private, no-cache` · `max-age` · `stale-while-revalidate` · idempotency key · request hash · `Idempotency-Replayed` · expand / migrate / contract · `deprecated: true`

## After the video

1. Write the full pull-request plan for the `durationMinutes` → `duration` rename in Coursewright: every file in each phase, which deploy goes first, and how you'd decide the wait is over.
2. Add a 429 with `Retry-After` to the contract for `POST /enrollments` (on paper): the YAML change, what the contract test would need, and how `enrollment-controller.ts` should treat it.
3. Design showing the `traceId` to users: where it appears in the error alert, how it's copied, and what support does with it.

## References

- [`docs/study-guide.md`](../../study-guide.md), section 6
- [ADR-0002: contract-first REST](../../adr/0002-contract-first-rest.md)
- Lesson 03 (the client side of `Idempotency-Key`, `exhaustMap`, retry with backoff), lesson 08 (the 401 path), lesson 09 (202 and `Location`)
- OpenAPI Specification 3.1; JSON Schema 2020-12
- openapi-typescript documentation
- RFC 9457 (Problem Details for HTTP APIs); RFC 9110 (HTTP Semantics: conditional requests, ETag, status codes); RFC 9111 (HTTP Caching)
- Fastify documentation: validation and serialization, shared schemas (`addSchema`)
- Ajv documentation: JSON Schema draft 2020-12
- oasdiff and Pact documentation
