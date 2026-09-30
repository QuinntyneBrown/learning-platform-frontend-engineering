import { randomBytes } from 'node:crypto';
import cookie from '@fastify/cookie';
import Fastify, { type FastifyInstance } from 'fastify';
import { createAccessTokens } from './auth/access-tokens';
import { registerAuthentication } from './auth/guards';
import { componentSchemas, loadContract } from './contract';
import { createDatabase } from './db';
import { JobStore } from './jobs/job-store';
import { InMemoryJobQueue } from './jobs/queue';
import { createReportWorker, type ReportMessage } from './jobs/report-worker';
import { registerObservability, traceLogging } from './observability';
import { registerProblemHandlers } from './problem';
import { authRoutes } from './routes/auth';
import { courseRoutes } from './routes/courses';
import { enrollmentRoutes } from './routes/enrollments';
import { healthRoutes } from './routes/health';
import { reportRoutes } from './routes/reports';
import { rumRoutes } from './routes/rum';
import { seed } from './seed';

export interface AppOptions {
  logger?: boolean;
  /** HMAC key for access tokens. Defaults to a random key, so a restart signs everyone out. */
  jwtSecret?: string;
  accessTokenTtlSeconds?: number;
  /** How long each of the report worker's five progress steps takes. */
  jobStepMs?: number;
  /** The first retry's delay. Each later retry waits twice as long. */
  retryBaseMs?: number;
  maxAttempts?: number;
  /** Adds Secure to the refresh cookie. Off by default in local dev, which is plain http. */
  secureCookies?: boolean;
}

declare module 'fastify' {
  interface FastifyInstance {
    /** The report queue, exposed so tests can see retries and dead letters. */
    reportQueue: InMemoryJobQueue<ReportMessage>;
  }
}

export async function buildApp(options: AppOptions = {}): Promise<FastifyInstance> {
  const {
    logger = false,
    jwtSecret = randomBytes(32).toString('base64url'),
    accessTokenTtlSeconds = 900,
    jobStepMs = 400,
    retryBaseMs = 500,
    maxAttempts = 3,
    secureCookies = process.env.NODE_ENV === 'production',
  } = options;

  const app = Fastify({ logger, ...traceLogging });

  const db = createDatabase();
  seed(db);
  app.addHook('onClose', async () => db.close());

  await app.register(cookie);
  registerObservability(app);
  registerProblemHandlers(app);
  for (const schema of componentSchemas(loadContract())) app.addSchema(schema);

  const tokens = createAccessTokens(jwtSecret, accessTokenTtlSeconds);
  const jobs = new JobStore();
  const queue = new InMemoryJobQueue<ReportMessage>({ maxAttempts, retryBaseMs });
  queue.subscribe(createReportWorker({ db, jobs, stepMs: jobStepMs, maxAttempts }));
  app.decorate('reportQueue', queue);

  await app.register(
    async (api) => {
      registerAuthentication(api, tokens);
      await api.register(authRoutes, { db, tokens, secureCookies });
      await api.register(courseRoutes, { db });
      await api.register(enrollmentRoutes, { db });
      await api.register(reportRoutes, { jobs, queue, maxAttempts });
      await api.register(rumRoutes);
      await api.register(healthRoutes);
    },
    { prefix: '/api' },
  );

  return app;
}
