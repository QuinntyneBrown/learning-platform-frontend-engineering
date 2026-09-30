import { HttpErrorResponse } from '@angular/common/http';
import { type ErrorHandler, Injectable, inject } from '@angular/core';
import { Rum } from './rum';
import { traceIdOf } from './trace.interceptor';

/** Uncaught errors (and, via provideBrowserGlobalErrorListeners, window errors) end up here. */
@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  private readonly rum = inject(Rum);

  handleError(error: unknown): void {
    console.error(error);
    this.rum.recordError(describe(error));
  }
}

function describe(error: unknown): { name: string; message: string; traceId?: string } {
  if (error instanceof HttpErrorResponse) {
    // The trace id links this client error to the BFF's logs for the same request.
    const traceId = traceIdOf(error.headers.get('traceparent'));
    return { name: `HTTP ${error.status}`, message: error.message, traceId };
  }
  if (error instanceof Error) {
    return { name: error.name, message: error.message };
  }
  return { name: 'Error', message: String(error) };
}
