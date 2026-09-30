# 03 · RxJS Races and Idempotent Submits

Welcome. Lesson two put Coursewright's state in signals. This lesson is about the other half of ADR-0004: events over time. By the end of it, you should be able to walk through a search race operator by operator, choose a flattening operator for a button by its concurrency rule, explain why errors are caught inside the inner observable, and explain why a button that already ignores double clicks still sends an idempotency key.

## The questions this lesson answers

Here are the questions this lesson prepares you for. Walk through what happens when a user types "sig", pauses, types "nals", and the first response arrives last. Would you use switch map or exhaust map for a Save button? Why is an idempotency key needed if the button already uses exhaust map? What happens when an error reaches the outer stream? And should there be one idempotency key per intent, or one per attempt?

Keep one sentence in your head while you listen. A flattening operator is a concurrency decision, and no operator can make a write safe on its own; the server has to recognize a repeat.

## Four operators, four rules

All four flattening operators do the same basic job. They map each outer event, a keystroke or a click, to an inner observable, usually an HTTP request. The only difference is what they do when a new event arrives while the last inner observable is still running.

ADR-0004 puts it in a table. `switchMap`: the newest wins, and the previous one is cancelled. Coursewright uses it for typeahead search. `exhaustMap`: new events are ignored while one is in flight. It's used for the Enroll button and for "Load more". `concatMap`: queue, and run in order, for ordered saves. And `mergeMap`: run everything at once, optionally with a concurrency limit, for prefetching. The last two aren't needed in this app, and the table says so.

The ADR's positive consequences add the point worth repeating in an interview: each concurrency decision is one visible operator, which a reviewer can check against the table.

## The search pipeline

Open `apps/web/src/app/features/catalog/catalog.store.ts`. Paths from here on are relative to `apps/web/src/app`. The search method is an `rxMethod` of strings. As lesson two showed, the catalog page feeds it the search box's signal, so every change becomes an event. Then the pipe runs five steps.

First, `debounceTime` of two hundred and fifty milliseconds. Every keystroke restarts the timer, so nothing passes until the user pauses. Second, a map that trims the query. Third, `distinctUntilChanged`. Because it comes after the trim, a trailing space isn't a new search, and neither is typing a letter and deleting it within one pause. Fourth, a tap that patches the store: the new query, a loading status, and no error. The results stay on screen, dimmed by a stale class, rather than flashing away. And fifth, `switchMap` to the API's search call, with its own tap to store the results and its own catch.

## The race, step by step

Now the drill question. The user types "sig" and pauses. After two hundred and fifty milliseconds, "sig" passes the debounce and the distinct check, the status becomes loading, and `switchMap` subscribes to a request for "sig". Suppose that server call is slow.

The user types "nals". Each keystroke restarts the debounce. When they pause again, "signals" passes through, and `switchMap` does the important thing: it unsubscribes from the "sig" request before subscribing to the new one. Unsubscribing from an `HttpClient` request aborts it. So when the server finally answers "sig", nothing is listening. The comment in the store says why that matters: a slow response for an old query can't arrive late and overwrite the results for the newer one.

Compare the alternatives. With `mergeMap`, both requests stay live, "signals" lands first, and then "sig" lands last and overwrites it. The box says "signals" and the list shows results for "sig". That's the classic race. With `concatMap`, the "signals" request waits for the slow "sig" request to finish, which is correct but slow. With `exhaustMap`, "signals" is ignored while "sig" is in flight, so the user never gets the results they asked for. Only `switchMap` fits.

One caveat, and it matters for the rest of this lesson. Cancelling is client-side. The server may still run the "sig" query. For a read, that's harmless.

The spec proves the race without any timing luck. Open `features/catalog/catalog.store.spec.ts` and find the test that drops the slow response for an older query. It uses fake timers to advance past the debounce, and `HttpTestingController` to hold each request open. It searches for "react", then "angular", and then asserts that the "react" request was cancelled, before flushing only the fresh response. Lesson ten comes back to testing races.

## Catching errors in the right place

The comment at the top of the store's methods states the rule: errors are caught inside each inner request, because an error that reached the outer stream would complete it, and the search box would silently stop working.

That's how observables work. An error is terminal. If the catch sat at the end of the outer pipe, the first failed request would tear down the whole search pipeline. Every later keystroke would still set the signal, but nothing would be listening, and nothing on screen would say why.

So the catch sits inside the `switchMap`, on the request. The store's fail helper patches an error status with a message from the problem details, and returns an empty observable. That request ends quietly, the error lives in state where the page can show it, and the outer stream carries on. The third spec proves it: a five hundred and three puts the store in the error state, and the next search still goes out and loads.

## Load more: exhaustMap and the stale page

The load-more method is the second pipeline. It filters out clicks when there's no next cursor. Then it uses `exhaustMap`, and the comment explains why: it ignores clicks while a page is loading, so the same cursor isn't fetched twice, and pages can't be appended out of order.

Run the alternatives again. `mergeMap` would fetch the same cursor twice, and append duplicate courses. `concatMap` would queue the second click, so a double click loads two pages. `switchMap` would cancel the page and fetch the same cursor again, which wastes a request and, on a slow connection with an impatient user, may never finish.

There's one more guard, and it's the subtle part. Load-more and search are separate streams, so a new search doesn't cancel a page that's already loading. So the load-more method captures the query when it starts, and when the page arrives, it checks the store's query again. The comment says: a new search may have started meanwhile; this page belongs to the old one. If the query changed, the page is dropped. When two streams write the same state, one of them needs a guard like this.

## Enroll: exhaustMap for a write

Now a write. Open `features/course/enrollment-controller.ts`. It's a small injectable, provided by the course page. Clicks go into a subject of course IDs, and the constructor pipes that subject through `exhaustMap` to a private send method, with `takeUntilDestroyed` to end it with the page. The comment is the answer to the core question: exhaust map, not switch map, because a second click must not cancel an in-flight enrollment, since the server may already have done the work, nor start a second one. It is ignored.

That's why switch map is wrong for a Save button. Cancelling a POST only cancels your interest in the response. The request may already be at the server, and it commits. The second request commits too. The screen shows one result, and the database has two. `concatMap` is right when each click carries different data that must be saved in order, like successive edits to a draft. It's wrong for a double click on the same intent.

On the course page, the button's comment completes the picture: busy, never disabled, because a double click must reach exhaust map, which absorbs it. Lesson one covered busy versus disabled. The benefit here is that the rule lives in one place, the stream, and a unit test proves it: the controller's spec calls enroll twice and expects exactly one request. The end-to-end test double-clicks the real button and counts one POST.

## Why the server still needs an idempotency key

So if exhaust map already ignores the second click, why send an idempotency key? Because exhaust map only sees one stream, in one tab. It can't see a retry after a lost response, where the enrollment succeeded but the response never arrived. It can't see a second tab, a reload followed by another click, or a proxy that retries on its own. Only the server can recognize the same intent arriving twice, and it needs something to recognize it by.

Look at the send method. Its first line creates the key with the browser's random UUID function, and the comment says: one key per intent, reused by every retry. If a response is lost and the retry reaches the server, the server recognizes the key and replays the first result instead of enrolling twice. The API client puts it in the `Idempotency-Key` header.

On the server, in `apps/bff/src/routes/enrollments.ts`, the key is stored per user, with a hash of the request and the response it produced. The same key with the same body replays the stored response. The same key with a different body is a four hundred and twenty-two. Lesson seven owns that side.

Now the per-intent question. A new key per attempt would make every retry look like a new request, and defeat the whole point. So where the key is created is the design. It's created in send, which exhaust map calls once per accepted click. The retry operator resubscribes to the same request, so every retry carries the same key without extra code. A new click after a failure is a new intent, and gets a new key. The spec has a test for each: a retry of a five hundred and three carries the same key, and a new intent gets a different one.

## Retry with backoff

The retry itself is small. It retries at most twice. Its delay function checks whether the error is transient, meaning a network failure with status zero, or a server error of five hundred or more. The comment on that helper says: a four hundred error won't change by asking again. Transient errors wait three hundred milliseconds, then six hundred. Anything else is rethrown at once.

After the retry, a four hundred and nine means already enrolled, perhaps from another tab, and the comment says that for the user, that's success. Anything else sets the error state. And the catch sits inside send, for the same reason as in search: the next click must still work.

Say the key point plainly in an interview. Retrying a POST is only safe because of the key. Without it, a retry after a timeout is exactly how duplicates happen.

## URL state

The last piece is the URL. In `features/catalog/catalog-page.ts`, the search handler sets the query signal and then navigates to the same route with a new `q` query parameter. It passes null when the box is empty, which removes the parameter. And it sets `replaceUrl`, with the comment: one history entry for the page, not one per keystroke. Without it, typing "signals" would leave seven history entries, and Back would step through the letters.

Notice that the URL updates on every keystroke, without a debounce. That's fine: it's the same route, so the page instance is reused, and the expensive part, the request, is what the store debounces.

URL state is state. The query survives a reload, can be bookmarked and shared, and Back restores it. The end-to-end test checks that the URL carries the query, and another test opens a catalog link with a query while signed out, and lands back on it after sign-in. Lesson four covers that.

## Trade-offs and what production would add

The trade-off of RxJS is the learning curve, and ADR-0004 names it: two reactive models, with "state or event?" as a review question. The payoff is that each concurrency decision is a single visible operator.

Production would add jitter to the backoff, so a thousand clients don't retry in lockstep, and would respect a Retry-After header on a four hundred and twenty-nine. And remember that client cancellation doesn't stop server work, so expensive searches need server-side timeouts too.

## Traps

Here are the traps to call out.

Switch map on a write. It cancels your interest, not the request.

A catch on the outer stream. The first failure kills the feature, silently.

A new idempotency key per attempt. It's easy to do by accident, for example in an interceptor that stamps a fresh key on every request, because a retry passes through the interceptors again.

Debouncing a submit button. It delays every legitimate click. Exhaust map ignores only the duplicates.

Disabling the button to prevent double submits. It hides the reason and drops focus, and it doesn't stop a second tab.

Retrying four hundred errors. They won't change.

And two streams writing the same state with no guard.

## Interview drill

Let's practise. After each question there's a short pause. Pause the audio if you want more time, answer out loud, and then compare your answer with the model answer.

**Interviewer:** Walk through what happens when a user types "sig", pauses, types "nals", and the first response arrives last.

[pause 5s]

After a two hundred and fifty millisecond pause, "sig" passes the debounce and the distinct check, the store shows loading, and switch map starts a request. Typing "nals" restarts the debounce, and "signals" passes after the next pause. Switch map unsubscribes from the "sig" request, which aborts it, and subscribes to "signals". When "sig" answers late, nothing is listening, so it can't overwrite the newer results. The server may still do the work, which is fine for a read. Coursewright's store spec proves it with fake timers and the HTTP testing controller.

**Interviewer:** `switchMap` or `exhaustMap` for a Save button?

[pause 5s]

Exhaust map, if the clicks repeat one intent. It ignores new clicks while the save is in flight. Switch map is wrong, because cancelling a POST only cancels the client's interest in the response. The request may already be at the server, so both saves can commit while the screen shows one. Concat map is right when each click carries different data that must be saved in order. In Coursewright, the Enroll button uses exhaust map, and stays busy rather than disabled, so the double click reaches the stream.

**Interviewer:** Why is an `Idempotency-Key` needed if the button already uses `exhaustMap`?

[pause 5s]

Because exhaust map only sees one stream in one tab. It can't see a retry after a lost response, a second tab, a reload and another click, or a proxy that retries. Only the server can recognize the same intent twice. Coursewright's enrollment controller creates one key per intent and reuses it on retries. The server stores it per user with a request hash and the response. The same key replays the first result, and a different body with the same key is a four hundred and twenty-two.

**Interviewer:** What happens when an error reaches the outer stream?

[pause 5s]

The stream errors, and an error is terminal, so the whole pipeline is torn down. In a search, every later keystroke goes nowhere, and nothing on screen says why. That's why the catalog store catches inside the switch map, on each request. Its fail helper puts the error in state and returns an empty observable, so the outer stream keeps running. The enrollment controller does the same inside its send method. There's a spec for it: after a five hundred and three, the next search still loads.

**Interviewer:** One idempotency key per intent, or one per attempt?

[pause 5s]

Per intent. A key per attempt makes every retry look like a new request, which is exactly the duplicate you're trying to prevent. In Coursewright, the key is created in the send method, which exhaust map calls once per accepted click, and the retry operator resubscribes to the same request, so retries reuse it. A new click after a failure is a new intent and gets a new key. Watch for interceptors that stamp a fresh key on every request, because retries pass through them again.

## Recap

Five things to remember from this lesson.

One: a flattening operator is a concurrency decision. Switch map when the newest wins, exhaust map to ignore duplicates, concat map to keep order, and merge map for independent work.

Two: the search pipeline debounces, trims, de-duplicates, and switches, so a slow old response can't overwrite a newer one. Cancelling is client-side, which is fine for a read.

Three: catch errors inside the inner observable. An error on the outer stream is terminal, and the feature dies silently.

Four: exhaust map absorbs a double click, but only the server can recognize a repeat. Send one idempotency key per intent, reuse it on every retry, and retry only transient errors, with backoff.

Five: URL state is state. Put the query in the URL, and use replace URL so the history doesn't fill with keystrokes.

In the next lesson, we'll look at routing, guards and deep links: why Coursewright's guards use can match, why they return a URL tree, and how a deep link survives a sign-in.
