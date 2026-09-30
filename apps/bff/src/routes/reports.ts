import type { OutgoingHttpHeaders } from 'node:http';
import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import type { components } from '@coursewright/contracts';
import { requireRole } from '../auth/guards';
import type { Job, JobStore } from '../jobs/job-store';
import type { JobQueue } from '../jobs/queue';
import type { ReportMessage } from '../jobs/report-worker';
import { sendProblem } from '../problem';

type ReportRequest = components['schemas']['ReportRequest'];
type JobParams = { Params: { jobId: string } };

const HEARTBEAT_MS = 15_000;

export const reportRoutes: FastifyPluginAsync<{
  jobs: JobStore;
  queue: JobQueue<ReportMessage>;
  maxAttempts: number;
}> = async (app, { jobs, queue, maxAttempts }) => {
  // 202, not 201: the report doesn't exist yet. The job is a receipt, and Location says where to
  // follow it.
  app.post<{ Body: ReportRequest }>(
    '/reports',
    { onRequest: requireRole('manager'), schema: { body: { $ref: 'ReportRequest#' } } },
    async (request, reply) => {
      const { id: userId, tenantId } = request.user;
      const job = jobs.create(userId, maxAttempts);
      await queue.publish({
        jobId: job.id,
        tenantId,
        failAttempts: request.body.failAttempts ?? 0,
      });
      return reply.code(202).header('location', `/api/jobs/${job.id}`).send(job);
    },
  );

  app.get<JobParams>('/jobs/:jobId', async (request, reply) => {
    const entry = jobs.get(request.params.jobId, request.user.id);
    return entry ? entry.job : jobNotFound(reply);
  });

  app.get<JobParams>('/jobs/:jobId/events', async (request, reply) => {
    const entry = jobs.get(request.params.jobId, request.user.id);
    if (!entry) return jobNotFound(reply);

    // Take over the raw response: Fastify's reply pipeline is built for one body, not a stream.
    reply.hijack();
    const response = reply.raw;
    response.writeHead(200, {
      ...(reply.getHeaders() as OutgoingHttpHeaders), // keep what hooks set, such as traceparent
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
      'x-accel-buffering': 'no', // ask nginx-style proxies not to buffer the stream
    });

    // Every event is a full snapshot, so a client that reconnects needs no replay: the first
    // event brings it up to date, and Last-Event-ID can be ignored.
    const send = (job: Job, sequence: number) => {
      response.write(`id: ${sequence}\nevent: job\ndata: ${JSON.stringify(job)}\n\n`);
      if (job.status === 'completed' || job.status === 'failed') close();
    };
    // A comment line keeps idle proxies and load balancers from timing the connection out.
    const heartbeat = setInterval(() => response.write(': heartbeat\n\n'), HEARTBEAT_MS);
    const unsubscribe = jobs.subscribe(entry.job.id, send);
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      unsubscribe();
      response.end();
    };
    response.on('close', close); // the client went away

    send(entry.job, entry.sequence);
  });

  app.get<JobParams>('/jobs/:jobId/result', async (request, reply) => {
    const entry = jobs.get(request.params.jobId, request.user.id);
    if (!entry) return jobNotFound(reply);
    if (entry.job.status !== 'completed' || entry.result === undefined) {
      return sendProblem(reply, {
        status: 409,
        type: '/problems/job-not-completed',
        title: 'Report not ready',
        detail: `The job is ${entry.job.status}. Download the result once it is completed.`,
      });
    }
    return reply
      .type('text/csv; charset=utf-8')
      .header('content-disposition', `attachment; filename="completions-${entry.job.id}.csv"`)
      .send(entry.result);
  });
};

// Someone else's job is a 404, like another tenant's course: don't confirm that it exists.
function jobNotFound(reply: FastifyReply): FastifyReply {
  return sendProblem(reply, { status: 404, detail: 'There is no job with that id.' });
}
