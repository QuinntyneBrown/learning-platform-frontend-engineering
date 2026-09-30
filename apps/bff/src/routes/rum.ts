import type { FastifyPluginAsync } from 'fastify';
import type { components } from '@coursewright/contracts';

type RumBatch = components['schemas']['RumBatch'];

export const rumRoutes: FastifyPluginAsync = async (app) => {
  // navigator.sendBeacon(url, string) sends the JSON as text/plain. Parse that as JSON too, with
  // Fastify's own safe parser (it rejects __proto__ tricks). The parser is scoped to this plugin.
  app.addContentTypeParser(
    'text/plain',
    { parseAs: 'string' },
    app.getDefaultJsonParser('error', 'error'),
  );

  // Public, because sendBeacon can't set an Authorization header. Production would rate-limit it
  // and forward the events to an observability backend instead of the log.
  app.post<{ Body: RumBatch }>(
    '/rum',
    { config: { public: true }, schema: { body: { $ref: 'RumBatch#' } } },
    async (request, reply) => {
      for (const event of request.body.events) {
        request.log.info({ rum: event }, 'rum event');
      }
      return reply.code(202).send();
    },
  );
};
