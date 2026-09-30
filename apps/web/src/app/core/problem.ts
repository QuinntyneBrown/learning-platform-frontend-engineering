import { HttpErrorResponse } from '@angular/common/http';
import type { Problem } from './api/models';

const FALLBACK = 'Something went wrong. Please try again.';

/** A message fit to show a user, from an RFC 9457 problem+json error when the BFF sent one. */
export function problemMessage(error: unknown, fallback = FALLBACK): string {
  if (!(error instanceof HttpErrorResponse)) return fallback;
  if (error.status === 0) return 'Unable to reach the server. Check your connection and try again.';
  return isProblem(error.error) ? (error.error.detail ?? error.error.title) : fallback;
}

function isProblem(body: unknown): body is Problem {
  return typeof body === 'object' && body !== null && typeof (body as Problem).title === 'string';
}
