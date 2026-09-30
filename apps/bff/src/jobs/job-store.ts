import { randomUUID } from 'node:crypto';
import type { components } from '@coursewright/contracts';

export type Job = components['schemas']['Job'];
export type JobListener = (job: Job, sequence: number) => void;

export interface JobEntry {
  /** The latest snapshot. Snapshots are replaced, never mutated. */
  job: Job;
  /** Bumped on every change; it becomes the SSE event id. */
  sequence: number;
  ownerId: string;
  result?: string;
}

/**
 * Job state and change notifications, in memory. With several BFF instances this would live in
 * a shared store (a table, or Redis with pub/sub) so any instance can serve a job's events.
 */
export class JobStore {
  readonly #entries = new Map<string, JobEntry>();
  readonly #listeners = new Map<string, Set<JobListener>>();

  create(ownerId: string, maxAttempts: number): Job {
    const now = new Date().toISOString();
    const job: Job = {
      id: `job-${randomUUID()}`,
      type: 'completions',
      status: 'queued',
      progress: 0,
      attempt: 0,
      maxAttempts,
      createdAt: now,
      updatedAt: now,
      resultUrl: null,
      error: null,
    };
    this.#entries.set(job.id, { job, sequence: 1, ownerId });
    return job;
  }

  /** The job, but only for the user who created it. */
  get(id: string, ownerId: string): Readonly<JobEntry> | undefined {
    const entry = this.#entries.get(id);
    return entry?.ownerId === ownerId ? entry : undefined;
  }

  update(id: string, changes: Partial<Omit<Job, 'id' | 'type' | 'createdAt'>>): void {
    const entry = this.#entries.get(id);
    if (!entry) return;
    entry.job = { ...entry.job, ...changes, updatedAt: new Date().toISOString() };
    entry.sequence += 1;
    for (const listener of this.#listeners.get(id) ?? []) listener(entry.job, entry.sequence);
  }

  saveResult(id: string, result: string): void {
    const entry = this.#entries.get(id);
    if (entry) entry.result = result;
  }

  /** Calls `listener` on every change to the job. Returns the unsubscribe function. */
  subscribe(id: string, listener: JobListener): () => void {
    const listeners = this.#listeners.get(id) ?? new Set<JobListener>();
    listeners.add(listener);
    this.#listeners.set(id, listeners);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) this.#listeners.delete(id);
    };
  }
}
