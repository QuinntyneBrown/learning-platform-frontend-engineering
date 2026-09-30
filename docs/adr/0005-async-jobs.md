# ADR-0005: Long-running work as jobs: 202, server-sent events, polling fallback

- **Status:** Accepted
- **Date:** 2026-09-30
- **Deciders:** Coursewright web team

## Context

Some work takes longer than a request should stay open, such as exporting a completions report across a tenant. A proxy timeout at 60 seconds, or a user who navigates away, must not lose the work or start it twice. The user still wants live progress, and to be told when a retry happens.

## Decision

**Protocol**

1. `POST /api/reports` validates the request, publishes a message, and returns **`202 Accepted`** at once, with the `Job` and `Location: /api/jobs/{id}`.
2. The client follows progress on **`GET /api/jobs/{id}/events`**, a server-sent event stream of `Job` snapshots. The first message is the current state, and the server closes the stream after `completed` or `failed`.
3. If the stream fails, the client falls back to **polling `GET /api/jobs/{id}`**, with backoff of 1 s, 2 s, 4 s, capped at 8 s.
4. The result is **`GET /api/jobs/{id}/result`** (CSV).

**Why SSE through `fetch`.** SSE is one-way, runs over plain HTTP and is simple to proxy, which is all progress needs; WebSockets would be overkill. The browser's `EventSource` can't send an `Authorization` header, so the web app reads the stream with `fetch` (`apps/web/src/app/features/reports/job-progress.ts`) and a small pure parser (`sse.ts` next to it). Because `fetch` bypasses the HttpClient interceptors, it adds the bearer token and `traceparent` itself.

**Worker and queue.** `apps/bff/src/jobs/queue.ts` defines a `JobQueue` interface (`publish` / `subscribe`) with an in-memory implementation:
- A failing handler is retried with exponential backoff, up to 3 attempts.
- After the last attempt, the message moves to a dead-letter list and the job is marked `failed`.
- `failAttempts` on the request is a learning knob that makes those paths visible in the UI.

## Consequences

**Positive**

- The request path stays fast, and the work survives a closed tab.
- Progress is live when the network allows it, and still correct when it doesn't.
- Retry and dead-letter behaviour is explicit and tested.

**Negative**

- Jobs live in one process's memory. A restart loses them, and two BFF instances wouldn't share them.
- An SSE connection per watching tab. Behind HTTP/1.1, the browser's limit of six connections per origin is a real constraint (HTTP/2 removes it).

**Production mapping.** The `JobQueue` interface is the seam:
- The platform service writes the job row and an **outbox** row in one database transaction.
- A relay publishes to **SNS**, which fans out to an **SQS** queue with a redrive policy to a **dead-letter queue**. The visibility timeout replaces the in-memory redelivery.
- Consumers are idempotent, because SQS delivers at least once.
- The BFF consumes job events and fans them out to SSE subscribers. The event envelope carries `traceparent`, so one trace spans browser → BFF → queue → worker.
