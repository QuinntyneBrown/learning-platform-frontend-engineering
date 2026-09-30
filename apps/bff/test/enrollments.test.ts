import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { components } from '@coursewright/contracts';
import { buildTestApp, login, type TestSession } from './helpers';

type Enrollment = components['schemas']['Enrollment'];
type EnrollmentList = components['schemas']['EnrollmentList'];

describe('enrollments', () => {
  let app: FastifyInstance;
  let learner: TestSession;

  beforeAll(async () => {
    app = await buildTestApp();
    learner = await login(app, 'learner.acme');
  });
  afterAll(() => app.close());

  const enroll = (courseId: string, idempotencyKey?: string, session = learner) =>
    app.inject({
      method: 'POST',
      url: '/api/enrollments',
      headers: {
        ...session.auth,
        ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
      },
      payload: { courseId },
    });

  const myEnrollments = async (session = learner) =>
    (await app.inject({ url: '/api/me/enrollments', headers: session.auth })).json<EnrollmentList>()
      .items;

  it('starts learner.acme with no enrollments', async () => {
    expect(await myEnrollments()).toEqual([]);
  });

  it('enrolls once, and replays the same response for a retry with the same key', async () => {
    const created = await enroll('crs-acme-001', 'key-retry-0001');
    expect(created.statusCode).toBe(201);
    expect(created.headers['idempotency-replayed']).toBeUndefined();
    expect(created.json<Enrollment>()).toMatchObject({
      courseId: 'crs-acme-001',
      courseTitle: 'Angular Signals in Practice',
      userId: 'usr-acme-learner',
      status: 'active',
      enrolledAt: expect.stringMatching(/Z$/),
    });

    const replayed = await enroll('crs-acme-001', 'key-retry-0001');
    expect(replayed.statusCode).toBe(201);
    expect(replayed.headers['idempotency-replayed']).toBe('true');
    expect(replayed.body).toBe(created.body);

    const items = await myEnrollments();
    expect(items.filter(({ courseId }) => courseId === 'crs-acme-001')).toHaveLength(1);
  });

  it('rejects the same key with a different body as 422', async () => {
    const response = await enroll('crs-acme-002', 'key-retry-0001');

    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({
      type: '/problems/idempotency-key-reused',
      status: 422,
    });
  });

  it('rejects a second enrollment in the same course, with a new key, as 409', async () => {
    const response = await enroll('crs-acme-001', 'key-second-0001');

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ type: '/problems/already-enrolled', status: 409 });
  });

  it.each([
    ['missing', undefined],
    ['too short', 'short'],
  ])('rejects a %s Idempotency-Key with 400', async (_case, key) => {
    const response = await enroll('crs-acme-004', key);
    expect(response.statusCode).toBe(400);
  });

  it("is a 404 for another tenant's course", async () => {
    const response = await enroll('crs-globex-001', 'key-globex-0001');
    expect(response.statusCode).toBe(404);
  });

  it('lists enrollments newest first', async () => {
    const manager = await login(app, 'manager.acme');
    const items = await myEnrollments(manager);

    expect(items.map(({ courseId }) => courseId)).toEqual([
      'crs-acme-010',
      'crs-acme-003',
      'crs-acme-002',
    ]);
  });
});
