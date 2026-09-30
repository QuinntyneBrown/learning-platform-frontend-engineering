import type { HttpInterceptorFn } from '@angular/common/http';

/** A W3C trace id: 16 random bytes as 32 lowercase hex characters. */
export function createTraceId(): string {
  return randomHex(16);
}

/** A W3C `traceparent`: version 00, trace id, a new 8-byte parent span id, and flags 01 (sampled). */
export function createTraceparent(traceId = createTraceId()): string {
  return `00-${traceId}-${randomHex(8)}-01`;
}

/** The trace id inside a `traceparent` header, if the header is well formed. */
export function traceIdOf(traceparent: string | null): string | undefined {
  return /^00-([0-9a-f]{32})-[0-9a-f]{16}-[0-9a-f]{2}$/.exec(traceparent ?? '')?.[1];
}

// Every call gets its own trace, which the BFF continues and returns in problem+json `traceId`,
// so a user-reported error leads straight to the server logs for that request.
export const traceInterceptor: HttpInterceptorFn = (request, next) =>
  request.url.startsWith('/api/')
    ? next(request.clone({ setHeaders: { traceparent: createTraceparent() } }))
    : next(request);

function randomHex(bytes: number): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}
