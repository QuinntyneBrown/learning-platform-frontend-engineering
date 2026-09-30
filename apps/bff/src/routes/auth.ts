import type { DatabaseSync } from 'node:sqlite';
import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import type { components } from '@coursewright/contracts';
import type { AccessTokens } from '../auth/access-tokens';
import { DUMMY_PASSWORD_HASH, verifyPassword } from '../auth/passwords';
import {
  issueRefreshToken,
  REFRESH_TOKEN_TTL_SECONDS,
  revokeRefreshToken,
  rotateRefreshToken,
} from '../auth/refresh-tokens';
import { sendProblem } from '../problem';

type LoginRequest = components['schemas']['LoginRequest'];
type Session = components['schemas']['Session'];
type User = components['schemas']['User'];

type UserRow = {
  id: string;
  username: string;
  display_name: string;
  tenant_id: string;
  tenant_name: string;
  roles: string;
};

const REFRESH_COOKIE = 'cw_refresh';

export const authRoutes: FastifyPluginAsync<{
  db: DatabaseSync;
  tokens: AccessTokens;
  secureCookies: boolean;
}> = async (app, { db, tokens, secureCookies }) => {
  // httpOnly: page scripts, and so XSS, can't read it. SameSite=Strict: the browser never sends it
  // cross-site, which is the CSRF defence for /refresh and /logout. Path: only /api/auth gets it.
  const cookieOptions = {
    httpOnly: true,
    sameSite: 'strict',
    secure: secureCookies,
    path: '/api/auth',
  } as const;

  async function startSession(
    reply: FastifyReply,
    userId: string,
    refreshToken: string,
  ): Promise<Session> {
    const user = findUser(db, userId);
    reply
      .setCookie(REFRESH_COOKIE, refreshToken, {
        ...cookieOptions,
        maxAge: REFRESH_TOKEN_TTL_SECONDS,
      })
      .header('cache-control', 'no-store'); // responses that carry tokens must never be cached
    const accessToken = await tokens.sign({
      id: user.id,
      tenantId: user.tenantId,
      roles: user.roles,
    });
    return { accessToken, expiresIn: tokens.ttlSeconds, user };
  }

  app.post<{ Body: LoginRequest }>(
    '/auth/login',
    { config: { public: true }, schema: { body: { $ref: 'LoginRequest#' } } },
    async (request, reply) => {
      const { username, password } = request.body;
      const row = db
        .prepare('SELECT id, password_hash FROM users WHERE username = ?')
        .get(username) as { id: string; password_hash: string } | undefined;
      // Check a password even for unknown usernames, so timing doesn't reveal which exist.
      const valid = await verifyPassword(password, row?.password_hash ?? DUMMY_PASSWORD_HASH);
      if (!row || !valid) {
        return sendProblem(reply, {
          status: 401,
          detail: 'The username or password is incorrect.',
        });
      }
      return startSession(reply, row.id, issueRefreshToken(db, row.id));
    },
  );

  app.post('/auth/refresh', { config: { public: true } }, async (request, reply) => {
    const presented = request.cookies[REFRESH_COOKIE];
    const rotation = presented ? rotateRefreshToken(db, presented) : undefined;
    if (!rotation?.ok) {
      if (rotation?.reason === 'reused') {
        // Possibly a stolen token: a security event worth a warning.
        request.log.warn('refresh token reused; revoked every session for this user');
      }
      reply.clearCookie(REFRESH_COOKIE, cookieOptions);
      return sendProblem(reply, { status: 401, detail: 'The session has ended. Sign in again.' });
    }
    return startSession(reply, rotation.userId, rotation.token);
  });

  app.post('/auth/logout', { config: { public: true } }, async (request, reply) => {
    const presented = request.cookies[REFRESH_COOKIE];
    if (presented) revokeRefreshToken(db, presented);
    return reply.clearCookie(REFRESH_COOKIE, cookieOptions).code(204).send();
  });
};

function findUser(db: DatabaseSync, id: string): User {
  const row = db
    .prepare(
      `SELECT u.id, u.username, u.display_name, u.tenant_id, t.name AS tenant_name, u.roles
       FROM users u JOIN tenants t ON t.id = u.tenant_id
       WHERE u.id = ?`,
    )
    .get(id) as UserRow | undefined;
  if (!row) throw new Error(`User ${id} not found`);
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    tenantId: row.tenant_id,
    tenantName: row.tenant_name,
    roles: JSON.parse(row.roles) as User['roles'],
  };
}
