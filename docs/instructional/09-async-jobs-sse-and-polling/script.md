# 09 · Async Jobs, SSE and Polling

Welcome. Sooner or later, every product has work that takes longer than a request should: an export, an import, a bulk update across a whole tenant. Interviewers use it to see whether you can design across the stack: the API shape, the queue, progress in the browser, and what happens when something fails halfway. By the end of this lesson, you should be able to explain why Coursewright answers a report request with a 202, how its queue retries and dead-letters, how the browser streams progress over server-sent events with a polling fallback, and how you'd design a bulk enrolment of five thousand learners, end to end.

## The questions this lesson answers

Here are the questions this lesson prepares you for. Design bulk-enrolling five thousand learners from a CSV upload, end to end. The SSE connection drops at sixty percent: what does the user see, and what does the code do? Why is "publish to the queue, then commit to the database" wrong, and what's the fix? How do you make a consumer idempotent? And when would you pick polling over SSE, even with SSE available?

Keep one sentence in your head while you listen. Accept fast, work in the background, push progress with polling as the fallback, and make every step safe to repeat.

## Why a job, not a long request

Open `docs/adr/0005-async-jobs.md`. The context is one paragraph. Exporting a completions report across a tenant can take longer than a request should stay open. A proxy timeout at sixty seconds, or a user who navigates away, must not lose the work or start it twice. And the user still wants live progress, including being told when a retry happens.

The decision is a four-step protocol. A POST to slash api slash reports returns 202 Accepted at once, with the job and a `Location` header. The client follows progress on an events endpoint, a server-sent event stream of job snapshots. If the stream fails, the client falls back to polling the job, with backoff. And the result is a separate download.

## Accept fast: 202 and Location

Open `apps/bff/src/routes/reports.ts`. The POST handler is short. The manager role check from lesson eight runs first, then the body is validated against the contract. The handler creates a job in the job store, publishes a message to the queue, and replies. The comment explains the status code: 202, not 201, because the report doesn't exist yet. The job is a receipt, and `Location` says where to follow it.

The integration test named "accepts the request with 202, a Location header and a queued job" pins that down: the location points at the job, the status is queued, progress is zero, and three attempts are allowed.

## The queue and the worker

Now the part that does the work. Open `apps/bff/src/jobs/queue.ts`. The `JobQueue` interface has two methods, publish and subscribe, and its comment calls it the seam between accepting the work and doing the work. Swap the in-memory queue for SQS, or for an outbox table and a relay, and the routes and the worker don't change.

The in-memory queue delivers each message asynchronously. If the handler throws, it redelivers after an exponential backoff: half a second, then a second, doubling each time. After three failed attempts, the message moves to a dead-letter list for a human to inspect, instead of retrying forever. Each delivery carries its attempt number, which the comment compares to SQS's approximate receive count.

The worker, in `report-worker.ts`, has three habits worth copying. Every attempt starts from scratch, with progress back at zero, so a retry never resumes from half-finished state. On the last failed attempt, it marks the job failed with a readable reason, then rethrows, because the queue decides between a retry and the dead-letter list. And it saves the CSV before announcing "completed", so a client that reacts to "completed" can download at once.

The request's simulated failures field is a teaching knob. Set it to one, and the first attempt fails at the third of five steps, then the retry succeeds. The test "retries a failed attempt after a backoff, then completes with a CSV" asserts attempt two, a hundred percent, nothing dead-lettered, and a CSV with no rows from the other tenant. Set it to three, and the dead-letter test sees the job fail, the message dead-lettered, and a 409 problem for the download.

## Snapshots and the SSE endpoint

Open `jobs/job-store.ts`. Each entry holds the latest snapshot of a job, and snapshots are replaced, never mutated. A sequence number goes up on every change, and it becomes the SSE event ID. A job is visible only to the user who created it. Anyone else gets a 404, for the same reason as another tenant's course in lesson eight.

Back in the reports route, the events endpoint takes over the raw response, because Fastify's reply pipeline is built for one body, not a stream. It writes the event-stream content type, turns caching off, and asks proxies not to buffer the stream. Then it sends the current snapshot, and another one on every change.

Two comments in that handler carry the design. First: every event is a full snapshot, so a client that reconnects needs no replay. The first event brings it up to date, and Last-Event-ID can be ignored. Second: a comment line every fifteen seconds keeps idle proxies and load balancers from timing the connection out. The server closes the stream after "completed" or "failed", and cleans up if the client goes away. The test "streams job snapshots over SSE and closes after the last one" reads a real stream, and checks that the IDs only go up, that the job was seen running part way, and that the last event is "completed".

## SSE over fetch

Why SSE and not WebSockets? The ADR's answer: progress is one-way, SSE runs over plain HTTP, and it's simple to proxy. A WebSocket would be overkill.

The obvious client is the browser's `EventSource`, and Coursewright can't use it. As of September 2026, `EventSource` still can't send an Authorization header, and the BFF wants a bearer token. So `features/reports/job-progress.ts` reads the stream with `fetch`. The comment spells out the consequence: `fetch` bypasses HttpClient and its interceptors, so the code adds the token and the trace header by hand.

Then it reads the body chunk by chunk. A text decoder in streaming mode keeps a multi-byte character intact when it spans two chunks. Each chunk goes to `parseSse`, a pure function in the file next to it. Network chunks can end anywhere, even mid-line, so the parser returns the complete messages plus the rest, which the caller prepends to the next chunk. The spec named "keeps a message split mid-line until the rest arrives" feeds it half a data line, and proves that nothing is emitted until the rest turns up.

When a snapshot is terminal, the observable completes. If the stream ends before that, it errors. And unsubscribing aborts the fetch. What does `fetch` cost you? `EventSource` reconnects by itself and sends the last event ID. Coursewright gives that up, and can afford to, because every event is a full snapshot and there's a fallback.

## The fallback: polling with backoff

That fallback is one line: the watch method takes the stream and pipes it through `catchError` into polling. The comment lists what counts as failure: a network drop, a 401 from an expired token, or a stream cut off early. Polling goes through HttpClient, so it gets the interceptors' token refresh and tracing back.

Polling asks for the job at once, then repeats after one second, two, four, and then every eight seconds, until the job is terminal. The spec drives it with fake timers. It flushes the first poll, advances the clock to one millisecond before the first delay, expects no request, advances one more millisecond, and expects exactly one. Lesson ten comes back to that technique.

Now the drill scenario: the connection drops at sixty percent. The server sees the socket close and unsubscribes, and the job keeps running, because it lives in the queue, not in the connection. In the browser, the reader fails, and the observable falls back to polling. The first poll returns the current snapshot, perhaps eighty percent, so the bar jumps forward and carries on. The user sees no error. Be honest about the gaps, though. If polling fails too, the page shows an error with no retry, and a user who navigates away has no way back to the job. Production would retry the polls, and keep a list of recent exports.

## The reports page

The page, `features/reports/reports-page.ts`, ties it together. Export ignores a second click while one is running, and the button shows busy rather than disabled. The 202 response switches into the watch method, starting with the queued job, so the page shows "Queued" straight away. The status text is a computed signal: "Running", attempt two of three, then "Completed", or "Failed" with the reason. The progress bar wraps a native progress element with a label, and the status line has a status role. Lesson five covers why.

Download has its own detail. The CSV needs the bearer token, so a plain link can't fetch it. The page fetches it as a blob through HttpClient, and hands it to the browser through an object URL. The end-to-end test exports with one simulated failure, waits for "attempt 2 of 3" and then "Completed", and checks that the download is a CSV.

## Outbox and idempotent consumers

In Coursewright, creating the job and publishing the message happen in one process's memory, so they can't disagree. In production, they're two systems, a database and a queue, with no transaction across both.

Publish first, then commit, and a failed commit leaves a consumer working on a job that doesn't exist. Commit first, then publish, and a crash in between leaves a job that was saved but never published. The ADR's production mapping names the fix: the outbox pattern. The platform service writes the job row and an outbox row in one database transaction. A relay reads the outbox and publishes, to SNS, which fans out to an SQS queue with a redrive policy to a dead-letter queue.

The relay can publish twice, and SQS delivers at least once anyway, so consumers must be idempotent. Record each processed message ID in the same transaction as its effect, and skip any you've seen. Better still, make the effect idempotent by design: a unique constraint, an upsert, or a state change that only moves forward. Coursewright's worker is naturally idempotent, because every attempt starts from scratch and overwrites the result.

## Costs, and what production would add

The ADR is honest about the costs. Jobs live in one process's memory, so a restart loses them, and two BFF instances wouldn't share them. And every watching tab holds an SSE connection. Over HTTP one point one, a browser allows six connections per origin, so a few busy tabs can starve the app. HTTP two removes that limit.

So production would add job state in the database, and SSE fan-out across BFF instances, through Redis publish and subscribe, or a consumer per instance. Results would be files in storage behind presigned URLs, and events would get versioned schemas, with a `traceparent` in every envelope, so one trace runs from the browser, through the queue, to the worker.

## Designing a bulk enrolment

Now the core question: enrol five thousand learners from a CSV upload. Build it from the same parts.

In the browser, check the file's size and header row before uploading, so obvious mistakes fail in a second. Upload the file to storage through a presigned URL rather than through the BFF, then POST an import request with an idempotency key, one per intent, as in lesson three. The server checks the manager role, takes the tenant from the token, writes the import job and an outbox row in one transaction, and returns 202 with a Location.

The worker validates every row, then enrols in batches of a few hundred, each in its own transaction. Coursewright's enrollments table already has a unique constraint on user and course, so a redelivered batch is harmless. A bad row doesn't fail the job. It goes into an error report the manager can download, fix and upload again. Transient failures retry with backoff, and a poison message goes to the dead-letter queue and marks the job failed.

Progress streams as counts, processed, enrolled, skipped and failed, with polling as the fallback. Announce milestones, not every percent. And because five thousand rows can take minutes, the job appears in a list of recent imports, so the manager can leave and come back.

## Traps

Here are the traps to call out.

Holding a request open for the whole job. A proxy times out at sixty seconds, and a user who navigates away loses the work.

Answering 201 for work that hasn't happened yet. It's a 202, with a Location to follow.

Putting the token in the query string so that `EventSource` can connect. URLs end up in logs, history and analytics.

Forgetting that `fetch` skips the interceptors, so the stream goes out with no token and no trace.

Assuming a network chunk is a whole message. Chunks can end mid-line, so buffer the rest.

Streaming deltas instead of snapshots, so one missed event corrupts the screen.

Retrying forever. Back off, cap the attempts, and dead-letter what's left.

And publishing before committing, to consumers that aren't idempotent.

## Interview drill

Let's practise. After each question there's a short pause. Pause the audio if you want more time, answer out loud, and then compare your answer with the model answer.

**Interviewer:** Design bulk-enrolling five thousand learners from a CSV upload, end to end.

[pause 5s]

Check the file's size and header in the browser, upload it to storage, and POST an import with an idempotency key. The server checks the role, takes the tenant from the token, writes the job and an outbox row in one transaction, and returns 202 with a Location. The worker validates rows and enrols in batches, each in a transaction, and a unique constraint on user and course makes redelivery harmless. Bad rows go into a downloadable error report instead of failing the job. Progress streams as counts over SSE, with polling as the fallback, and poison messages go to a dead-letter queue.

**Interviewer:** The SSE connection drops at sixty percent. What does the user see, and what does the code do?

[pause 5s]

Almost nothing. The server sees the socket close and unsubscribes, but the job carries on in the queue. In the browser, the fetch reader fails, and the catch in the watch method switches to polling through HttpClient, which also refreshes an expired token. The first poll returns the current snapshot, so the bar jumps to wherever the job is, and polling backs off from one second to eight until the job finishes. Every event is a full snapshot, so nothing needs replaying. The gap: if polling fails too, the user gets an error and no retry.

**Interviewer:** Why is "publish to the queue, then commit to the database" wrong? What's the fix?

[pause 5s]

Because there's no transaction across the queue and the database. If the commit fails after the publish, a consumer processes a job that doesn't exist. Reversing the order doesn't help: commit, crash, and the job is saved but never published. The fix is the outbox pattern. Write the state change and an outbox row in one database transaction, and let a relay publish from the outbox and mark rows as sent. The relay can publish twice, so consumers must be idempotent.

**Interviewer:** How do you make a consumer idempotent?

[pause 5s]

Assume every message arrives more than once. Record each message ID in a processed-messages table, in the same transaction as the effect, and skip IDs you've already seen. Better, make the effect idempotent by design: unique constraints, upserts, and state changes that only move forward, so a completed job never goes back to running. Coursewright's report worker starts every attempt from scratch and overwrites the result. And put side effects, like sending an email, behind the same check.

**Interviewer:** When would you pick polling over SSE, even with SSE available?

[pause 5s]

When updates are rare or the job takes minutes, so a held connection buys nothing. When many tabs or dashboards watch at once, because each stream is a connection, and over HTTP one point one, a browser allows only six per origin. When proxies or corporate networks buffer or cut long responses, or the backend is serverless and can't hold connections. Polling is simpler, cacheable and easy to scale. Coursewright uses both: SSE for live progress, and polling with backoff when the stream fails.

## Recap

Five things to remember from this lesson.

One: accept fast. A 202 with a Location header is a receipt, and the work happens in the background, where it survives a closed tab.

Two: the queue is a seam. Retries back off exponentially, a message dead-letters after three attempts, and the worker starts each attempt from scratch.

Three: push, with pull as the fallback. SSE over fetch carries the token, a pure parser handles split chunks, and any stream failure falls back to polling with backoff.

Four: send snapshots, not deltas. A reconnect needs no replay, and a missed event costs nothing.

Five: in production, write the state and the event together with an outbox, and make every consumer idempotent, because delivery is at least once.

In the next lesson, we'll look at testing, unit, integration and end-to-end: how Coursewright tests races and backoff deterministically, and why its end-to-end suite runs with no retries.
