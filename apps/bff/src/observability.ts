import { randomBytes } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { type FastifyInstance, LogController } from 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    /** performance.now() when the request arrived, for Server-Timing. */
    startTime: number;
  }
}

// W3C Trace Context: version-traceid-parentid-flags, lowercase hex.
const TRACEPARENT = /^00-([0-9a-f]{32})-([0-9a-f]{16})-[0-9a-f]{2}$/;
const ALL_ZEROS = /^0+$/;

/** The trace id from a valid `traceparent` header, or undefined if it is missing or malformed. */
export function traceIdFrom(traceparent: string | string[] | undefined): string | undefined {
  if (typeof traceparent !== 'string') return undefined;
  const [, traceId, parentId] = TRACEPARENT.exec(traceparent.trim()) ?? [];
  if (!traceId || !parentId) return undefined;
  // The spec makes all-zero ids invalid. Start a fresh trace rather than join a bogus one.
  return ALL_ZEROS.test(traceId) || ALL_ZEROS.test(parentId) ? undefined : traceId;
}

/**
 * Fastify server options that make each request's id its trace id. Every log line then
 * carries `trace_id`, so one search finds the browser's RUM events and the server's logs.
 */
export const traceLogging = {
  genReqId: (request: IncomingMessage) =>
    traceIdFrom(request.headers.traceparent) ?? randomBytes(16).toString('hex'),
  logController: new LogController({ requestIdLogLabel: 'trace_id' }),
};

export function registerObservability(app: FastifyInstance): void {
  app.decorateRequest('startTime', 0);

  app.addHook('onRequest', async (request, reply) => {
    request.startTime = performance.now();
    // Same trace, new span id: this server's work is a child of the caller's span.
    reply.header('traceparent', `00-${request.id}-${randomBytes(8).toString('hex')}-01`);
  });

  app.addHook('onSend', async (request, reply) => {
    // Browsers show Server-Timing in DevTools and expose it to RUM via PerformanceResourceTiming.
    const duration = performance.now() - request.startTime;
    reply.header('server-timing', `app;dur=${duration.toFixed(1)}`);
  });
}
