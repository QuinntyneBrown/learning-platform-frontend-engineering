import { randomBytes } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { transaction } from '../db';
import { sha256 } from '../hash';

export const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

type Rotation =
  | { ok: true; userId: string; token: string }
  | { ok: false; reason: 'unknown' | 'expired' | 'reused' };

type RefreshTokenRow = { user_id: string; expires_at: number; revoked_at: number | null };

/** Creates an opaque token for the cookie. Only its hash is stored. */
export function issueRefreshToken(db: DatabaseSync, userId: string, now = Date.now()): string {
  const token = randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO refresh_tokens (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(
    sha256(token),
    userId,
    now + REFRESH_TOKEN_TTL_SECONDS * 1000,
  );
  return token;
}

/** Spends a refresh token and issues its replacement. Each token works exactly once. */
export function rotateRefreshToken(
  db: DatabaseSync,
  presented: string,
  now = Date.now(),
): Rotation {
  const row = db
    .prepare('SELECT user_id, expires_at, revoked_at FROM refresh_tokens WHERE token_hash = ?')
    .get(sha256(presented)) as RefreshTokenRow | undefined;

  if (!row) return { ok: false, reason: 'unknown' };

  if (row.revoked_at !== null) {
    // Reuse detection: a spent token coming back means two parties hold it, and we can't tell
    // which one is the thief. Revoke every token the user has, so both must sign in again.
    // (Two tabs refreshing with the same cookie at once would also land here; the web app
    // single-flights its refresh, and some systems allow a few seconds' grace instead.)
    db.prepare(
      'UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL',
    ).run(now, row.user_id);
    return { ok: false, reason: 'reused' };
  }

  if (row.expires_at <= now) return { ok: false, reason: 'expired' };

  return transaction(db, () => {
    revokeRefreshToken(db, presented, now);
    return { ok: true, userId: row.user_id, token: issueRefreshToken(db, row.user_id, now) };
  });
}

export function revokeRefreshToken(db: DatabaseSync, token: string, now = Date.now()): void {
  db.prepare(
    'UPDATE refresh_tokens SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL',
  ).run(now, sha256(token));
}
