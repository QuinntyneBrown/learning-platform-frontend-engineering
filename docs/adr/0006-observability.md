# ADR-0006: Trace context from the browser, structured logs, real-user metrics

- **Status:** Accepted
- **Date:** 2026-09-30
- **Deciders:** Coursewright web team

## Context

"The catalog is slow" and "I got an error" are the two most common frontend reports. Neither can be acted on without being able to answer:
- what this user's requests did on the server;
- how the page performs for real users, not on a developer laptop.

## Decision

**One trace ID from click to log line.**
- The web app's `traceInterceptor` adds a W3C `traceparent` header to every `/api` request.
- The BFF continues that trace. Fastify's `genReqId` makes the trace ID the request ID, and a `LogController` with `requestIdLogLabel: 'trace_id'` puts it on every structured (pino) log line for that request (`apps/bff/src/observability.ts`).
- The BFF returns `traceparent` and `Server-Timing` on every response, and puts `traceId` in every problem+json error. A user's error report or a browser devtools screenshot then leads straight to the logs.

**Real-user monitoring.**
- `core/observability/rum.ts` records Core Web Vitals (LCP, INP and CLS) through the `web-vitals` library, and client errors through a global `ErrorHandler`.
- It batches them and sends them with `navigator.sendBeacon('/api/rum')` when the page is hidden, so the beacon survives unload and never competes with user requests.
- The BFF validates and logs each event.

**Performance guardrails in CI.**
- Angular bundle budgets fail the production build (initial bundle: warning at 350 kB, error at 500 kB).
- Every feature route is lazy-loaded, and below-the-fold content uses `@defer (on viewport)`.

## Consequences

**Positive**

- Any log line can be tied to the browser request that caused it, and any error the user sees carries the ID to search for.
- Web vitals come from real devices and real networks, where regressions actually show.
- The pieces follow standards (W3C Trace Context, Server-Timing), so swapping in a real backend changes only the exporters.

**Negative**

- Logs aren't traces: there are no spans, durations or cross-service waterfalls yet.
- RUM is only logged. Nothing aggregates it into percentiles or alerts.

**Production mapping.**
- Add the OpenTelemetry web SDK (document-load, fetch and user-interaction instrumentation) and the Node SDK on the BFF, exporting OTLP to a collector. The collector redacts, samples and forwards to a tracing and metrics backend such as Grafana Tempo, Prometheus/Mimir and Loki.
- Define SLOs on user-facing signals, for example "99% of catalog searches render within 1 s", with burn-rate alerts.
