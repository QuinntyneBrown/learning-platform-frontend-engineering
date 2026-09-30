import type { DatabaseSync } from 'node:sqlite';
import { setTimeout as delay } from 'node:timers/promises';
import { toCsv } from './csv';
import type { JobStore } from './job-store';
import type { MessageHandler } from './queue';

export interface ReportMessage {
  jobId: string;
  tenantId: string;
  /** How many attempts fail on purpose before one succeeds. A teaching knob from ReportRequest. */
  failAttempts: number;
}

const PROGRESS_STEPS = 5;
const FAILS_AT_STEP = 3;

export function createReportWorker(options: {
  db: DatabaseSync;
  jobs: JobStore;
  stepMs: number;
  maxAttempts: number;
}): MessageHandler<ReportMessage> {
  const { db, jobs, stepMs, maxAttempts } = options;

  return async ({ message: { jobId, tenantId, failAttempts }, attempt }) => {
    // Every attempt starts from scratch: a retry doesn't resume where the last one failed.
    jobs.update(jobId, { status: 'running', attempt, progress: 0 });
    try {
      for (let step = 1; step <= PROGRESS_STEPS; step++) {
        await delay(stepMs); // stands in for real work: querying, formatting, uploading
        if (attempt <= failAttempts && step === FAILS_AT_STEP) {
          throw new Error(`Attempt ${attempt} failed on purpose (failAttempts: ${failAttempts}).`);
        }
        jobs.update(jobId, { progress: (step * 100) / PROGRESS_STEPS });
      }
    } catch (error) {
      if (attempt >= maxAttempts) {
        const reason = error instanceof Error ? error.message : String(error);
        jobs.update(jobId, {
          status: 'failed',
          error: `Gave up after ${attempt} attempts. ${reason}`,
        });
      }
      throw error; // the queue decides: retry with backoff, or dead-letter
    }

    // Save the file before announcing it, so a client that reacts to "completed" can download it.
    jobs.saveResult(jobId, completionsCsv(db, tenantId));
    jobs.update(jobId, { status: 'completed', resultUrl: `/api/jobs/${jobId}/result` });
  };
}

function completionsCsv(db: DatabaseSync, tenantId: string): string {
  const rows = db
    .prepare(
      `SELECT c.title AS course, u.display_name AS learner, e.enrolled_at
       FROM enrollments e
       JOIN courses c ON c.id = e.course_id
       JOIN users u ON u.id = e.user_id
       WHERE c.tenant_id = ?
       ORDER BY c.title, u.display_name`,
    )
    .all(tenantId) as { course: string; learner: string; enrolled_at: string }[];
  return toCsv(
    ['course', 'learner', 'enrolled_at'],
    rows.map((row) => [row.course, row.learner, row.enrolled_at]),
  );
}
