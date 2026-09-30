import { buildApp } from './app';

const app = await buildApp({ logger: true });

// `localhost` makes Fastify listen on both ::1 and 127.0.0.1, so the web dev server's proxy
// reaches it whichever one "localhost" resolves to (on Windows it is often ::1).
await app.listen({
  port: Number(process.env.PORT ?? 3000),
  host: process.env.HOST ?? 'localhost',
});
