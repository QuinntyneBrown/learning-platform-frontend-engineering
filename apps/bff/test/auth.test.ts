import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SEED_PASSWORD } from '../src/seed';
import { buildTestApp, login, refreshCookieFrom } from './helpers';

describe('auth', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildTestApp();
  });
  afterAll(() => app.close());

  const refresh = (cookie?: string) =>
    app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      cookies: cookie ? { cw_refresh: cookie } : {},
    });

  it('signs in and sets an httpOnly, SameSite=Strict refresh cookie', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'manager.acme', password: SEED_PASSWORD },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.json()).toMatchObject({
      expiresIn: 900,
      user: {
        username: 'manager.acme',
        displayName: 'Morgan Patel',
        tenantId: 'acme',
        tenantName: 'Acme Corp',
        roles: ['learner', 'manager'],
      },
    });
    expect(response.cookies.find(({ name }) => name === 'cw_refresh')).toMatchObject({
      httpOnly: true,
      sameSite: 'Strict',
      path: '/api/auth',
      maxAge: 7 * 24 * 60 * 60,
    });
  });

  it.each([
    ['a wrong password', { username: 'learner.acme', password: 'wrong' }],
    ['an unknown user', { username: 'nobody', password: SEED_PASSWORD }],
  ])('rejects %s with the same 401 problem', async (_case, payload) => {
    const response = await app.inject({ method: 'POST', url: '/api/auth/login', payload });

    expect(response.statusCode).toBe(401);
    expect(response.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(response.json()).toMatchObject({
      status: 401,
      detail: 'The username or password is incorrect.',
    });
  });

  it('rejects a malformed login body with 400', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'x' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ status: 400, title: 'Bad Request' });
  });

  it('rotates the refresh token, and reusing a spent one revokes every session', async () => {
    const { refreshCookie: first } = await login(app, 'learner.acme');

    const rotated = await refresh(first);
    expect(rotated.statusCode).toBe(200);
    const second = refreshCookieFrom(rotated);
    expect(second).not.toBe(first);

    const rotatedAgain = await refresh(second);
    expect(rotatedAgain.statusCode).toBe(200);
    const third = refreshCookieFrom(rotatedAgain);

    // A thief replays the first token: it's rejected, and so is the legitimate latest one.
    expect((await refresh(first)).statusCode).toBe(401);
    expect((await refresh(third)).statusCode).toBe(401);
  });

  it('issues an access token that works on protected routes after a refresh', async () => {
    const { refreshCookie } = await login(app, 'learner.globex');
    const { accessToken } = (await refresh(refreshCookie)).json<{ accessToken: string }>();

    const response = await app.inject({
      url: '/api/me/enrollments',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(response.statusCode).toBe(200);
  });

  it('rejects a refresh without a cookie and clears the cookie', async () => {
    const response = await refresh();

    expect(response.statusCode).toBe(401);
    expect(response.cookies.find(({ name }) => name === 'cw_refresh')?.value).toBe('');
  });

  it('logs out by revoking the refresh token, and always answers 204', async () => {
    const { refreshCookie } = await login(app, 'manager.globex');

    const loggedOut = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      cookies: { cw_refresh: refreshCookie },
    });
    expect(loggedOut.statusCode).toBe(204);
    expect((await refresh(refreshCookie)).statusCode).toBe(401);

    const withoutCookie = await app.inject({ method: 'POST', url: '/api/auth/logout' });
    expect(withoutCookie.statusCode).toBe(204);
  });

  describe('bearer tokens', () => {
    it('rejects a request without one', async () => {
      const response = await app.inject({ url: '/api/me/enrollments' });

      expect(response.statusCode).toBe(401);
      expect(response.headers['www-authenticate']).toBe('Bearer');
      expect(response.json()).toMatchObject({ type: 'about:blank', status: 401 });
    });

    it('rejects a malformed token', async () => {
      const response = await app.inject({
        url: '/api/me/enrollments',
        headers: { authorization: 'Bearer not-a-jwt' },
      });
      expect(response.statusCode).toBe(401);
    });

    it('rejects a token signed with another key', async () => {
      const other = await buildTestApp({ jwtSecret: 'a-different-secret-that-is-long-enough' });
      const { auth } = await login(other, 'learner.acme');
      await other.close();

      const response = await app.inject({ url: '/api/me/enrollments', headers: auth });
      expect(response.statusCode).toBe(401);
    });

    it('rejects an expired token', async () => {
      const shortLived = await buildTestApp({ accessTokenTtlSeconds: 0 });
      const { auth } = await login(shortLived, 'learner.acme');

      const response = await shortLived.inject({ url: '/api/me/enrollments', headers: auth });
      await shortLived.close();
      expect(response.statusCode).toBe(401);
    });
  });
});
