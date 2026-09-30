# 12 · Evolving a Large Frontend

Welcome to the last lesson in the series. The first eleven were about code. This one is about the job around the code: making a large frontend better over years, with other people, while features keep shipping. By the end of it, you should be able to explain how you'd evolve a codebase without a rewrite, how you'd weigh technical debt against features, how a change crosses every layer of the stack, how you'd resolve a disagreement with a backend engineer, and how to tell the story of a multi-sprint initiative so that an interviewer can follow it.

## The questions this lesson answers

Here are the questions this lesson prepares you for. Tell me about a multi-sprint frontend initiative you led. How do you decide between paying down technical debt and shipping a feature? You disagree with a senior backend engineer about an API shape: how do you resolve it? How do you raise the quality bar of a team without becoming the bottleneck? And the catalog needs a new field that lives in a PHP service owned by another team: walk through the change across every layer.

Keep one sentence in your head while you listen. Make the good path executable, change things in small reversible steps, and write down why.

## Decisions, written down

Start with the six architecture decision records in the docs folder. Each has the same shape: a status, a date, the deciders, the context, the decision, and the consequences. In one breath: one pnpm workspace with boundaries enforced by lint; a hand-written OpenAPI contract with generated types; the access token in memory and the refresh token in an HTTP-only cookie; signals for state and RxJS for events over time; long-running work as jobs with server-sent events; and one trace ID from the browser to the log line.

The part worth copying is the negative consequences. Every ADR here lists what its decision costs: no affected builds, verbose YAML, tabs racing on token rotation, jobs lost on restart, logs that aren't traces. And ADR one ends with "When to revisit": more than one app, or CI time dominated by work a change didn't touch. That's what makes a record useful to the next team. It says why, what it cost, and what would make it wrong. A decision that isn't written down gets re-argued in every pull request.

## Boundaries first, then strangle

Lesson one showed the lint rules in `apps/web/eslint.config.js`. Now look at the pattern across the whole repo. Lint enforces the architecture. `contracts:check` and the contract test enforce the API. Budgets enforce performance, and axe in the end-to-end tests enforces the accessibility basics. Each one turns a rule into a failed build.

That's why boundaries come before refactors. Refactor first, and the codebase erodes back behind you. Make the rule executable first, and every improvement stays made. The rollout is the same each time: add the rule as a warning, count the violations, fix them in batches, then make it an error so the count can't go back up.

To replace something big, strangle it; don't rewrite it. Replace it one route at a time, behind a stable URL and a stable contract, with each step shippable and reversible. Coursewright makes the route the natural unit: features are lazy-loaded, never import each other, and reach the server only through the contract. A new catalog page could sit next to the old one, with a `canMatch` guard from lesson four sending tenants whose flag is on to the new route, while everyone else falls through to the old one. The URL doesn't change, and turning the flag off is the rollback. When every tenant has moved, you delete the old folder. A rewrite, by contrast, stops feature work and delivers nothing until the end.

## Technical debt as a portfolio

Technical debt isn't one thing to be for or against. Treat it as a portfolio. Name each item, estimate its interest, meaning the incidents it causes and the features it slows, and pay down the items with the highest interest alongside feature work.

Coursewright's ADRs already hold a debt register, in those negative consequences. Jobs live in one process's memory. Tabs race on refresh-token rotation. RUM is logged but never aggregated. There's no breaking-change check on the contract.

Now estimate the interest, because it changes with the roadmap. Jobs in memory cost almost nothing with one BFF instance. The day the team plans a second instance, that item blocks the plan, and it jumps to the top. The tab race costs something today, because a user with two tabs can be signed out, so you'd measure how often before deciding. That's the answer to "debt or feature": it's rarely either-or. Attach debt to the feature work that touches it, keep a steady share of each sprint for the rest, and explain the choice in business terms: incidents avoided and features unblocked.

## What the BFF is for

Now the cross-stack part of the role. Open `apps/bff/src/app.ts`, which builds the whole backend-for-frontend in one function. It creates Fastify with the trace logging from the last lesson, creates and seeds the database, and registers the cookie plugin, the observability hooks and the problem handlers. It loads every schema from the contract, so routes validate against the contract itself. Then it registers every route under the API prefix, with the authentication hook first, so each route needs a token unless it's marked public.

That file shows what a BFF is for. It shapes APIs for one frontend. It owns the session: the refresh cookie lives here. It enforces authentication and tenancy at the edge, with the tenant taken from the token on every query. And in production, it aggregates the platform services behind it. What it isn't is a second business-logic tier. Rules about enrollments belong to whoever owns enrollments; the BFF adapts, combines and protects.

The relational basics show up here too. `apps/bff/src/db.ts` indexes courses on tenant, title and ID, which matches the catalog query exactly. The enrollments table has a unique constraint on the user and the course. The route in `routes/enrollments.ts` checks for an existing enrollment and answers four-oh-nine, but the check isn't the guarantee. With several instances sharing a database, two requests could both pass it. The unique constraint is the last line against a duplicate, and its index also serves the "my enrollments" query, which looks enrollments up by user.

## A new field from another team's service

Here's the cross-stack drill. The catalog needs a new field, say a course's average rating, and the data lives in a PHP service owned by another team. Walk it through every layer, in order.

Start in the platform service, and read before you ask. In a typical Laravel service, follow the route file to the controller. The controller calls a service or a policy, which uses Eloquent models, and an API Resource shapes the JSON. The policy is the real authorization boundary, and the Resource is where the field gets added. Ask the owning team for an additive, optional field, offer to write the pull request, and add a consumer contract test on that boundary, so they'll know if a change of theirs ever breaks you.

Then the contract. Change `contracts/openapi.yaml` first, with the field optional, because the platform rolls out on its own schedule, and run `pnpm contracts:generate`. The order is enforced: the course summary schema forbids additional properties, so if the BFF sent the field before the contract allowed it, the contract test would fail.

Then the BFF maps the field from the platform's response, keeping the platform's naming out of the frontend's contract. The web app gets the new type from the generated contract, through the models file in core, with no hand-written change. The template handles the field being absent, with a unit test for that case, and the end-to-end journey covers it if it matters to that journey. Release it behind a flag, and make the field required in a later change, once the platform guarantees it.

## The AWS mapping

Interviewers will also ask how this would run in the cloud. The study guide maps each piece. The `JobQueue` interface becomes SQS with a dead-letter queue, fed by SNS or EventBridge. The CSV result becomes an S3 object behind a presigned URL. The static app goes on S3 behind CloudFront. The BFF runs as containers on ECS with Fargate, or on Lambda. Secrets go in Secrets Manager, and logs and traces go to CloudWatch or an OpenTelemetry backend. The point isn't the product names. Each seam in the code, the queue interface, the trace header, the contract, is where a managed service plugs in.

## Disagreeing about an API shape

Suppose a senior backend engineer wants the new endpoint to use offset pagination, or to return everything and let the frontend filter. You disagree. First, understand their constraints before arguing yours: other consumers, storage, cost. Second, move the argument onto a shared artifact: a pull request against the OpenAPI document, with both shapes written down and judged against criteria you agree on first. ADR two's table is a ready-made list: one error shape, keyset pagination because it's stable under inserts, and a four-oh-four across tenants. Third, separate reversible choices from irreversible ones. A field in the BFF's contract is cheap to change; a platform API that five teams consume isn't. Fourth, remember that the BFF can adapt a platform shape, so you don't have to win every argument upstream. And if you still disagree, the API's owner decides, you commit, and an ADR records why.

## Reviews that teach

Code review is where a senior engineer's standards spread, or stall. Explain the why, and link the ADR, instead of stating a preference. Separate "must fix" from "consider", so the author knows what blocks the merge. And automate taste: a Prettier config settles formatting, and lint enforces the boundaries and the template accessibility rules, so humans spend their attention on design.

Here's a worked example. A pull request adds a new feature folder, and one of its files imports from the catalog feature. Lint fails first, with the message from lesson one. So your review isn't about spotting the import. It's about the decision lint can't make: what is the shared thing? If it's presentational, it moves down into the design system, with plain inputs. If it's behaviour, like loading courses, it moves into core. If the new feature can't live without the catalog's internals, maybe it isn't a new feature at all. Your comment names that choice, links ADR one, and is marked must fix. The naming nits are marked consider.

## Raising the bar without becoming the bottleneck

If every important pull request needs your approval, you haven't raised the bar; you've become a queue. Put the standard in tooling wherever it fits, so the build says no instead of you. Keep reference implementations, like the catalog store that ADR four names as the worked example, because people copy what exists. Use templates for pull requests and ADRs. Pair on someone's first change in an unfamiliar area, review their second, then spot-check. Spread review ownership across several people. And put accessibility and tests in the definition of done. The measure is whether quality holds while you're on holiday.

## Telling the multi-sprint story

Now the behavioural question. Use a real initiative of your own, and structure it with STAR: situation, task, action and result, in about two minutes.

Here's the shape, as an illustration built on Coursewright rather than on anyone's history. Situation: features had started importing each other, and every change rippled across teams. Task: make the boundaries executable without stopping feature work. Action, sprint by sprint: write the ADR and add the lint rules as warnings, with messages that teach; fix the violations in batches, moving shared code down into core and the design system; then turn the warnings into errors in CI. Result: what you measured, such as the violation count falling to zero and staying there, and one thing you'd do differently.

Three things make the answer land. Say "I" for your decisions and "we" for the team's work. Show the sequencing, where each sprint shipped something on its own. And end with a number you can defend.

## The series in five sentences

Here's the whole series in five sentences. Architecture that isn't executable erodes, so layers, contracts, budgets and accessibility checks all fail the build. Signals hold state, RxJS handles events over time, and idempotency makes retries safe. Native elements, managed focus and real routes keep the platform's behaviour, measured by real users. The contract sits between frontend and backend, and the server enforces auth, tenancy and long-running work. And every change is small, tested at the right level, reversible, traceable and written down.

## Traps

Here are the traps to call out.

Proposing a rewrite. It stops feature work and delivers nothing until the end.

Refactoring before the rule is executable, so the codebase erodes back behind you.

Describing debt as code quality. Incidents and blocked features get prioritised; tidiness doesn't.

Settling an API argument in a meeting instead of on the contract, so it's never written down.

Turning the BFF into a second business-logic tier.

Being the reviewer on every pull request.

And in the behavioural answer: "we" all the way through, no sequencing, no result, or a story you didn't live. Interviewers probe the details, so use your own.

## Interview drill

Let's practise. After each question there's a short pause. Pause the audio if you want more time, answer out loud, and then compare your answer with the model answer.

**Interviewer:** Tell me about a multi-sprint frontend initiative you led.

[pause 5s]

Answer with STAR, a real initiative of your own, and about two minutes. Give the situation and the task in a sentence or two each. Then the actions, sprint by sprint, each one shippable. As an illustration built on Coursewright: an ADR and lint rules as warnings in the first sprint, the violations fixed in batches by moving shared code down, then the warnings turned into errors in CI. Finish with a measured result, like violations at zero and staying there, and one thing you'd do differently. Say "I" for your decisions.

**Interviewer:** How do you decide between paying down technical debt and shipping a feature?

[pause 5s]

It's rarely either-or. I keep debt as a portfolio: each item named, with its interest estimated in incidents and slowed features. The highest-interest items get paid down alongside feature work, ideally attached to the feature that touches them, with a steady share of each sprint for the rest. Interest changes with the roadmap: Coursewright's in-memory job store is cheap today, and urgent the day a second BFF instance is planned. And I explain the choice in business terms.

**Interviewer:** You disagree with a senior backend engineer about an API shape. How do you resolve it?

[pause 5s]

Understand their constraints first: other consumers, storage, cost. Then move the discussion onto the contract: a pull request against the OpenAPI document with both shapes, judged on criteria we agree up front, such as keyset pagination and one error shape. Separate reversible choices from irreversible ones. Remember that the BFF can adapt a platform shape, so not every argument needs winning upstream. If we still disagree, the API's owner decides, I commit, and an ADR records why.

**Interviewer:** How do you raise the quality bar of a team without becoming the bottleneck?

[pause 5s]

Put the standard in tooling wherever it fits: formatting, lint boundaries, template accessibility rules, budgets, the contract check, and axe in end-to-end tests. Then reference implementations people can copy, templates for pull requests and ADRs, and a definition of done that includes accessibility and tests. Pair on someone's first change in an area, review the second, then spot-check, and spread review ownership. The test is whether quality holds when I'm away.

**Interviewer:** The catalog needs a new field that lives in a PHP service owned by another team. Walk through the change across every layer.

[pause 5s]

Read their service first: the route, the controller, the policy, then the API Resource where the field is added. Ask for an additive, optional field, offer the pull request, and add a consumer contract test on that boundary. Then change `openapi.yaml` first, with the field optional, and regenerate the types; the schema forbids extra properties, so the contract test enforces that order. Map it in the BFF, render it with the absent case tested, release behind a flag, and make it required once the platform guarantees it.

## Recap

Five things to remember from this lesson, and from the series.

One: write decisions down. ADRs record the context, the costs, and when to revisit.

Two: boundaries before refactors, and strangle, don't rewrite. Make the rule executable, then change things route by route, each step reversible.

Three: technical debt is a portfolio. Estimate the interest in incidents and slowed features, and pay down the highest alongside feature work.

Four: the BFF adapts, combines and protects. A new field flows from the platform to the contract, the BFF and the web app, in that order, additively.

Five: scale yourself out. Tooling says no, references show the way, reviews teach, and the multi-sprint story is STAR with sequencing and a measured result.

That's the end of the series. You've walked the whole of Coursewright, from the design system to the log line. The last step is yours. Go back to `docs/study-guide.md` and re-answer every drill out loud, without notes, in under two minutes each. Mark the ones you can't finish, and re-read their files. Then work through the question bank in `docs/instructional/interview-questions.md`. Good luck with the interview.
