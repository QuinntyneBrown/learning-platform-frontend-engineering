import { Injectable, inject } from '@angular/core';
import { AuthStore, CoursewrightApi, type Job, createTraceparent } from '@cw/core';
import { Observable, catchError, repeat, takeWhile, timer } from 'rxjs';
import { parseSse } from './sse';

export const isTerminal = (job: Job) => job.status === 'completed' || job.status === 'failed';

/** 1 s, 2 s, 4 s, then every 8 s. */
export const pollDelay = (poll: number) => Math.min(1000 * 2 ** (poll - 1), 8000);

@Injectable({ providedIn: 'root' })
export class JobProgress {
  private readonly api = inject(CoursewrightApi);
  private readonly auth = inject(AuthStore);

  /** Job snapshots until the job completes or fails: pushed over SSE, or polled as a fallback. */
  watchJob(jobId: string): Observable<Job> {
    // Any stream failure (a network drop, a 401 from an expired token, a stream cut off
    // early) falls back to polling. Polling goes through HttpClient, so it gets the
    // interceptors' token refresh and tracing back.
    return this.stream(jobId).pipe(catchError(() => this.poll(jobId)));
  }

  private stream(jobId: string): Observable<Job> {
    return new Observable<Job>((subscriber) => {
      const abort = new AbortController();

      const read = async () => {
        // EventSource can't send an Authorization header, so read the stream with fetch.
        // fetch bypasses HttpClient and its interceptors: add the token and trace by hand.
        const response = await fetch(this.api.jobEventsUrl(jobId), {
          headers: {
            Accept: 'text/event-stream',
            Authorization: `Bearer ${this.auth.accessToken()}`,
            traceparent: createTraceparent(),
          },
          signal: abort.signal,
        });
        if (!response.ok || !response.body) {
          throw new Error(`Job event stream failed with HTTP ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        for (;;) {
          const { done, value } = await reader.read();
          if (done) throw new Error('Job event stream closed before the job finished');
          // stream: true keeps a multi-byte character that spans two chunks intact.
          const { messages, rest } = parseSse(buffer + decoder.decode(value, { stream: true }));
          buffer = rest;
          for (const message of messages.filter((m) => m.event === 'job')) {
            const job = JSON.parse(message.data) as Job;
            subscriber.next(job);
            if (isTerminal(job)) {
              subscriber.complete();
              return;
            }
          }
        }
      };

      read().catch((error: unknown) => subscriber.error(error));
      return () => abort.abort();
    });
  }

  private poll(jobId: string): Observable<Job> {
    // Each repeat resubscribes to the cold HttpClient observable, which sends a new request.
    return this.api.getJob(jobId).pipe(
      repeat({ delay: (poll) => timer(pollDelay(poll)) }),
      takeWhile((job) => !isTerminal(job), true),
    );
  }
}
