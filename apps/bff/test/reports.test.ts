import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { components } from '@coursewright/contracts';
import { buildTestApp, login, type TestSession } from './helpers';

type Job = components['schemas']['Job'];

describe('reports', () => {
  let app: FastifyInstance;
  let manager: TestSession;

  beforeAll(async () => {
    app = await buildTestApp();
    manager = await login(app, 'manager.acme');
  });
  afterAll(() => app.close());

  const requestReport = async (failAttempts = 0, session = manager) =>
    app.inject({
      method: 'POST',
      url: '/api/reports',
      headers: session.auth,
      payload: { type: 'completions', failAttempts },
    });

  const getJob = async (id: string, session = manager) =>
    (await app.inject({ url: `/api/jobs/${id}`, headers: session.auth })).json<Job>();

  it('is for managers only', async () => {
    const learner = await login(app, 'learner.acme');
    const response = await requestReport(0, learner);

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ status: 403, type: 'about:blank' });
  });

  it('accepts the request with 202, a Location header and a queued job', async () => {
    const response = await requestReport();
    const job = response.json<Job>();

    expect(response.statusCode).toBe(202);
    expect(response.headers['location']).toBe(`/api/jobs/${job.id}`);
    expect(job).toMatchObject({
      type: 'completions',
      status: 'queued',
      progress: 0,
      attempt: 0,
      maxAttempts: 3,
    });
  });

  it('retries a failed attempt after a backoff, then completes with a CSV', async () => {
    const { id } = (await requestReport(1)).json<Job>();

    await expect.poll(async () => (await getJob(id)).status).toBe('completed');
    const job = await getJob(id);
    expect(job).toMatchObject({
      attempt: 2,
      progress: 100,
      resultUrl: `/api/jobs/${id}/result`,
      error: null,
    });
    expect(app.reportQueue.deadLetters.map(({ jobId }) => jobId)).not.toContain(id);

    const download = await app.inject({ url: `/api/jobs/${id}/result`, headers: manager.auth });
    expect(download.statusCode).toBe(200);
    expect(download.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(download.headers['content-disposition']).toBe(
      `attachment; filename="completions-${id}.csv"`,
    );
    const [header, ...rows] = download.body.trimEnd().split('\r\n');
    expect(header).toBe('course,learner,enrolled_at');
    expect(rows).toContain('Accessibility Fundamentals,Morgan Patel,2026-09-01T09:00:00.000Z');
    expect(rows.every((row) => !row.includes('Globex'))).toBe(true);
  });

  it('marks the job failed after maxAttempts and moves it to the dead-letter list', async () => {
    const { id } = (await requestReport(3)).json<Job>();

    await expect.poll(async () => (await getJob(id)).status).toBe('failed');
    expect(await getJob(id)).toMatchObject({
      attempt: 3,
      resultUrl: null,
      error: expect.stringContaining('Gave up after 3 attempts'),
    });
    await expect.poll(() => app.reportQueue.deadLetters.map(({ jobId }) => jobId)).toContain(id);

    const download = await app.inject({ url: `/api/jobs/${id}/result`, headers: manager.auth });
    expect(download.statusCode).toBe(409);
    expect(download.json()).toMatchObject({ type: '/problems/job-not-completed' });
  });

  it('hides a job from everyone except the user who started it', async () => {
    const { id } = (await requestReport()).json<Job>();

    for (const username of ['learner.acme', 'manager.globex']) {
      const other = await login(app, username);
      const response = await app.inject({ url: `/api/jobs/${id}`, headers: other.auth });
      expect(response.statusCode).toBe(404);
    }
  });

  it('streams job snapshots over SSE and closes after the last one', async () => {
    // Slower steps, so the stream is open while the job is still running.
    const sseApp = await buildTestApp({ jobStepMs: 40 });
    try {
      const baseUrl = await sseApp.listen({ port: 0, host: '127.0.0.1' });
      const session = await login(sseApp, 'manager.acme');
      const accepted = await sseApp.inject({
        method: 'POST',
        url: '/api/reports',
        headers: session.auth,
        payload: { type: 'completions' },
      });
      const { id } = accepted.json<Job>();

      const response = await fetch(`${baseUrl}/api/jobs/${id}/events`, {
        headers: {
          ...session.auth,
          traceparent: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01',
        },
      });
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('text/event-stream');
      expect(response.headers.get('traceparent')).toMatch(/^00-0af7651916cd43dd8448eb211c80319c-/);

      // text() resolves once the server ends the stream.
      const events = parseEventStream(await response.text());
      const ids = events.map((event) => event.id);
      const jobs = events.map((event) => event.job);

      expect(events.every((event) => event.event === 'job')).toBe(true);
      expect(ids).toEqual([...ids].sort((a, b) => a - b));
      expect(new Set(ids).size).toBe(ids.length);
      expect(
        jobs.some((job) => job.status === 'running' && job.progress > 0 && job.progress < 100),
      ).toBe(true);
      expect(jobs.at(-1)).toMatchObject({ status: 'completed', progress: 100 });
      expect(
        jobs.slice(0, -1).every((job) => job.status === 'queued' || job.status === 'running'),
      ).toBe(true);
    } finally {
      await sseApp.close();
    }
  });
});

function parseEventStream(stream: string): { id: number; event: string; job: Job }[] {
  return stream
    .split('\n\n')
    .filter((block) => block !== '' && !block.startsWith(':'))
    .map((block) => {
      const fields = new Map(
        block.split('\n').map((line) => {
          const colon = line.indexOf(': ');
          return [line.slice(0, colon), line.slice(colon + 2)] as const;
        }),
      );
      return {
        id: Number(fields.get('id')),
        event: fields.get('event') ?? '',
        job: JSON.parse(fields.get('data') ?? 'null') as Job,
      };
    });
}
