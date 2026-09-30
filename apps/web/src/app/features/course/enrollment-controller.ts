import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CoursewrightApi, problemMessage } from '@cw/core';
import { LiveAnnouncer } from '@cw/design-system';
import { EMPTY, Subject, catchError, exhaustMap, retry, tap, throwError, timer } from 'rxjs';

export type EnrollmentStatus = 'idle' | 'pending' | 'enrolled' | 'error';

/** Retry network failures and 5xx only; a 4xx won't change by asking again. */
const isTransient = (error: unknown) =>
  error instanceof HttpErrorResponse && (error.status === 0 || error.status >= 500);

/** 300 ms, then 600 ms. */
export const backoff = (retryCount: number) => 300 * 2 ** (retryCount - 1);

/** Turns "Enroll" clicks into at most one enrollment request at a time. Provide per component. */
@Injectable()
export class EnrollmentController {
  private readonly api = inject(CoursewrightApi);
  private readonly announcer = inject(LiveAnnouncer);
  private readonly intents = new Subject<string>();

  readonly status = signal<EnrollmentStatus>('idle');
  readonly error = signal<string | null>(null);

  constructor() {
    this.intents
      .pipe(
        // exhaustMap, not switchMap: a second click must not cancel an in-flight enrollment
        // (the server may already have done the work), nor start a second one. It is ignored.
        exhaustMap((courseId) => this.send(courseId)),
        takeUntilDestroyed(),
      )
      .subscribe();
  }

  enroll(courseId: string): void {
    this.intents.next(courseId);
  }

  private send(courseId: string) {
    // One key per intent, reused by every retry: if a response is lost and the retry reaches
    // the server, the server recognizes the key and replays the first result instead of
    // enrolling twice.
    const idempotencyKey = crypto.randomUUID();
    this.status.set('pending');
    this.error.set(null);

    return this.api.enroll(courseId, idempotencyKey).pipe(
      retry({
        count: 2,
        delay: (error, retryCount) =>
          isTransient(error) ? timer(backoff(retryCount)) : throwError(() => error),
      }),
      tap(() => this.succeed()),
      catchError((error: unknown) => {
        // 409: already enrolled (say, from another tab). For the user, that's success.
        if (error instanceof HttpErrorResponse && error.status === 409) {
          this.succeed();
        } else {
          this.status.set('error');
          this.error.set(problemMessage(error));
        }
        return EMPTY;
      }),
    );
  }

  private succeed(): void {
    this.status.set('enrolled');
    this.announcer.announce("You're enrolled");
  }
}
