import { DOCUMENT, Injectable, inject } from '@angular/core';
import type { Metric } from 'web-vitals';
import type { RumBatch, RumEvent } from '../api/models';

const MAX_BATCH = 10;

/** Real-user monitoring: batches Core Web Vitals and client errors, and beacons them to the BFF. */
@Injectable({ providedIn: 'root' })
export class Rum {
  private readonly document = inject(DOCUMENT);
  // Absent in jsdom (unit tests) and very old browsers; RUM is best-effort, so it just switches off.
  private readonly enabled = typeof navigator !== 'undefined' && 'sendBeacon' in navigator;
  private batch: RumEvent[] = [];

  start(): void {
    if (!this.enabled) return;
    void this.observeWebVitals();
    // "hidden" is the last event a page reliably gets: mobile browsers may discard a background
    // tab without ever firing unload. web-vitals reports its final LCP/INP/CLS values then, too.
    this.document.addEventListener('visibilitychange', () => {
      if (this.document.visibilityState === 'hidden') this.flush();
    });
  }

  // Loaded lazily: monitoring code shouldn't compete with the page for the initial bundle.
  private async observeWebVitals(): Promise<void> {
    const { onCLS, onINP, onLCP } = await import('web-vitals');
    const report = ({ name, value, rating }: Metric) =>
      this.record({ kind: 'web-vital', name, value, rating, url: this.url() });
    onLCP(report);
    onINP(report);
    onCLS(report);
  }

  recordError(error: { name: string; message: string; traceId?: string }): void {
    this.record({
      kind: 'error',
      name: error.name.slice(0, 100),
      message: error.message.slice(0, 2000),
      url: this.url(),
      traceId: error.traceId,
    });
  }

  private record(event: RumEvent): void {
    if (!this.enabled) return;
    this.batch.push(event);
    if (this.batch.length >= MAX_BATCH) this.flush();
  }

  private flush(): void {
    if (this.batch.length === 0) return;
    const body: RumBatch = { events: this.batch };
    this.batch = [];
    // sendBeacon survives the page going away, but can't set headers, so /api/rum is
    // unauthenticated. A string body is sent as text/plain, which the BFF accepts.
    navigator.sendBeacon('/api/rum', JSON.stringify(body));
  }

  private url(): string {
    return this.document.location.href.slice(0, 2000);
  }
}
