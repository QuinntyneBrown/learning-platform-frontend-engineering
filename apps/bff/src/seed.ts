import type { DatabaseSync } from 'node:sqlite';
import type { components } from '@coursewright/contracts';
import { hashPassword } from './auth/passwords';
import { transaction } from './db';

type CourseLevel = components['schemas']['CourseLevel'];
type Role = components['schemas']['Role'];

// Deterministic on purpose: the web app's E2E tests rely on these exact values on every start.
export const SEED_PASSWORD = 'Coursewright2026!';

const TENANTS = [
  { id: 'acme', name: 'Acme Corp' },
  { id: 'globex', name: 'Globex Industries' },
];

const USERS: {
  id: string;
  username: string;
  displayName: string;
  tenantId: string;
  roles: Role[];
}[] = [
  {
    id: 'usr-acme-learner',
    username: 'learner.acme',
    displayName: 'Riley Chen',
    tenantId: 'acme',
    roles: ['learner'],
  },
  {
    id: 'usr-acme-manager',
    username: 'manager.acme',
    displayName: 'Morgan Patel',
    tenantId: 'acme',
    roles: ['learner', 'manager'],
  },
  {
    id: 'usr-globex-learner',
    username: 'learner.globex',
    displayName: 'Sam Okafor',
    tenantId: 'globex',
    roles: ['learner'],
  },
  {
    id: 'usr-globex-manager',
    username: 'manager.globex',
    displayName: 'Jordan Rivera',
    tenantId: 'globex',
    roles: ['learner', 'manager'],
  },
];

/** A tenant's titles: the pinned ones, then "<topic> <suffix>" combinations up to `count`. */
type Catalog = {
  tenantId: string;
  count: number;
  pinned: string[];
  topics: string[];
  suffixes: string[];
};

const CATALOGS: Catalog[] = [
  {
    tenantId: 'acme',
    count: 40,
    pinned: [
      'Angular Signals in Practice',
      'Accessibility Fundamentals',
      'Reactive Forms Deep Dive',
    ],
    topics: [
      'Accessibility',
      'TypeScript',
      'RxJS',
      'Web Performance',
      'CSS Layout',
      'Design Systems',
      'Component Testing',
      'API Design',
      'Web Security',
      'Observability',
    ],
    suffixes: ['Fundamentals', 'in Practice', 'Deep Dive', 'for Teams'],
  },
  {
    tenantId: 'globex',
    count: 20,
    pinned: ['Workplace Safety Essentials'],
    topics: [
      'Workplace Safety',
      'Forklift Operation',
      'Lean Manufacturing',
      'Quality Control',
      'Hazard Communication',
      'First Aid',
      'Team Leadership',
      'Customer Service',
    ],
    suffixes: ['Essentials', 'Refresher', 'in Practice'],
  },
];

const LEVELS: CourseLevel[] = ['beginner', 'intermediate', 'advanced'];

const LESSON_TITLES = [
  'Why it matters',
  'Core concepts',
  'A guided walkthrough',
  'Hands-on exercise',
  'Common pitfalls',
  'A real-world case study',
  'Going further',
  'Recap and quiz',
];

// Managers have some history so the completions report isn't empty. learner.acme has none:
// E2E enrolls that user from scratch on every run.
const ENROLLMENTS = [
  { userId: 'usr-acme-manager', courseId: 'crs-acme-002', enrolledAt: '2026-09-01T09:00:00.000Z' },
  { userId: 'usr-acme-manager', courseId: 'crs-acme-003', enrolledAt: '2026-09-08T14:30:00.000Z' },
  { userId: 'usr-acme-manager', courseId: 'crs-acme-010', enrolledAt: '2026-09-15T10:15:00.000Z' },
  {
    userId: 'usr-globex-manager',
    courseId: 'crs-globex-001',
    enrolledAt: '2026-09-02T08:00:00.000Z',
  },
  {
    userId: 'usr-globex-manager',
    courseId: 'crs-globex-005',
    enrolledAt: '2026-09-09T16:45:00.000Z',
  },
  {
    userId: 'usr-globex-learner',
    courseId: 'crs-globex-001',
    enrolledAt: '2026-09-10T11:20:00.000Z',
  },
];

export function seed(db: DatabaseSync): void {
  const insertTenant = db.prepare('INSERT INTO tenants (id, name) VALUES (?, ?)');
  const insertUser = db.prepare(
    `INSERT INTO users (id, tenant_id, username, display_name, roles, password_hash)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const insertCourse = db.prepare(
    `INSERT INTO courses (id, tenant_id, title, summary, description, level, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertLesson = db.prepare(
    'INSERT INTO lessons (id, course_id, position, title, duration_minutes) VALUES (?, ?, ?, ?, ?)',
  );
  const insertEnrollment = db.prepare(
    'INSERT INTO enrollments (id, user_id, course_id, enrolled_at) VALUES (?, ?, ?, ?)',
  );

  transaction(db, () => {
    for (const tenant of TENANTS) insertTenant.run(tenant.id, tenant.name);

    for (const user of USERS) {
      insertUser.run(
        user.id,
        user.tenantId,
        user.username,
        user.displayName,
        JSON.stringify(user.roles),
        hashPassword(SEED_PASSWORD),
      );
    }

    for (const catalog of CATALOGS) {
      catalogTitles(catalog).forEach((title, i) => {
        const id = `crs-${catalog.tenantId}-${String(i + 1).padStart(3, '0')}`;
        const level = LEVELS[i % LEVELS.length] ?? 'beginner';
        const lessonCount = 3 + ((i * 5) % 6); // 3 to 8
        const summary = `A ${level} course in ${lessonCount} short lessons.`;
        const description =
          `${title} is a self-paced course. Each lesson pairs a short explanation with a ` +
          'hands-on exercise, and the last one recaps the key ideas.';
        const updatedAt = new Date(Date.UTC(2026, 0, 1 + i, 9)).toISOString();
        insertCourse.run(id, catalog.tenantId, title, summary, description, level, updatedAt);

        for (let position = 1; position <= lessonCount; position++) {
          const minutes = 5 + ((i * 3 + position * 7) % 20);
          insertLesson.run(
            `${id}-lesson-${position}`,
            id,
            position,
            LESSON_TITLES[position - 1] ?? 'Lesson',
            minutes,
          );
        }
      });
    }

    ENROLLMENTS.forEach((enrollment, i) => {
      insertEnrollment.run(
        `enr-seed-${i + 1}`,
        enrollment.userId,
        enrollment.courseId,
        enrollment.enrolledAt,
      );
    });
  });
}

function catalogTitles(catalog: Catalog): string[] {
  const generated = catalog.suffixes.flatMap((suffix) =>
    catalog.topics.map((topic) => `${topic} ${suffix}`),
  );
  return [...new Set([...catalog.pinned, ...generated])].slice(0, catalog.count);
}
