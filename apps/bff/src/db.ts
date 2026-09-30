import { DatabaseSync } from 'node:sqlite';

const SCHEMA = `
  CREATE TABLE tenants (
    id   TEXT PRIMARY KEY,
    name TEXT NOT NULL
  );

  CREATE TABLE users (
    id            TEXT PRIMARY KEY,
    tenant_id     TEXT NOT NULL REFERENCES tenants (id),
    username      TEXT NOT NULL UNIQUE,
    display_name  TEXT NOT NULL,
    roles         TEXT NOT NULL, -- JSON array, e.g. ["learner","manager"]
    password_hash TEXT NOT NULL  -- scrypt, "<salt>:<hash>"
  );

  CREATE TABLE courses (
    id          TEXT PRIMARY KEY,
    tenant_id   TEXT NOT NULL REFERENCES tenants (id),
    title       TEXT NOT NULL,
    summary     TEXT NOT NULL,
    description TEXT NOT NULL,
    level       TEXT NOT NULL CHECK (level IN ('beginner', 'intermediate', 'advanced')),
    updated_at  TEXT NOT NULL
  );

  -- Keyset pagination seeks to (title, id) within one tenant and reads forward in that order.
  -- This index makes each page a range scan, however deep the page is.
  CREATE INDEX courses_tenant_title_id ON courses (tenant_id, title, id);

  CREATE TABLE lessons (
    id               TEXT PRIMARY KEY,
    course_id        TEXT NOT NULL REFERENCES courses (id),
    position         INTEGER NOT NULL,
    title            TEXT NOT NULL,
    duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
    UNIQUE (course_id, position)
  );

  CREATE TABLE enrollments (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users (id),
    course_id   TEXT NOT NULL REFERENCES courses (id),
    enrolled_at TEXT NOT NULL,
    UNIQUE (user_id, course_id)
  );

  -- One row per (user, Idempotency-Key): the request's hash and the response to replay.
  -- created_at lets a sweeper expire keys after a day, as payment APIs do.
  CREATE TABLE idempotency_keys (
    user_id       TEXT NOT NULL REFERENCES users (id),
    key           TEXT NOT NULL,
    request_hash  TEXT NOT NULL,
    status_code   INTEGER NOT NULL,
    response_body TEXT NOT NULL,
    created_at    TEXT NOT NULL,
    PRIMARY KEY (user_id, key)
  );

  -- Only a hash of each refresh token is stored, so a leaked table can't be replayed.
  CREATE TABLE refresh_tokens (
    token_hash TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users (id),
    expires_at INTEGER NOT NULL, -- epoch ms
    revoked_at INTEGER           -- epoch ms; set once the token is used or logged out
  );
`;

export function createDatabase(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec(SCHEMA);
  return db;
}

/** Runs `work` atomically: every write inside it commits, or none do. */
export function transaction<T>(db: DatabaseSync, work: () => T): T {
  db.exec('BEGIN');
  try {
    const result = work();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
