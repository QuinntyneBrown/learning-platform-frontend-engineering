import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { type AppOptions, buildApp } from '../src/app';
import { SEED_PASSWORD } from '../src/seed';

/** An app whose report jobs take milliseconds instead of seconds. */
export function buildTestApp(options: AppOptions = {}): Promise<FastifyInstance> {
  return buildApp({ jobStepMs: 2, retryBaseMs: 2, ...options });
}

export interface TestSession {
  accessToken: string;
  refreshCookie: string;
  /** Spread into `headers` to call as this user. */
  auth: { authorization: string };
}

export async function login(app: FastifyInstance, username: string): Promise<TestSession> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { username, password: SEED_PASSWORD },
  });
  if (response.statusCode !== 200) throw new Error(`Login as ${username} failed: ${response.body}`);
  const { accessToken } = response.json<{ accessToken: string }>();
  return {
    accessToken,
    refreshCookie: refreshCookieFrom(response),
    auth: { authorization: `Bearer ${accessToken}` },
  };
}

export function refreshCookieFrom(response: LightMyRequestResponse): string {
  const cookie = response.cookies.find(({ name }) => name === 'cw_refresh');
  if (!cookie) throw new Error('No cw_refresh cookie in the response');
  return cookie.value;
}
