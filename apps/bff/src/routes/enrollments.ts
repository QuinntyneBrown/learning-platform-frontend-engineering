import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { FastifyPluginAsync } from 'fastify';
import type { components } from '@coursewright/contracts';
import { transaction } from '../db';
import { sha256 } from '../hash';
import { sendProblem } from '../problem';

type Enrollment = components['schemas']['Enrollment'];
type EnrollmentList = components['schemas']['EnrollmentList'];
type EnrollmentRequest = components['schemas']['EnrollmentRequest'];

type EnrollmentRow = {
  id: string;
  course_id: string;
  course_title: string;
  user_id: string;
  enrolled_at: string;
};
type SavedResponse = { request_hash: string; status_code: number; response_body: string };

const enrollHeadersSchema = {
  type: 'object',
  required: ['idempotency-key'],
  properties: { 'idempotency-key': { type: 'string', minLength: 8, maxLength: 100 } },
} as const;

export const enrollmentRoutes: FastifyPluginAsync<{ db: DatabaseSync }> = async (app, { db }) => {
  /**
   * Idempotent per (user, Idempotency-Key): a retry after a timeout replays the first response
   * instead of enrolling twice.
   *
   * DatabaseSync is synchronous, so from the key lookup to the final insert nothing else runs in
   * this process: two requests with the same key can't interleave. With several instances sharing
   * a database, you'd insert the key row first, marked in progress, and let its primary key reject
   * the concurrent duplicate (answering 409 "in progress"), then save the response on that row.
   */
  app.post<{ Body: EnrollmentRequest; Headers: { 'idempotency-key': string } }>(
    '/enrollments',
    { schema: { headers: enrollHeadersSchema, body: { $ref: 'EnrollmentRequest#' } } },
    async (request, reply) => {
      const { id: userId, tenantId } = request.user;
      const key = request.headers['idempotency-key'];
      const { courseId } = request.body;
      // Hash the validated fields in a fixed order, so whitespace or key order in the raw body
      // can't make one request look like two.
      const requestHash = sha256(JSON.stringify({ courseId }));

      const saved = db
        .prepare(
          `SELECT request_hash, status_code, response_body
           FROM idempotency_keys
           WHERE user_id = ? AND key = ?`,
        )
        .get(userId, key) as SavedResponse | undefined;
      if (saved) {
        if (saved.request_hash !== requestHash) {
          return sendProblem(reply, {
            status: 422,
            type: '/problems/idempotency-key-reused',
            title: 'Idempotency key reused',
            detail:
              'This Idempotency-Key was already used for a different request. Create a new key.',
          });
        }
        return reply
          .code(saved.status_code)
          .header('idempotency-replayed', 'true')
          .type('application/json; charset=utf-8')
          .send(saved.response_body);
      }

      const course = db
        .prepare('SELECT title FROM courses WHERE id = ? AND tenant_id = ?')
        .get(courseId, tenantId) as { title: string } | undefined;
      if (!course) {
        return sendProblem(reply, { status: 404, detail: 'There is no course with that id.' });
      }

      const alreadyEnrolled = db
        .prepare('SELECT 1 FROM enrollments WHERE user_id = ? AND course_id = ?')
        .get(userId, courseId);
      if (alreadyEnrolled) {
        return sendProblem(reply, {
          status: 409,
          type: '/problems/already-enrolled',
          title: 'Already enrolled',
          detail: `You're already enrolled in ${course.title}.`,
        });
      }

      const enrollment: Enrollment = {
        id: `enr-${randomUUID()}`,
        courseId,
        courseTitle: course.title,
        userId,
        status: 'active',
        enrolledAt: new Date().toISOString(), // always UTC, with a Z
      };
      const body = JSON.stringify(enrollment);

      // The enrollment and its replayable response are saved together, or not at all.
      transaction(db, () => {
        db.prepare(
          'INSERT INTO enrollments (id, user_id, course_id, enrolled_at) VALUES (?, ?, ?, ?)',
        ).run(enrollment.id, userId, courseId, enrollment.enrolledAt);
        db.prepare(
          `INSERT INTO idempotency_keys
             (user_id, key, request_hash, status_code, response_body, created_at)
           VALUES (?, ?, ?, 201, ?, ?)`,
        ).run(userId, key, requestHash, body, enrollment.enrolledAt);
      });

      return reply.code(201).type('application/json; charset=utf-8').send(body);
    },
  );

  app.get('/me/enrollments', async (request) => {
    const rows = db
      .prepare(
        `SELECT e.id, e.course_id, c.title AS course_title, e.user_id, e.enrolled_at
         FROM enrollments e JOIN courses c ON c.id = e.course_id
         WHERE e.user_id = ?
         ORDER BY e.enrolled_at DESC, e.id DESC`,
      )
      .all(request.user.id) as EnrollmentRow[];

    const list: EnrollmentList = {
      items: rows.map((row) => ({
        id: row.id,
        courseId: row.course_id,
        courseTitle: row.course_title,
        userId: row.user_id,
        status: 'active',
        enrolledAt: row.enrolled_at,
      })),
    };
    return list;
  });
};
