import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { components } from '@coursewright/contracts';
import { buildTestApp, login, type TestSession } from './helpers';

type Course = components['schemas']['Course'];
type CoursePage = components['schemas']['CoursePage'];
type CourseSummary = components['schemas']['CourseSummary'];

describe('courses', () => {
  let app: FastifyInstance;
  let acme: TestSession;
  let globex: TestSession;

  beforeAll(async () => {
    app = await buildTestApp();
    acme = await login(app, 'learner.acme');
    globex = await login(app, 'learner.globex');
  });
  afterAll(() => app.close());

  const search = async (session: TestSession, query: Record<string, string>) => {
    const response = await app.inject({ url: '/api/courses', query, headers: session.auth });
    return { response, page: response.json<CoursePage>() };
  };

  describe('search', () => {
    it('matches a case-insensitive substring of the title', async () => {
      for (const q of ['signals', 'SIGNALS']) {
        const { page } = await search(acme, { q });
        expect(page.items.map(({ title }) => title)).toEqual(['Angular Signals in Practice']);
        expect(page.nextCursor).toBeNull();
      }
    });

    it("only searches the caller's tenant", async () => {
      const { page } = await search(globex, { q: 'angular' });
      expect(page.items).toEqual([]);
    });

    it('treats % and _ in the query as literal characters', async () => {
      for (const q of ['%', '_']) {
        const { page } = await search(acme, { q });
        expect(page.items).toEqual([]);
      }
    });

    it('rejects a limit above 50', async () => {
      const { response } = await search(acme, { limit: '51' });
      expect(response.statusCode).toBe(400);
    });
  });

  describe('keyset pagination', () => {
    it('walks every course exactly once, in title order', async () => {
      const walked: CourseSummary[] = [];
      let query: Record<string, string> | undefined = { limit: '7' };
      while (query) {
        const { page } = await search(acme, query);
        expect(page.items.length).toBeLessThanOrEqual(7);
        walked.push(...page.items);
        query = page.nextCursor ? { limit: '7', cursor: page.nextCursor } : undefined;
      }

      const ids = walked.map(({ id }) => id);
      const titles = walked.map(({ title }) => title);
      const { page: onePage } = await search(acme, { limit: '50' });
      expect(new Set(ids).size).toBe(40); // all 40 courses, no duplicates
      expect(ids).toEqual(onePage.items.map(({ id }) => id)); // no gaps, and the same order
      expect(titles).toEqual([...titles].sort());
    });

    it('rejects a cursor it did not issue', async () => {
      const forged = Buffer.from(JSON.stringify({ title: 'x' })).toString('base64url');
      for (const cursor of ['not-a-cursor', forged]) {
        const { response } = await search(acme, { cursor });
        expect(response.statusCode).toBe(400);
        expect(response.headers['content-type']).toMatch(/^application\/problem\+json/);
      }
    });
  });

  describe('course detail', () => {
    it('returns the lessons in order, with the total duration', async () => {
      const response = await app.inject({ url: '/api/courses/crs-acme-001', headers: acme.auth });

      expect(response.statusCode).toBe(200);
      const course = response.json<Course>();
      expect(course).toMatchObject({
        id: 'crs-acme-001',
        title: 'Angular Signals in Practice',
        enrolled: false,
      });
      expect(course.lessons.length).toBeGreaterThanOrEqual(3);
      const total = course.lessons.reduce((sum, lesson) => sum + lesson.durationMinutes, 0);
      expect(course.durationMinutes).toBe(total);
    });

    it("is a 404 for another tenant's course, so its existence doesn't leak", async () => {
      const response = await app.inject({ url: '/api/courses/crs-globex-001', headers: acme.auth });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ status: 404, type: 'about:blank' });
    });

    it('answers If-None-Match with 304 while the ETag still matches', async () => {
      const first = await app.inject({ url: '/api/courses/crs-acme-002', headers: acme.auth });
      const etag = first.headers['etag'];
      expect(etag).toMatch(/^"[\w-]+"$/);
      expect(first.headers['cache-control']).toBe('private, no-cache');

      for (const ifNoneMatch of [etag, `W/${etag}`, `"other", ${etag}`]) {
        const revalidated = await app.inject({
          url: '/api/courses/crs-acme-002',
          headers: { ...acme.auth, 'if-none-match': ifNoneMatch },
        });
        expect(revalidated.statusCode).toBe(304);
        expect(revalidated.body).toBe('');
        expect(revalidated.headers['etag']).toBe(etag);
      }
    });

    it('changes the ETag when the caller enrolls, since `enrolled` is in the body', async () => {
      const before = await app.inject({ url: '/api/courses/crs-acme-003', headers: acme.auth });
      await app.inject({
        method: 'POST',
        url: '/api/enrollments',
        headers: { ...acme.auth, 'idempotency-key': 'etag-test-0001' },
        payload: { courseId: 'crs-acme-003' },
      });

      const after = await app.inject({
        url: '/api/courses/crs-acme-003',
        headers: { ...acme.auth, 'if-none-match': before.headers['etag'] },
      });
      expect(after.statusCode).toBe(200);
      expect(after.json<Course>().enrolled).toBe(true);
      expect(after.headers['etag']).not.toBe(before.headers['etag']);
    });
  });
});
