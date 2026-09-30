import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { CoursewrightApi, type Job, problemMessage } from '@cw/core';
import { Button, Card, Progress } from '@cw/design-system';
import { finalize, startWith, switchMap } from 'rxjs';
import { JobProgress } from './job-progress';

@Component({
  selector: 'cw-reports-page',
  imports: [ReactiveFormsModule, Button, Card, Progress],
  templateUrl: './reports-page.html',
  styleUrl: './reports-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReportsPage {
  private readonly api = inject(CoursewrightApi);
  private readonly jobProgress = inject(JobProgress);
  private readonly destroyRef = inject(DestroyRef);
  private readonly document = inject(DOCUMENT);

  protected readonly failureOptions = [0, 1, 2, 3];
  protected readonly failAttempts = new FormControl(0, { nonNullable: true });

  protected readonly job = signal<Job | null>(null);
  protected readonly exporting = signal(false);
  protected readonly downloading = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly statusText = computed(() => {
    const job = this.job();
    if (!job) return '';
    switch (job.status) {
      case 'queued':
        return 'Queued';
      case 'running':
        return `Running — attempt ${job.attempt} of ${job.maxAttempts}`;
      case 'completed':
        return 'Completed';
      case 'failed':
        return `Failed: ${job.error ?? 'unknown error'}`;
    }
  });

  protected exportReport(): void {
    // One export at a time. The button shows busy rather than disabled, so focus stays on it.
    if (this.exporting()) return;
    this.exporting.set(true);
    this.job.set(null);
    this.error.set(null);

    this.api
      .requestReport({ type: 'completions', failAttempts: this.failAttempts.value })
      .pipe(
        // 202 Accepted returns at once with the queued job; progress arrives from watchJob.
        switchMap((job) => this.jobProgress.watchJob(job.id).pipe(startWith(job))),
        finalize(() => this.exporting.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (job) => this.job.set(job),
        error: (error: unknown) => this.error.set(problemMessage(error)),
      });
  }

  // The CSV needs the bearer token, so a plain <a href> can't fetch it. Fetch it as a blob
  // through HttpClient, then hand it to the browser as a download via an object URL.
  protected download(jobId: string): void {
    if (this.downloading()) return;
    this.downloading.set(true);
    this.error.set(null);

    this.api
      .downloadJobResult(jobId)
      .pipe(
        finalize(() => this.downloading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (csv) => this.save(csv, `completions-${jobId}.csv`),
        error: (error: unknown) => this.error.set(problemMessage(error)),
      });
  }

  private save(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const link = this.document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    // Revoke on a later task: revoking straight after click() can cancel the download.
    setTimeout(() => URL.revokeObjectURL(url));
  }
}
