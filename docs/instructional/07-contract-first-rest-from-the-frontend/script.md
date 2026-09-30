# 07 · Contract-First REST from the Frontend

Welcome. A senior frontend engineer owns the API boundary as much as the backend team does. By the end of this lesson, you should be able to explain how Coursewright keeps the web app and the BFF agreeing on every field and status code, how errors and status codes reach the user, how ETags and idempotency keys work on the server, and how to rename a field without breaking anyone.

## The questions this lesson answers

Here are the questions this lesson prepares you for. The backend team wants to rename `durationMinutes` to `duration`: how do you roll it out with zero downtime? The same `Idempotency-Key` arrives twice, once with the same body and once with a different one: what does the server do, and why store a hash of the request? Where does each status code end up in the UI of a form? What does an ETag save compared with a max-age cache header, and what does each risk? And how would you detect contract drift between two teams' services?

Keep one sentence in your head while you listen. The contract is code: write it first, generate from it, validate against it on both sides, and change it additively.

## Why contract-first

Open `docs/adr/0002-contract-first-rest.md`. Its context is one sentence every frontend engineer has lived: drift between the web app and the BFF shows up as undefined in a template, found by a user.

The decision is that `contracts/openapi.yaml`, an OpenAPI 3.1 document, is the source of truth. It's written by hand and reviewed in pull requests, like code. Types are generated from it, and nobody hand-writes a wire type. Continuous integration fails if the generated types are stale. The BFF validates request bodies against the contract's own schemas, and a contract test validates real responses against it. The same ADR fixes the HTTP semantics the UI relies on: problem details, keyset cursors, ETags, idempotency keys, a 404 across tenants, and 202 for long work.

The ADR is honest about the cost. The YAML is verbose, and writing it first feels slower than writing the handler first. And generated types describe shapes, not behaviour, so idempotency and ETag semantics are enforced only by tests.

## A tour of the contract

Skim `openapi.yaml` from the top. The description states the conventions. Errors are RFC 9457 problem details. Every request may carry a trace header. And the tenant comes from the access token, never from the request, so a resource that belongs to another tenant is a 404, not a 403, so its existence doesn't leak.

Two details in the schemas matter later. Every object lists its required fields, and every object forbids additional properties. That makes the contract strict in both directions: the BFF rejects a request with an unknown field, and the contract test fails if the BFF sends a field the contract doesn't describe. Remember that when we get to the rename.

Error responses are shared definitions: bad request, unauthorized, forbidden, not found, conflict and unprocessable content, each returning the problem schema as `application/problem+json`. And the enrollment endpoint documents its behaviour in prose: one key per intent, a replay returns the original 201 with a replayed header, and the same key with a different body is a 422.

## From YAML to the compiler

Open `contracts/package.json`. Its generate script runs `openapi-typescript` over the YAML and writes `schema.d.ts`. The package exports those types, and it also exports the YAML file itself, so the BFF can load it at runtime.

The root `package.json` has two scripts. `contracts:generate` regenerates the types. `contracts:check` regenerates them and then runs a git diff on the contracts folder, which fails if anything changed. In `.github/workflows/ci.yml`, that's the first check after installing, with the comment: the generated contract types must match `openapi.yaml` exactly. So nobody can edit the YAML and forget the types, or edit the generated file by hand.

On the web side, open `apps/web/src/app/core/api/models.ts`. The comment says wire types come from the generated contract, never from hand-written interfaces, so when the YAML changes, the compiler finds every caller. The file is just aliases, like course summary equals the course summary schema, plus the search parameters taken from the search operation itself.

Then `core/api/coursewright-api.ts`, one injectable service with a typed method for each call the app makes. It builds query parameters for search, uses an HTTP resource for a course, and sets the `Idempotency-Key` header on enroll.

Here's the honest limit. The client is hand-written against generated types. A typed `get` call is a promise to the compiler, not a runtime check, and the paths are plain strings. A generated client would type the paths and parameters too. What makes trusting the types reasonable is the server side.

## Holding the server to the contract

Open `apps/bff/src/contract.ts`. It loads the YAML, and turns each component schema into a standalone JSON Schema, with its name as its ID. The app registers them all, and a route validates its body by referring to a schema by name, like the enrollment request. The comment says why: the BFF can't quietly drift from the YAML. Query strings are the exception. They're small, so the routes write them out.

Then the proof: `apps/bff/test/contract.test.ts`. OpenAPI 3.1 schemas are plain JSON Schema, so the test validates them with a standard validator, unchanged. Each call goes through Fastify's inject, and then three things must hold. The status must be documented for that operation. The content type must be documented for that status. And the body must validate against the documented schema. The last test is the clever one: it collects every method, path and status the other tests exercised, and asserts that the set equals every response the contract documents. Add a status to the YAML without testing it, and the suite fails.

That answers what the contract test catches that TypeScript can't: a missing required field, a wrong enum value, null where a string was promised, an extra field, or a status nobody documented.

## Status codes and problem details in the UI

Now errors. Open `apps/bff/src/problem.ts`. Every error is a problem object: a type, which defaults to about blank, a title, which is then the HTTP status text, the status, a detail, and a `traceId`, which is the request's ID. A schema failure becomes a 400 with the validation message. An unexpected error is logged and becomes a bare 500, and the comment says why: don't echo internals to the client; the trace ID in the body finds this log line.

On the web, `core/problem.ts` turns any error into a sentence. Status zero means the server wasn't reached, so it says to check the connection. A problem body gives its detail, or its title. Anything else gets a generic "something went wrong". Every feature calls it, so error wording has one owner.

So where does each status end up? That's the third question. A 400 should be rare, because the form validates first; if it happens, its detail goes in the form's one alert. A 401 on a normal call is handled by the auth interceptor, which refreshes once and retries once; that's lesson eight. On the sign-in form itself, a 401 becomes "Username or password is incorrect." A 403 means the UI offered something the server refused; show the message, but the fix is not to offer it. A 404 isn't an alert at all: the course page's heading becomes "Course not found", with a sentence that explains. A 409 on enroll means already enrolled, perhaps from another tab, and the controller treats it as success, because the user got what they wanted. A 422 is a bug signal. And on enroll, a network failure or a server error is retried with backoff, as lesson three showed, before a message appears. Coursewright doesn't show the trace ID yet. Production would, as a reference users can quote to support.

## ETag and 304

Open `apps/bff/src/routes/courses.ts` and find the course detail handler. It serializes the course, hashes the exact bytes it will send, and uses the hash as a strong ETag. The comment says the ETag changes whenever the body does, including the enrolled flag. The cache header is private, because the body is per user, and no-cache, which means the browser may keep it but must revalidate first. When the request's If-None-Match header matches, the handler answers 304 with no body.

The web app has no code for this. The browser's HTTP cache stores the response, sends If-None-Match next time, and turns a 304 into the cached 200 the app sees. The matching follows the HTTP rules: weak comparison, so a weak-prefixed tag still matches, a list of tags, or a star. The tests check a plain tag, a weak one and a list, and that enrolling changes the ETag.

That's the fourth question. An ETag saves the transfer, but not the round trip, and the comment is explicit: not the query either. In exchange, it's never stale. A max-age header saves the request entirely, for as long as the max-age says, but the user may see stale data, like an Enroll button after they've enrolled, and you can't recall it. Use it where a little staleness is harmless, and combine it with an ETag for revalidation.

## Idempotency on the server

Lesson three covered the client side: one key per intent, reused on retries. Here's the server, in `apps/bff/src/routes/enrollments.ts`.

The header is required, eight to a hundred characters, or it's a 400. The handler hashes the validated fields in a fixed order, so whitespace or key order in the raw body can't make one request look like two. Then it looks up the user and the key. If a saved row exists with a different hash, it's a 422, because the key was reused for a different request. With the same hash, it replays the saved status and body, with a replayed header set to true. Otherwise it checks the course is in the caller's tenant, returns 409 if they're already enrolled, and then saves the enrollment and its replayable response in one transaction, so they're saved together or not at all.

The comment covers concurrency honestly. Node's built-in SQLite driver is synchronous, so two requests can't interleave in one process. With several instances, you'd insert the key row first, marked in progress, and let its primary key reject the duplicate. The key table also has a created-at column, so a sweeper could expire keys after a day, as payment APIs do. That sweeper isn't written yet.

That's the second question. Without the hash, the server could only trust the key. A client bug that reused a key for a different course would get the first course's 201 back, and the user would believe they'd enrolled in something they hadn't. The hash turns that silent wrong answer into a loud 422. And the unique constraint on user and course stays as the last line of defence for separate intents.

## Renaming a field with zero downtime

Now the core question. The backend team wants to rename `durationMinutes` to `duration`. In this repo, the field lives in three schemas, two mapping lines in the BFF, three reads in two templates, and a couple of tests. The answer is expand, migrate, contract.

Expand first. Add `duration` to the three schemas that have `durationMinutes`, and mark the old field deprecated. `openapi-typescript` turns that into a deprecated tag in the generated types, so editors strike through every old use. The BFF sends both fields with the same value. Because the schemas forbid unknown properties, the contract has to change before the BFF does, and the contract test enforces that order. Deploy the BFF. Nothing breaks, because old clients read the old field.

Migrate next. Move the web app to `duration`. The repo's Angular 22 compiler type-checks templates strictly by default, so the build finds the template reads as well as the code. Deploy.

Then wait, and this is where frontend knowledge matters. A user with an open tab runs yesterday's JavaScript for hours or days, and other consumers take longer. Base the window on data, like session lengths or a client version header.

Contract last. Remove `durationMinutes` from the YAML and regenerate. The compiler and the contract test find anything left, and the BFF stops sending it. For a request field, reverse the order: the server accepts both names first, because a strict schema would reject the new one with a 400.

Two cautions. If the unit changes, say from minutes to an ISO duration string, that's a new field, not a rename. And if the rename happens in a platform service behind the BFF, the BFF can absorb it in its mapping, and the web contract doesn't change at all.

What production would add: an `oasdiff` breaking-change check against the main branch, which the ADR names, and consumer-driven contract tests with a tool like Pact between teams.

## Traps

Here are the traps to call out.

Hand-writing a wire type just this once. It drifts the day someone changes the YAML.

Treating a typed `get` as validation. It's a cast, not a check.

Renaming a field in one release. Open tabs break.

Returning 403 for another tenant's resource, which confirms that it exists.

A new idempotency key per retry, which defeats the point. Or a key without a request hash, so a reused key silently returns the wrong response.

An ETag computed from anything but the bytes you send.

And error bodies that echo internals instead of a trace ID.

## Interview drill

Let's practise. After each question there's a short pause. Pause the audio if you want more time, answer out loud, and then compare your answer with the model answer.

**Interviewer:** The backend team wants to rename `durationMinutes` to `duration`. How do you roll it out with zero downtime?

[pause 5s]

Expand, migrate, contract. Add `duration` to the contract next to the old field, marked deprecated, and have the BFF send both; with strict schemas the contract changes first, and the contract test enforces it. Deploy. Move the web app to the new field; the generated types and template type-checking find every use. Deploy. Then wait until old tabs and other consumers are gone, based on data, and only then remove the old field. For request fields, the server accepts both first. If the unit changes, it's a new field.

**Interviewer:** The same `Idempotency-Key` arrives twice: once with the same body, once with a different one. What does the server do, and why store a hash of the request?

[pause 5s]

Coursewright stores each key per user, with a hash of the validated fields and the response it produced. The same key and hash is a retry, so the server replays the stored 201 and body, with an idempotency replayed header, and enrolls nothing. The same key with a different hash is a client bug, so it answers 422, key reused, instead of silently replaying the wrong result. The enrollment and its saved response commit in one transaction. With several instances, I'd insert the key row first, marked in progress, and answer 409 to a concurrent duplicate.

**Interviewer:** Where does each status code end up in the UI of a form?

[pause 5s]

Validate on the client first, so a 400 is rare; if it happens, its problem detail goes in the form's single alert. A 401 is the interceptor's job: refresh once, retry once, then sign-in; on the sign-in form it's a wrong-password message. A 403 shows the message, but the UI shouldn't have offered the action. A 404 changes the page, not an alert. A 409 might be success, like already enrolled. A 422 is a bug to log. Network and server errors retry with backoff. And show the trace ID for support.

**Interviewer:** What does an ETag save compared with a max-age cache header, and what does each risk?

[pause 5s]

An ETag with no-cache means the browser always asks, but a match returns a 304 with no body, so it saves the bytes, not the round trip or the server's query, and it's never stale. Max-age skips the request entirely for its lifetime, which is faster, but it can show stale data, like an enrolled flag, and you can't recall it. Per-user responses must be private either way. I'd use ETags for per-user state and a short max-age for shared, slow-changing data.

**Interviewer:** How would you detect contract drift between two teams' services?

[pause 5s]

Inside one repo, Coursewright does it with one hand-written OpenAPI file, generated types that CI checks for staleness, request validation against the contract's schemas, and a contract test that validates every real response and fails if any documented response isn't exercised. Between teams, add consumer-driven contract tests like Pact, which the provider verifies in its own pipeline, and an `oasdiff` breaking-change check on the provider's spec. In production, validate a sample of real responses against the schema and alert on violations.

## Recap

Five things to remember from this lesson.

One: the contract comes first. `openapi.yaml` is hand-written and reviewed, `schema.d.ts` is generated from it, and continuous integration fails if they differ.

Two: hold both sides to it. The web imports only generated types, the BFF validates bodies against the contract's schemas, and the contract test checks every documented response, both ways.

Three: status codes are UI decisions. Problem details give one error shape with a trace ID, a 404 changes the page, a 409 can be success, and 401 belongs to the interceptor.

Four: ETags save bytes and are never stale; max-age saves requests and can be. Idempotency lives on the server: a key, a request hash, a replay, and a 422 for misuse.

Five: rename with expand, migrate, contract, and wait for old tabs before removing anything.

In the next lesson, we'll look at browser auth, tokens and refresh: where the access token lives, how the refresh cookie rotates, and why the interceptor refreshes once and retries once.
