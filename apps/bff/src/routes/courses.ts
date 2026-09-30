import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import type { FastifyPluginAsync } from 'fastify';
import type { components } from '@coursewright/contracts';
import { sha256 } from '../hash';
import { sendProblem } from '../problem';

type Course = components['schemas']['Course'];
type CoursePage = components['schemas']['CoursePage'];
type CourseSummary = components['schemas']['CourseSummary'];

type CourseSummaryRow = {
  id: string;
  title: string;
  summary: string;
  level: CourseSummary['level'];
  duration_minutes: number;
};
type CourseRow = CourseSummaryRow & { description: string; updated_at: string };
type LessonRow = { id: string; title: string; duration_minutes: number };

/** Where the previous page ended, in sort order. */
type SortKey = { title: string; id: string };

const SUMMARY_COLUMNS = `
  c.id, c.title, c.summary, c.level,
  (SELECT SUM(l.duration_minutes) FROM lessons l WHERE l.course_id = c.id) AS duration_minutes`;

// Request bodies use the contract's schemas; query strings are small, so they're written out here.
const searchQuerySchema = {
  type: 'object',
  properties: {
    q: { type: 'string', maxLength: 100 },
    cursor: { type: 'string' },
    limit: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
  },
} as const;

export const courseRoutes: FastifyPluginAsync<{ db: DatabaseSync }> = async (app, { db }) => {
  app.get<{ Querystring: { q?: string; cursor?: string; limit: number } }>(
    '/courses',
    { schema: { querystring: searchQuerySchema } },
    async (request, reply) => {
      const { q = '', cursor, limit } = request.query;
      const after = cursor === undefined ? undefined : decodeCursor(cursor);
      if (cursor !== undefined && !after) {
        return sendProblem(reply, {
          status: 400,
          detail: 'The cursor is invalid. Pass back nextCursor unchanged.',
        });
      }

      // Ask for one extra row: if it comes back, there is another page.
      const rows = searchCourses(db, {
        tenantId: request.user.tenantId,
        q,
        after,
        limit: limit + 1,
      });
      const items = rows.slice(0, limit).map(toCourseSummary);
      const last = items.at(-1);
      const page: CoursePage = {
        items,
        nextCursor: rows.length > limit && last ? encodeCursor(last) : null,
      };
      return page;
    },
  );

  app.get<{ Params: { courseId: string } }>('/courses/:courseId', async (request, reply) => {
    const { courseId } = request.params;
    const { id: userId, tenantId } = request.user;

    const row = db
      .prepare(
        `SELECT ${SUMMARY_COLUMNS}, c.description, c.updated_at
         FROM courses c
         WHERE c.id = ? AND c.tenant_id = ?`,
      )
      .get(courseId, tenantId) as CourseRow | undefined;
    // 404, not 403: to another tenant this course doesn't exist, and a 403 would confirm it does.
    if (!row) {
      return sendProblem(reply, { status: 404, detail: 'There is no course with that id.' });
    }

    const lessons = db
      .prepare(
        'SELECT id, title, duration_minutes FROM lessons WHERE course_id = ? ORDER BY position',
      )
      .all(courseId) as LessonRow[];
    const enrolled = db
      .prepare('SELECT 1 FROM enrollments WHERE user_id = ? AND course_id = ?')
      .get(userId, courseId);

    const course: Course = {
      ...toCourseSummary(row),
      description: row.description,
      lessons: lessons.map((lesson) => ({
        id: lesson.id,
        title: lesson.title,
        durationMinutes: lesson.duration_minutes,
      })),
      updatedAt: row.updated_at,
      enrolled: enrolled !== undefined,
    };

    // Hash the exact bytes we send, so the ETag changes whenever the body does, `enrolled`
    // included. A 304 saves the transfer and the client's parse, not the query.
    const body = JSON.stringify(course);
    const etag = `"${sha256(body)}"`;
    // `private`: the body is per-user, so shared caches must not keep it.
    // `no-cache`: the browser may keep it but must revalidate first, which the ETag makes cheap.
    reply.header('etag', etag).header('cache-control', 'private, no-cache');

    if (matchesIfNoneMatch(request.headers['if-none-match'], etag)) {
      return reply.code(304).send();
    }
    return reply.type('application/json; charset=utf-8').send(body);
  });
};

/**
 * Keyset pagination, not OFFSET: each page seeks straight to where the last one ended using the
 * (tenant_id, title, id) index, so page 50 costs the same as page 1, and rows added or removed
 * meanwhile can't shift later pages into duplicates or gaps. `id` breaks ties between equal titles.
 */
function searchCourses(
  db: DatabaseSync,
  { tenantId, q, after, limit }: { tenantId: string; q: string; after?: SortKey; limit: number },
): CourseSummaryRow[] {
  const where = ['c.tenant_id = ?', "c.title LIKE ? ESCAPE '\\'"];
  const params: SQLInputValue[] = [tenantId, `%${escapeLike(q)}%`];
  if (after) {
    where.push('(c.title, c.id) > (?, ?)'); // SQLite row values compare title first, then id
    params.push(after.title, after.id);
  }
  const sql = `
    SELECT ${SUMMARY_COLUMNS}
    FROM courses c
    WHERE ${where.join(' AND ')}
    ORDER BY c.title, c.id
    LIMIT ?`;
  return db.prepare(sql).all(...params, limit) as CourseSummaryRow[];
}

/** Makes `%` and `_` in the user's text match literally instead of acting as LIKE wildcards. */
function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (char) => `\\${char}`);
}

// Cursors are opaque to clients (base64url JSON), so the sort key can change without breaking them.
function encodeCursor({ title, id }: SortKey): string {
  return Buffer.from(JSON.stringify([title, id])).toString('base64url');
}

function decodeCursor(cursor: string): SortKey | undefined {
  try {
    const value: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (Array.isArray(value) && value.length === 2) {
      const [title, id] = value as unknown[];
      if (typeof title === 'string' && typeof id === 'string') return { title, id };
    }
  } catch {
    // Not base64url JSON: fall through to "invalid".
  }
  return undefined;
}

/** If-None-Match uses weak comparison (W/"x" matches "x"), and may list several tags or be *. */
function matchesIfNoneMatch(header: string | undefined, etag: string): boolean {
  if (!header) return false;
  return header.split(',').some((candidate) => {
    const tag = candidate.trim().replace(/^W\//, '');
    return tag === '*' || tag === etag;
  });
}

function toCourseSummary(row: CourseSummaryRow): CourseSummary {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    level: row.level,
    durationMinutes: row.duration_minutes,
  };
}
