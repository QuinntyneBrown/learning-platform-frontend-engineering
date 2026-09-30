# 12 · Evolving a Large Frontend

> **Runtime:** ~21 min · **Level:** Senior · **Study guide:** [§13 Evolving a large application](../../study-guide.md#13-evolving-a-large-application) and [§12 Cross-stack](../../study-guide.md#12-cross-stack-nodetypescript-php-aws-relational-databases) · **Prerequisites:** [01](../01-layers-boundaries-and-design-system/) to [11](../11-ci-cd-and-frontend-observability/) (the whole series)

**Video:** [12-evolving-a-large-frontend.mp4](12-evolving-a-large-frontend.mp4) · [Slides](slides.html) · **Audio lesson:** [12-evolving-a-large-frontend.mp3](12-evolving-a-large-frontend.mp3) · [Transcript](script.md)

## Why this video exists

A senior frontend role is hired to make a large codebase better over years, with other people, while features keep shipping. So the last round of the interview asks about the job around the code: "Tell me about a multi-sprint initiative you led", "debt or feature?", "you disagree with a backend engineer", "how do you raise the bar?", and a cross-stack walk-through of a field owned by another team. Weak answers are generic ("I'd communicate well"), or they borrow a story the candidate didn't live. This video builds structured answers from Coursewright's own artifacts:
- six ADRs whose negative consequences double as a debt register;
- four executable rules (lint, the contract check, budgets, axe) that make improvements stick;
- a BFF that adapts, combines and protects, and a contract whose `additionalProperties: false` forces the order of a cross-stack change;
- review, pairing and STAR structures, with an illustration clearly framed as one, not as anyone's history.

It ends the series: the last slide sends you back to the study guide and the question bank.

## Learning objectives

By the end, the viewer can:

- Explain what makes an ADR useful to the next team (context, negative consequences, "when to revisit"), using Coursewright's six.
- Argue "boundaries before refactors" and "strangle, don't rewrite", and sketch a route-level strangler with `canMatch` and a flag.
- Treat technical debt as a portfolio, estimating interest from Coursewright's own ADR negatives and showing how the roadmap changes it.
- Explain what a BFF is for, and isn't, from `apps/bff/src/app.ts`, and name the relational basics the frontend feels (a matching index, a unique constraint as the last line).
- Walk a new field from another team's PHP service through the contract, the BFF and the web app, in order, additively.
- Resolve an API-shape disagreement on the contract, review a cross-feature import so the review teaches, and raise a team's bar without becoming the bottleneck.
- Structure the multi-sprint story with STAR, sequencing and a measured result, using a real initiative of your own.

## Interview questions this prepares you for

| Question | What a strong answer includes |
|---|---|
| Tell me about a multi-sprint frontend initiative you led. How did you sequence it, and how did you know it worked? | A **real** initiative of your own, never a borrowed one, told with STAR in about two minutes. Situation and task briefly; actions sprint by sprint, each one shippable on its own; a measured result; one thing you'd do differently. "I" for your decisions, "we" for the team's work. *Illustration built on Coursewright (not anyone's history):* an ADR and lint boundary rules added as warnings with teaching messages; violations fixed in batches by moving shared code down into core or the design system; warnings turned into errors in CI; the violation count at zero and staying there. |
| How do you decide between paying down tech debt and shipping a feature? | Rarely either-or. Debt as a portfolio: name each item, estimate its interest (incidents, slowed features), pay the highest alongside feature work, attached to the feature that touches it, with a steady share of each sprint for the rest. Interest moves with the roadmap: Coursewright's in-memory jobs (ADR-0005) cost almost nothing with one BFF instance and block the plan the day a second one is planned; the tab race on refresh rotation (ADR-0003) can sign a two-tab user out today, so measure it first. Explain in business terms: incidents avoided, features unblocked. |
| You disagree with a senior backend engineer about an API shape. How do you resolve it? | Their constraints first (other consumers, storage, cost). Move the argument onto a shared artifact: a pull request against `contracts/openapi.yaml` with both shapes, judged on criteria agreed up front. ADR-0002's table is ready-made: one problem+json error shape, keyset pagination (stable under inserts, constant cost at depth, unlike `OFFSET`), `404` across tenants. Separate reversible choices (a BFF contract field) from irreversible ones (a platform API five teams consume). The BFF can adapt a platform shape, so not every argument needs winning upstream. If you still disagree, the API's owner decides, you commit, and an ADR records why. |
| How do you raise the quality bar of a team without becoming the bottleneck? | Put the standard in tooling: formatting (`.prettierrc`), lint boundaries and template accessibility rules, bundle budgets, `contracts:check` and the contract test, axe in Playwright. Reference implementations people copy (ADR-0004 names the catalog store as the worked example). Templates for pull requests and ADRs. Accessibility and tests in the definition of done. Pair on someone's first change in an area, review the second, then spot-check; spread review ownership. The measure: quality holds while you're away. |
| A new catalog field lives in a PHP service owned by another team. Walk through the change across every layer. | Read their service first (typical Laravel: route file → controller → service or policy → Eloquent model → API Resource); the policy is the authorization boundary and the Resource is where the field is added. Ask for an additive, optional field, offer to write the PR, add a consumer contract test on that boundary. Then `openapi.yaml` first, with the field optional (not in `required`), and `pnpm contracts:generate`. `CourseSummary` has `additionalProperties: false`, so if the BFF sent the field first the contract test would fail ("must NOT have additional properties"), and the typed object literal in `toCourseSummary` wouldn't compile. The BFF maps platform naming to the contract; the web type arrives through `core/api/models.ts` unchanged; the template handles absence, with a unit test. Release behind a flag; make it required later, once guaranteed. |
| Walk me through reviewing a PR that adds a new feature folder importing from another feature. | Lint fails first: `featureNames()` covers the new folder automatically, and the message says "A feature must not import another feature or the shell. Move shared code to core or the design system." So the review is about the decision lint can't make: presentational → design system with plain inputs; behaviour (loading courses) → core; if it can't live without the other feature's internals, maybe it belongs inside that feature. The comment explains why, links ADR-0001, and is marked must fix; naming nits are marked consider. Taste is automated so humans review design. |
| What is the BFF for, and how would Coursewright run on AWS? | `app.ts` shows it: trace logging, the cookie plugin, observability hooks, problem handlers, every contract schema via `addSchema`, and the auth hook first under `/api`. A BFF shapes APIs for one frontend, owns the session (the refresh cookie), enforces auth and tenancy at the edge, and aggregates platform services. It isn't a second business-logic tier. AWS: `JobQueue` → SQS with a DLQ fed by SNS or EventBridge; the CSV → S3 behind a presigned URL; the static app → S3 + CloudFront; the BFF → ECS/Fargate or Lambda; secrets → Secrets Manager; logs and traces → CloudWatch or an OTel backend. The seams in the code are where managed services plug in. |
| Read a slow SQL query plan. What do you look for first? | Whether the access path matches the query: `SEARCH … USING INDEX` on the filter columns vs a full `SCAN`, and whether `ORDER BY` is served by the index or needs `USE TEMP B-TREE`. Then per-row work (a correlated subquery or N+1). In Coursewright, `EXPLAIN QUERY PLAN` for the catalog search shows `SEARCH c USING INDEX courses_tenant_title_id (tenant_id=?)`, no temp B-tree (the index orders by title), and a `CORRELATED SCALAR SUBQUERY` summing lesson durations per row via the lessons index. The `LIKE '%…%'` filter can't seek, so a rare term reads the tenant's whole index range. The `UNIQUE (user_id, course_id)` index also serves "my enrollments" by `user_id`. |

## Coursewright code on screen

| File | What to show |
|---|---|
| `docs/adr/0001` … `0006` | The shared shape (status, date, deciders, context, decision, consequences); each **Negative** list; ADR-0001's "When to revisit"; ADR-0002's HTTP-semantics table; ADR-0004 naming the catalog store as the worked example |
| `apps/web/eslint.config.js` | `featureNames()` and the per-feature rule with its teaching message (from lesson 01), as the model of an executable rule |
| `apps/web/src/app/app.routes.ts` | Lazy `loadComponent` and `canMatch` per route: why the route is the natural unit of a strangler |
| `apps/bff/src/app.ts` | `Fastify({ logger, ...traceLogging })`; cookie, observability, problem handlers; `addSchema` from the contract; `registerAuthentication` first inside the `/api` prefix |
| `apps/bff/src/db.ts` | `courses_tenant_title_id ON courses (tenant_id, title, id)` and its comment; `UNIQUE (user_id, course_id)`; the idempotency table's primary key; `transaction()` |
| `apps/bff/src/seed.ts` | "Deterministic on purpose": E2E relies on exact values; the seed runs in one transaction |
| `apps/bff/src/routes/enrollments.ts` | The existence check and `409`, then the transactional insert: the check isn't the guarantee, the constraint is |
| `contracts/openapi.yaml` | `CourseSummary`: `required`, `additionalProperties: false` |
| `apps/bff/src/routes/courses.ts` | `toCourseSummary`: where a new field would be mapped |
| `apps/web/src/app/core/api/models.ts` | `export type CourseSummary = Schemas['CourseSummary'];`: nothing hand-written to change |
| `apps/bff/test/contract.test.ts` | `expectToMatchContract` and "covers every response the contract documents" |
| `docs/study-guide.md` | §12 (the PHP walk-through and the AWS table) and §13 (the five talking points) |

## Run sheet

| Time | Segment | Content |
|---|---|---|
| 00:00–01:30 | Hook | The last lesson: the job around the code. The five questions. Thesis: executable, reversible, written down. |
| 01:30–02:45 | Decisions, written down | The six ADRs in one breath. Their shape. The negative consequences, and "When to revisit". |
| 02:45–04:30 | Boundaries, then strangle | Four executable rules. Warning → count → fix → error. The strangler diagram and the two-routes sketch. |
| 04:30–05:50 | Debt as a portfolio | Name, interest, pay the highest. The debt register from the ADRs; interest that moves with the roadmap. |
| 05:50–07:40 | What the BFF is for | `app.ts` in one function. It is / it isn't. The index that matches the query; the check vs the unique constraint. |
| 07:40–09:30 | A new field | The four-layer diagram. Reading a Laravel service. `openapi.yaml` first, enforced by `additionalProperties: false`. The BFF mapping and the generated web type. The rollout order. **Demo** (below). |
| 09:30–10:15 | The AWS mapping | The table; seams as plug-in points. |
| 10:15–11:20 | Disagreeing | Their proposal vs your concern. Six steps on the contract. ADR-0002's criteria. |
| 11:20–12:35 | Reviews that teach | Why, must fix vs consider, automate taste. The cross-feature import PR, and the review comment. |
| 12:35–13:20 | Raising the bar | "You've become a queue." Scale yourself out. Pair, review, step back. |
| 13:20–14:30 | The multi-sprint story | STAR. The illustration, labelled as one. "I" and "we", sequencing, a number. |
| 14:30–15:55 | The series and traps | The series in five sentences. The seven traps. |
| 15:55–19:45 | Drill | Five questions. |
| 19:45–21:00 | Recap and close | The five points; the series-complete slide. |

## Code excerpts

### The whole BFF in one function

```ts
// apps/bff/src/app.ts (condensed)
const app = Fastify({ logger, ...traceLogging });
// …
await app.register(cookie);
registerObservability(app);
registerProblemHandlers(app);
for (const schema of componentSchemas(loadContract())) app.addSchema(schema);
// …
await app.register(
  async (api) => {
    registerAuthentication(api, tokens);
    await api.register(authRoutes, { db, tokens, secureCookies });
    await api.register(courseRoutes, { db });
    await api.register(enrollmentRoutes, { db });
    await api.register(reportRoutes, { jobs, queue, maxAttempts });
    await api.register(rumRoutes);
    await api.register(healthRoutes);
  },
  { prefix: '/api' },
);
```

### An index that matches the query, and the last line against duplicates

```sql
-- apps/bff/src/db.ts (excerpt)
-- Keyset pagination seeks to (title, id) within one tenant and reads forward in that order.
-- This index makes each page a range scan, however deep the page is.
CREATE INDEX courses_tenant_title_id ON courses (tenant_id, title, id);

CREATE TABLE enrollments (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users (id),
  course_id   TEXT NOT NULL REFERENCES courses (id),
  enrolled_at TEXT NOT NULL,
  UNIQUE (user_id, course_id)
);
```

### The contract forces the order of a cross-stack change

```yaml
# contracts/openapi.yaml (excerpt)
    CourseSummary:
      type: object
      required: [id, title, summary, level, durationMinutes]
      additionalProperties: false
```

```yaml
# Sketch, not in this repo: the new property, added under CourseSummary.properties and left out of `required`
        averageRating:
          type: number
          minimum: 0
          maximum: 5
```

### The other team's API Resource (sketch, not in this repo)

```php
// A typical Laravel API Resource in the platform service: the additive change you'd ask for, or offer to write.
class CourseResource extends JsonResource
{
    public function toArray($request): array
    {
        return [
            'id' => $this->id,
            'title' => $this->title,
            // …
            'average_rating' => $this->average_rating, // new, optional
        ];
    }
}
```

### A route-level strangler (sketch, not in this repo)

```ts
// app.routes.ts: the new page is matched first when the tenant's flag is on; everyone else falls through.
{
  path: 'catalog',
  canMatch: [authGuard, flagGuard('newCatalog')],
  loadComponent: () => import('./features/catalog-v2/catalog-page').then((m) => m.CatalogPage),
},
{
  path: 'catalog',
  canMatch: [authGuard],
  loadComponent: () => import('./features/catalog/catalog-page').then((m) => m.CatalogPage),
},
```

### The multi-sprint answer, as a skeleton (fill it with your own initiative)

```md
Situation: <what was wrong, for whom, and why it mattered>            (1–2 sentences)
Task:      <what you set out to change, and the constraint>            (1 sentence)
Action:    Sprint 1 <shippable step> · Sprint 2 <…> · Sprint 3 <…>     ("I" for your decisions)
Result:    <the number you measured>, and <one thing you'd do differently>
```

## Demo

```bash
# What each decision costs, and when to revisit it
git grep -n -A3 "^\*\*Negative\*\*" -- docs/adr
git grep -n "When to revisit\|Production mapping\|Production note" -- docs/adr

# The executable rules, as CI runs them
pnpm contracts:check
pnpm lint
pnpm --filter @coursewright/bff test contract

# The review scenario: a new feature folder importing another feature. Watch lint fail, then undo it.
mkdir apps/web/src/app/features/learning-paths
echo "import { CatalogStore } from '../catalog/catalog.store';" > apps/web/src/app/features/learning-paths/paths.ts
pnpm --filter @coursewright/web lint
rm -r apps/web/src/app/features/learning-paths

# The contract enforces the order: add `averageRating: 4.5,` to the object in toCourseSummary
# (apps/bff/src/routes/courses.ts), run the contract test, read "must NOT have additional properties", then undo.
pnpm --filter @coursewright/bff test contract
git checkout -- apps/bff/src/routes/courses.ts
```

## Traps to call out

- **Proposing a rewrite.** It stops feature work, has to reach parity with years of edge cases, and delivers nothing until the end. Strangle route by route instead.
- **Refactoring before the rule is executable.** The codebase erodes back behind you. Rule as a warning, count, fix in batches, then error.
- **Describing debt as code quality.** Nobody outside engineering can prioritise that. Incidents avoided and features unblocked, they can.
- **Settling an API argument in a meeting.** It's never written down, so it's re-argued. Put both shapes in a PR against `openapi.yaml`, and record the decision in an ADR.
- **A BFF that grows business rules.** It adapts, combines and protects. Rules belong to the service that owns the data.
- **Being the reviewer on every pull request.** You've become a queue. Tooling, references, templates and pairing scale you out.
- **The behavioural answer that isn't yours.** "We" all the way through, no sequencing, no result, or a borrowed story. Interviewers probe the details. Use a real initiative; the Coursewright example is only a shape.

## Key terms

architecture decision record (ADR) · negative consequences · "when to revisit" · executable rules / ratchet · strangler fig · route-level migration · feature flag · technical debt as a portfolio · interest (incidents, slowed features) · backend-for-frontend (BFF) · tenancy at the edge · composite index · unique constraint · `EXPLAIN QUERY PLAN` · N+1 / correlated subquery · Laravel controller, policy, Eloquent model, API Resource · consumer-driven contract test · additive (expand/contract) change · `additionalProperties: false` · must fix vs consider · definition of done · STAR

## After the video

1. Write your own multi-sprint story in the STAR skeleton above, from a real initiative. Time it: under two minutes. Mark the number you'd defend if the interviewer probes it.
2. Turn Coursewright's ADR negatives into a one-page debt register: for each item, the interest today, the roadmap event that raises it, and the smallest step that pays it down.
3. Write the pull-request description for the "average rating" field as the BFF side of the change: the contract diff, the mapping, the tests, the flag, and the follow-up that makes the field required.

## References

- [`docs/study-guide.md`](../../study-guide.md), sections 12 and 13, and "Before the interview"
- [ADR-0001](../../adr/0001-workspace-and-boundaries.md) to [ADR-0006](../../adr/0006-observability.md), especially their Consequences sections
- [`interview-questions.md`](../interview-questions.md): every question from the series, with strong-answer notes
- The original "Documenting Architecture Decisions" article (2011), where the ADR format comes from
- The strangler fig application pattern
- The backend-for-frontend (BFF) pattern
- SQLite documentation: `EXPLAIN QUERY PLAN`, and the query planner overview
- Laravel documentation: routing, controllers, authorization (policies), Eloquent API Resources
- Pact documentation: consumer-driven contract testing
