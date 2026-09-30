import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp } from './helpers';

const TRACE_ID = '4bf92f3577b34da6a3ce929d0e0e4736';
const PARENT_ID = '00f067aa0ba902b7';

describe('observability', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildTestApp();
  });
  afterAll(() => app.close());

  describe('trace context', () => {
    it('continues the caller trace with a new span, and puts its id in problems', async () => {
      const response = await app.inject({
        url: '/api/me/enrollments',
        headers: { traceparent: `00-${TRACE_ID}-${PARENT_ID}-01` },
      });

      const [version, traceId, spanId, flags] = String(response.headers['traceparent']).split('-');
      expect([version, traceId, flags]).toEqual(['00', TRACE_ID, '01']);
      expect(spanId).toMatch(/^[0-9a-f]{16}$/);
      expect(spanId).not.toBe(PARENT_ID);
      expect(response.json()).toMatchObject({ status: 401, traceId: TRACE_ID });
    });

    it.each([
      ['missing', undefined],
      ['malformed', 'garbage'],
      ['all-zero', `00-${'0'.repeat(32)}-${PARENT_ID}-01`],
    ])('starts a new trace when traceparent is %s', async (_case, traceparent) => {
      const response = await app.inject({
        url: '/api/health',
        headers: traceparent ? { traceparent } : {},
      });

      expect(response.headers['traceparent']).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
      expect(response.headers['traceparent']).not.toContain('0'.repeat(32));
    });
  });

  it.each(['/api/health', '/api/me/enrollments', '/api/nope'])(
    'adds Server-Timing to %s',
    async (url) => {
      const response = await app.inject({ url });
      expect(response.headers['server-timing']).toMatch(/^app;dur=\d+\.\d$/);
    },
  );

  it('answers the health check without a token', async () => {
    const response = await app.inject({ url: '/api/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });

  describe('RUM beacons', () => {
    const batch = {
      events: [{ kind: 'web-vital', name: 'LCP', value: 1234, rating: 'good', url: '/courses' }],
    };

    it('accepts JSON sent as application/json, without a token', async () => {
      const response = await app.inject({ method: 'POST', url: '/api/rum', payload: batch });
      expect(response.statusCode).toBe(202);
    });

    it('accepts JSON sent as text/plain, as navigator.sendBeacon does', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/rum',
        headers: { 'content-type': 'text/plain;charset=UTF-8' },
        payload: JSON.stringify(batch),
      });
      expect(response.statusCode).toBe(202);
    });

    it.each([
      ['text that is not JSON', 'text/plain', 'not json'],
      ['an empty batch', 'application/json', JSON.stringify({ events: [] })],
      [
        'an unknown event kind',
        'application/json',
        JSON.stringify({ events: [{ kind: 'click', name: 'x', url: '/' }] }),
      ],
    ])('rejects %s with a 400 problem', async (_case, contentType, payload) => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/rum',
        headers: { 'content-type': contentType },
        payload,
      });

      expect(response.statusCode).toBe(400);
      expect(response.headers['content-type']).toMatch(/^application\/problem\+json/);
    });
  });
});
