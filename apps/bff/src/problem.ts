import { STATUS_CODES } from 'node:http';
import type { FastifyError, FastifyInstance, FastifyReply } from 'fastify';

export interface ProblemInit {
  status: number;
  /** A URI naming the problem, for errors clients handle specially. Plain HTTP errors omit it. */
  type?: string;
  title?: string;
  detail?: string;
}

/**
 * Sends an RFC 9457 problem. Without a `type` it is `about:blank`, whose title is the HTTP status
 * text, as the RFC asks.
 */
export function sendProblem(reply: FastifyReply, problem: ProblemInit): FastifyReply {
  const { status, type = 'about:blank', title = STATUS_CODES[status] ?? 'Error', detail } = problem;
  return reply
    .code(status)
    .type('application/problem+json')
    .send({ type, title, status, detail, traceId: reply.request.id });
}

/** Makes every error the app can produce, including 404s and schema failures, a problem. */
export function registerProblemHandlers(app: FastifyInstance): void {
  app.setErrorHandler<FastifyError>((error, request, reply) => {
    if (error.validation) {
      return sendProblem(reply, { status: 400, detail: error.message });
    }
    const status = error.statusCode ?? 500;
    if (status < 500) {
      return sendProblem(reply, { status, detail: error.message });
    }
    request.log.error({ err: error }, 'unhandled error');
    // Don't echo internals to the client. The traceId in the body finds this log line.
    return sendProblem(reply, { status: 500 });
  });

  app.setNotFoundHandler((request, reply) =>
    sendProblem(reply, { status: 404, detail: `No route for ${request.method} ${request.url}.` }),
  );
}
