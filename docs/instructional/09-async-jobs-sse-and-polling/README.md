# 09 · Async Jobs, SSE and Polling

> **Runtime:** ~21 min · **Level:** Senior · **Study guide:** [§8 Asynchronous workflows and event-driven systems](../../study-guide.md#8-asynchronous-workflows-and-event-driven-systems) · **Prerequisites:** [03](../03-rxjs-races-and-idempotent-submits/), [07](../07-contract-first-rest-from-the-frontend/), [08](../08-browser-auth-tokens-and-refresh/)

**Video:** [09-async-jobs-sse-and-polling.mp4](09-async-jobs-sse-and-polling.mp4) · [Slides](slides.html) · **Audio lesson:** [09-async-jobs-sse-and-polling.mp3](09-async-jobs-sse-and-polling.mp3) · [Transcript](script.md)

## Why this video exists

"Design a bulk import" is the system-design question a frontend interview is most likely to ask, because it crosses every layer: the upload, the API shape, the queue, progress in the browser, and failure halfway through. A weak answer holds a request open and shows a spinner. A strong answer accepts with a 202, works in the background, pushes progress with a pull fallback, and makes every step safe to repeat. This video builds that answer from Coursewright's report export:
- ADR-0005: `202 Accepted` + `Location`, SSE snapshots, polling with backoff, a separate result download;
- a `JobQueue` seam with exponential-backoff retries and a dead-letter list, and a worker that starts each attempt from scratch;
- SSE read with `fetch` (so it can carry a bearer token), a pure `parseSse` that handles split chunks, and `catchError` into polling;
- the production mapping: the outbox pattern, SNS/SQS with a redrive policy, idempotent consumers;
- then the 5,000-learner bulk enrolment, designed from those parts.

## Learning objectives

By the end, the viewer can:

- Explain why long work becomes a job, and what `202 Accepted` + `Location` promise, using ADR-0005's four-step protocol.
- Walk through `InMemoryJobQueue` (backoff, `maxAttempts`, `deadLetters`) and the report worker's three habits.
- Explain why the SSE endpoint sends full snapshots, heartbeats and anti-buffering headers, and how the job store's `sequence` becomes the event id.
- Explain why `job-progress.ts` reads SSE with `fetch` instead of `EventSource`, what that costs, and how `parseSse` handles chunks that end mid-line.
- Describe the polling fallback (1 s, 2 s, 4 s, then 8 s), how the spec tests it with fake timers, and what happens when the stream drops at 60%.
- Explain the dual-write problem, the outbox pattern and idempotent consumers.
- Design a 5,000-learner CSV bulk enrolment end to end: UI, API, queue, progress and failure.

## Interview questions this prepares you for

| Question | What a strong answer includes |
|---|---|
| Design bulk-enrolling 5,000 learners from a CSV upload, end to end. | **UI:** check file size and header row in the browser; upload to storage with a presigned URL (not through the BFF); POST an import with an `Idempotency-Key` (one per intent, lesson 03). **API:** manager role, tenant from the token, job row + outbox row in one transaction, `202` + `Location`. **Work:** validate every row, enrol in batches of a few hundred, each in a transaction; the `UNIQUE (user_id, course_id)` constraint Coursewright already has makes a redelivered batch harmless. **Failure:** bad rows go into a downloadable error report instead of failing the job; transient failures retry with backoff; poison messages dead-letter and mark the job failed. **Progress:** counts (processed, enrolled, skipped, failed) over SSE with a polling fallback; announce milestones, not every percent; a recent-imports list so the manager can leave and come back. |
| The SSE connection drops at 60%. What does the user see, and what does the code do? | Almost nothing. The server's `response.on('close')` unsubscribes and clears the heartbeat; the job keeps running because it lives in the queue, not the connection. In `job-progress.ts` the reader rejects (or ends early, which throws "closed before the job finished"), and `watchJob`'s `catchError` switches to `poll()`, which goes through HttpClient, so an expired token is refreshed by the interceptor. The first poll is immediate and returns the current snapshot, so the bar jumps forward; then `repeat` waits 1 s, 2 s, 4 s, 8 s… until `takeWhile` sees a terminal status. Snapshots mean nothing needs replaying. The honest gap: a polling error reaches the page as an alert with no retry, and there's no way to reattach after navigating away. |
| Why is "publish to the queue, then commit to the database" wrong? What's the fix? | No transaction spans a queue and a database. Publish then a failed commit: a consumer works on a job that doesn't exist. Commit then a crash before publishing: saved but never published. The outbox pattern (ADR-0005's production mapping): write the job row and an outbox row in one database transaction; a relay publishes from the outbox (to SNS → SQS with a redrive policy to a DLQ) and marks rows sent. The relay can publish twice, and SQS standard queues deliver at least once, so consumers must be idempotent. In Coursewright the job store and the queue share one process's memory, so the problem doesn't arise yet. |
| How do you make a consumer idempotent? | Assume every message arrives more than once. Record processed message ids in the same transaction as the effect, and skip ids you've seen. Better, make the effect idempotent by design: unique constraints (`UNIQUE (user_id, course_id)`), upserts (`ON CONFLICT DO NOTHING`), and state transitions that only move forward. Put side effects such as emails behind the same check. Coursewright's report worker is naturally idempotent: every attempt resets progress and overwrites the result. |
| When would you pick polling over SSE, even with SSE available? | Rare updates or jobs that take minutes, where a held connection buys nothing. Many watchers, because each stream is a connection, and over HTTP/1.1 a browser allows six per origin (ADR-0005; HTTP/2 removes the limit). Proxies or corporate networks that buffer or cut long responses, and serverless backends that can't hold connections. Polling is simpler, cacheable and scales like any GET. Coursewright uses SSE first and falls back to polling with capped exponential backoff. |
| Why SSE rather than WebSockets, and why read it with `fetch` instead of `EventSource`? | Progress is one-way; SSE is plain HTTP, so it proxies, authenticates and traces like any request, and event ids support resuming. WebSockets would be overkill. `EventSource` can't send an `Authorization` header (as of September 2026), and putting the token in the query string leaks it into logs and history. So `job-progress.ts` uses `fetch`, which bypasses HttpClient's interceptors: it adds `Authorization` and `traceparent` itself. The cost is losing `EventSource`'s automatic reconnect and `Last-Event-ID`, which Coursewright can afford because events are full snapshots and there's a polling fallback. |
| What do `202 Accepted` and `Location` promise, and why not `201`? | `201 Created` says the resource exists. The report doesn't exist yet: the job is a receipt (the comment in `routes/reports.ts`), and `Location: /api/jobs/{id}` says where to follow it. The response body is the queued `Job` (status `queued`, progress 0, attempt 0, `maxAttempts` 3), which the page shows at once via `startWith(job)`. The result is a separate `GET /api/jobs/{id}/result`, which answers `409` (`/problems/job-not-completed`) until the job completes. |
| How do retries, backoff and a dead-letter queue fit together? | A failing handler throws; the queue redelivers after `retryBaseMs * 2 ** (attempt - 1)` (500 ms, then 1 s), up to `maxAttempts` (3). After the last failure, the message goes to `deadLetters` "for a human to inspect, instead of retrying forever", and the worker marks the job `failed` with "Gave up after 3 attempts". Each attempt starts from scratch. Backoff stops a struggling dependency from being hammered; the DLQ stops a poison message from blocking the queue. In production: SQS visibility timeout for redelivery, `ApproximateReceiveCount`, and a redrive policy. The BFF tests cover both paths. |

## Coursewright code on screen

| File | What to show |
|---|---|
| `docs/adr/0005-async-jobs.md` | The context (60-second proxy timeout, navigation); the four-step protocol; "Why SSE through `fetch`"; the negatives; the production mapping (outbox, SNS/SQS, DLQ, idempotent consumers) |
| `apps/bff/src/routes/reports.ts` | The `202, not 201` comment; `Location`; the SSE handler: `hijack`, headers (`x-accel-buffering`), the snapshot and heartbeat comments, `close`; the `409` result |
| `apps/bff/src/jobs/queue.ts` | `Delivery.attempt` (like `ApproximateReceiveCount`); the `JobQueue` seam; `#deliver` with backoff and `deadLetters` |
| `apps/bff/src/jobs/report-worker.ts` | "Every attempt starts from scratch"; `failAttempts` failing at step 3 of 5; "the queue decides"; "Save the file before announcing it" |
| `apps/bff/src/jobs/job-store.ts`, `csv.ts` | Snapshots replaced, never mutated; `sequence` as the SSE id; owner-only `get`; RFC 4180 quoting |
| `apps/web/src/app/features/reports/job-progress.ts` | `watchJob` = stream + `catchError` → poll; `fetch` with `Authorization` and `traceparent`; the reader loop and `TextDecoder` `stream: true`; `pollDelay`, `repeat`, `takeWhile` |
| `apps/web/src/app/features/reports/sse.ts` | `parseSse` returning `{ messages, rest }`; comments and keep-alives ignored |
| `apps/web/src/app/features/reports/job-progress.spec.ts` | The split-chunk parser test; the stream test (traceparent format); the fake-timer polling test; `pollDelay` values |
| `apps/web/src/app/features/reports/reports-page.ts`, `.html` | `exportReport` (busy guard, `switchMap` + `startWith`, `takeUntilDestroyed`); `statusText`; `role="status"`; the blob download |
| `apps/web/src/app/design-system/progress/progress.ts` | A native `<progress>` with a visible label |
| `apps/bff/test/reports.test.ts` | 202 + Location; retry then CSV (tenant-scoped); dead-letter + 409; 404 for others' jobs; the real SSE stream test |
| `apps/web/e2e/reports.spec.ts` | One simulated failure → "attempt 2 of 3" → "Completed" → a `.csv` download |

## Run sheet

| Time | Segment | Content |
|---|---|---|
| 00:00–01:30 | Hook | Long work crosses every layer. The five questions. The thesis: accept fast, work in the background, push with pull as the fallback, make every step safe to repeat. |
| 01:30–02:20 | Why a job | ADR-0005's context. The four-step protocol as a sequence diagram. |
| 02:20–03:05 | Accept fast | The POST handler: role, validation, `jobs.create`, `publish`, 202 + `Location`. The test. |
| 03:05–05:00 | Queue and worker | The `JobQueue` seam; backoff and `deadLetters`; the worker's three habits; the simulated-failures knob as a diagram. |
| 05:00–06:35 | SSE endpoint | Snapshots and `sequence`; `hijack` and the headers; the snapshot and heartbeat comments; the real-stream test. |
| 06:35–08:10 | SSE over fetch | SSE vs WebSocket vs polling. Why not `EventSource`; the token and trace by hand; the reader loop; `parseSse` and its split-chunk test; what `fetch` costs. |
| 08:10–09:50 | Polling fallback | `catchError` into `poll()`; `pollDelay`; the fake-timer spec; the drop at 60% (diagram); the honest gaps. **Demo** the fallback by blocking the events URL (below). |
| 09:50–10:50 | Reports page | `exportReport`, `startWith`, `statusText`, the progress element and status role, the blob download, the E2E. |
| 10:50–12:10 | Outbox | One process here, two systems in production. The dual write fails both ways. The outbox diagram. An idempotent consumer (sketch). |
| 12:10–13:00 | Costs | In-memory jobs, one instance, a connection per tab. What production would add. |
| 13:00–14:30 | Bulk enrolment | The end-to-end diagram; the request path; the work path; progress as counts (sketch). |
| 14:30–15:25 | Traps | The eight traps below. |
| 15:25–20:45 | Drill and recap | Five questions, then the five points. |

## Code excerpts

### Accept fast

```ts
// apps/bff/src/routes/reports.ts (excerpt)
// 202, not 201: the report doesn't exist yet. The job is a receipt, and Location says where to
// follow it.
app.post<{ Body: ReportRequest }>(
  '/reports',
  { onRequest: requireRole('manager'), schema: { body: { $ref: 'ReportRequest#' } } },
  async (request, reply) => {
    const { id: userId, tenantId } = request.user;
    const job = jobs.create(userId, maxAttempts);
    await queue.publish({
      jobId: job.id,
      tenantId,
      failAttempts: request.body.failAttempts ?? 0,
    });
    return reply.code(202).header('location', `/api/jobs/${job.id}`).send(job);
  },
);
```

### Backoff and the dead-letter list

```ts
// apps/bff/src/jobs/queue.ts (InMemoryJobQueue)
async #deliver(message: T, attempt: number): Promise<void> {
  try {
    if (!this.#handler) throw new Error('The queue has no subscriber.');
    await this.#handler({ message, attempt });
  } catch {
    if (attempt >= this.#maxAttempts) {
      this.deadLetters.push(message);
    } else {
      this.#schedule(message, attempt + 1, this.#retryBaseMs * 2 ** (attempt - 1));
    }
  }
}
```

### Snapshots and a heartbeat

```ts
// apps/bff/src/routes/reports.ts (excerpt)
// Every event is a full snapshot, so a client that reconnects needs no replay: the first
// event brings it up to date, and Last-Event-ID can be ignored.
const send = (job: Job, sequence: number) => {
  response.write(`id: ${sequence}\nevent: job\ndata: ${JSON.stringify(job)}\n\n`);
  if (job.status === 'completed' || job.status === 'failed') close();
};
// A comment line keeps idle proxies and load balancers from timing the connection out.
const heartbeat = setInterval(() => response.write(': heartbeat\n\n'), HEARTBEAT_MS);
```

### Push, with pull as the fallback

```ts
// apps/web/src/app/features/reports/job-progress.ts (excerpt)
/** 1 s, 2 s, 4 s, then every 8 s. */
export const pollDelay = (poll: number) => Math.min(1000 * 2 ** (poll - 1), 8000);

watchJob(jobId: string): Observable<Job> {
  // Any stream failure (a network drop, a 401 from an expired token, a stream cut off
  // early) falls back to polling. Polling goes through HttpClient, so it gets the
  // interceptors' token refresh and tracing back.
  return this.stream(jobId).pipe(catchError(() => this.poll(jobId)));
}

private poll(jobId: string): Observable<Job> {
  // Each repeat resubscribes to the cold HttpClient observable, which sends a new request.
  return this.api.getJob(jobId).pipe(
    repeat({ delay: (poll) => timer(pollDelay(poll)) }),
    takeWhile((job) => !isTerminal(job), true),
  );
}
```

### A parser that survives split chunks

```ts
// apps/web/src/app/features/reports/sse.ts
/**
 * Parses as much of a text/event-stream buffer as is complete. Network chunks can end anywhere,
 * even mid-line, so whatever follows the last blank line comes back as `rest`, and the caller
 * prepends it to the next chunk. Pure, so it can be tested without a network.
 */
export function parseSse(buffer: string): { messages: SseMessage[]; rest: string } {
  const blocks = buffer.split(/\r?\n\r?\n/);
  const rest = blocks.pop() ?? '';
  // …
}
```

### An outbox relay (sketch, not in this repo)

```ts
// Runs on a timer. The outbox row was written in the same transaction as the job row,
// so the event can't be lost, or published for a job that was never saved.
const rows = await db.query('SELECT * FROM outbox WHERE sent_at IS NULL ORDER BY id LIMIT 100');
for (const row of rows) {
  await sns.send(
    new PublishCommand({
      TopicArn: topic,
      Message: row.payload,
      MessageAttributes: { traceparent: { DataType: 'String', StringValue: row.traceparent } },
    }),
  );
  // A crash between the publish and this update means a duplicate, never a loss.
  await db.query('UPDATE outbox SET sent_at = now() WHERE id = ?', [row.id]);
}
```

### An idempotent consumer (sketch, not in this repo)

```ts
await db.transaction(async (tx) => {
  const seen = await tx.query('SELECT 1 FROM processed_messages WHERE id = ?', [msg.id]);
  if (seen.length > 0) return; // a redelivery: already done
  await tx.query(
    `INSERT INTO enrollments (user_id, course_id, enrolled_at) VALUES (?, ?, ?)
     ON CONFLICT (user_id, course_id) DO NOTHING`,
    [userId, courseId, now],
  );
  await tx.query('INSERT INTO processed_messages (id) VALUES (?)', [msg.id]);
});
```

## Demo

```bash
# The protocol, as the BFF states it
git grep -n "202\|location\|hijack\|heartbeat" -- apps/bff/src/routes/reports.ts
pnpm --filter @coursewright/bff test reports
#   Test Files  1 passed (1)
#        Tests  6 passed (6)

# parseSse, the stream, and the fake-timer polling fallback
pnpm --filter @coursewright/web test --include src/app/features/reports/job-progress.spec.ts
#   Test Files  1 passed (1)
#        Tests  6 passed (6)
```

In the browser, run `pnpm dev`, open http://localhost:4200 and sign in as `manager.acme` (`Coursewright2026!`), then open Reports with DevTools' Network tab open:

1. **Export with "Simulated failures" set to 1** (the README's tour, step 4). `POST /api/reports` answers `202` with a `location` header. The `…/events` request stays open until the job finishes, with `content-type: text/event-stream` and `x-accel-buffering: no`. The status line reads "Queued", then "Running — attempt 1 of 3", then "attempt 2 of 3", then "Completed".
2. **Force the fallback.** Right-click the `…/events` request → **Block request URL**, then export again. The stream fails at once, and `GET /api/jobs/job-…` requests appear, spaced 1 s, 2 s, 4 s apart, until the job completes. The user sees no error.
3. **Run out of retries.** Unblock the URL, set "Simulated failures" to 3 and export. The status ends with "Failed: Gave up after 3 attempts. Attempt 3 failed on purpose (failAttempts: 3)."
4. **Download.** After a completed export, "Download report" fetches the CSV as a blob through HttpClient (with the bearer token) and saves `completions-job-….csv`.

## Traps to call out

- **Holding a request open for the whole job.** A 60-second proxy timeout or a navigation loses the work.
- **`201` for work that hasn't happened.** It's `202` with a `Location` to follow.
- **The token in the query string** so `EventSource` can connect. URLs end up in logs, history and analytics.
- **Forgetting that `fetch` skips the interceptors.** The stream goes out with no token and no trace unless you add them.
- **Assuming a network chunk is a whole message.** Chunks end mid-line; keep the `rest` and prepend it.
- **Deltas instead of snapshots.** One missed event corrupts the screen, and a reconnect needs a replay.
- **Retrying forever.** Back off, cap the attempts, dead-letter what's left.
- **Publishing before committing, to consumers that aren't idempotent.** Use an outbox, and assume at-least-once delivery.

## Key terms

`202 Accepted` · `Location` · job / receipt · `JobQueue` seam · exponential backoff · `maxAttempts` · dead-letter queue (DLQ) · redrive policy · visibility timeout · `ApproximateReceiveCount` · at-least-once delivery · idempotent consumer · dual write · transactional outbox · relay · server-sent events (SSE) · `text/event-stream` · event id / `Last-Event-ID` · heartbeat comment · `x-accel-buffering` · `EventSource` vs `fetch` + `ReadableStream` · `TextDecoder` (`stream: true`) · `parseSse` · `catchError` fallback · `repeat({ delay })` · `takeWhile(…, true)` · snapshot vs delta · presigned URL

## After the video

1. Add a retry with backoff to the polling path in `job-progress.ts`, so one failed poll doesn't end the watch, and write the fake-timer spec for it first.
2. Draft the OpenAPI for the bulk import: `POST /api/enrollment-imports` (`202` + `Location`), an import `Job` with counts, and `GET …/errors` for the error report. What does `Idempotency-Key` protect here that the unique constraint doesn't?
3. Design "reattach": a `?job=` query parameter or a recent-exports endpoint, so a manager who navigated away can pick the job up again. Which lesson-04 routing pieces would you use?

## References

- [`docs/study-guide.md`](../../study-guide.md), section 8
- [ADR-0005: long-running work as jobs](../../adr/0005-async-jobs.md)
- WHATWG HTML Living Standard: Server-sent events; MDN: Using server-sent events, `EventSource`, Streams API (`ReadableStream`), `TextDecoder`
- RFC 9110: `202 Accepted` and `Location`; RFC 4180: CSV
- RxJS documentation: `catchError`, `repeat` (with `delay`), `takeWhile`
- AWS documentation: Amazon SQS dead-letter queues, visibility timeout, and redrive policy; Amazon SNS fan-out to SQS
- The transactional outbox and idempotent consumer patterns (microservices.io, Chris Richardson)
