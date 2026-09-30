import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import type { FastifyInstance, InjectOptions, LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { components } from '@coursewright/contracts';
import { componentSchemas, type JsonSchema, loadContract, toSharedRefs } from '../src/contract';
import { SEED_PASSWORD } from '../src/seed';
import { buildTestApp, login, type TestSession } from './helpers';

type Job = components['schemas']['Job'];
type Method = 'get' | 'post';
type ResponseObject = { content?: Record<string, { schema: JsonSchema }> };
type Operation = { responses: Record<string, ResponseObject | { $ref: string }> };

// OpenAPI 3.1 schemas are JSON Schema 2020-12, so the Ajv 2020 build reads them as they are.
const contract = loadContract();
const ajv = new Ajv2020({ allErrors: true, allowUnionTypes: true });
addFormats(ajv);
for (const schema of componentSchemas(contract)) ajv.addSchema(schema);

/** The documented response for an operation and status, following `#/components/responses` refs. */
function documentedResponse(
  method: Method,
  path: string,
  status: number,
): ResponseObject | undefined {
  const operation = contract.paths[path]?.[method] as Operation | undefined;
  const response = operation?.responses[String(status)];
  if (response && '$ref' in response) {
    const name = response.$ref.replace('#/components/responses/', '');
    return contract.components.responses[name] as ResponseObject;
  }
  return response;
}

/** Fails unless this status, content type and body are all documented for the operation. */
function expectToMatchContract(
  response: LightMyRequestResponse,
  method: Method,
  path: string,
): void {
  const label = `${method.toUpperCase()} ${path} ${response.statusCode}`;
  const documented = documentedResponse(method, path, response.statusCode);
  expect(documented, `${label} is not in the contract`).toBeDefined();

  if (!documented?.content) {
    expect(response.body, `${label} documents no body`).toBe('');
    return;
  }
  const mediaType = String(response.headers['content-type']).split(';')[0] ?? '';
  const schema = documented.content[mediaType]?.schema;
  expect(schema, `${label} doesn't document ${mediaType}`).toBeDefined();

  const validate = ajv.compile(toSharedRefs(schema) as JsonSchema);
  const body: unknown = mediaType.endsWith('json') ? response.json() : response.body;
  expect(validate(body), `${label}: ${ajv.errorsText(validate.errors)}`).toBe(true);
}

describe('contract: real responses match openapi.yaml', () => {
  let app: FastifyInstance;
  let learner: TestSession;
  let manager: TestSession;
  const exercised = new Set<string>();

  beforeAll(async () => {
    app = await buildTestApp();
    learner = await login(app, 'learner.acme');
    manager = await login(app, 'manager.acme');
  });
  afterAll(() => app.close());

  type CallOptions = Omit<InjectOptions, 'method' | 'url' | 'path'> & {
    session?: TestSession;
    params?: Record<string, string>;
  };

  /** Calls a path template from the contract and checks the response against it. */
  async function expectCall(
    status: number,
    method: Method,
    path: string,
    options: CallOptions = {},
  ) {
    const { session, params = {}, headers, ...rest } = options;
    const url = `/api${path.replace(/\{(\w+)\}/g, (_match, name: string) => params[name] ?? '')}`;
    const response = await app.inject({
      ...rest,
      method: method.toUpperCase() as 'GET' | 'POST',
      url,
      headers: { ...session?.auth, ...headers },
    });

    expect(response.statusCode, `${method.toUpperCase()} ${url}: ${response.body}`).toBe(status);
    expectToMatchContract(response, method, path);
    exercised.add(`${method} ${path} ${status}`);
    return response;
  }

  it('observability', async () => {
    await expectCall(200, 'get', '/health');
    const beacon = {
      events: [{ kind: 'error', name: 'TypeError', message: 'x is undefined', url: '/courses' }],
    };
    await expectCall(202, 'post', '/rum', { payload: beacon });
    await expectCall(400, 'post', '/rum', { payload: { events: 'none' } });
  });

  it('auth', async () => {
    const credentials = { username: 'learner.globex', password: SEED_PASSWORD };
    const signedIn = await expectCall(200, 'post', '/auth/login', { payload: credentials });
    await expectCall(400, 'post', '/auth/login', { payload: { username: 'learner.globex' } });
    await expectCall(401, 'post', '/auth/login', {
      payload: { ...credentials, password: 'wrong' },
    });

    const cookies = {
      cw_refresh: signedIn.cookies.find(({ name }) => name === 'cw_refresh')?.value ?? '',
    };
    await expectCall(200, 'post', '/auth/refresh', { cookies });
    await expectCall(401, 'post', '/auth/refresh', { cookies }); // already spent
    await expectCall(204, 'post', '/auth/logout');
  });

  it('catalog', async () => {
    await expectCall(200, 'get', '/courses', {
      session: learner,
      query: { q: 'in practice', limit: '3' },
    });
    await expectCall(400, 'get', '/courses', {
      session: learner,
      query: { cursor: 'not-a-cursor' },
    });
    await expectCall(401, 'get', '/courses');

    const params = { courseId: 'crs-acme-001' };
    const course = await expectCall(200, 'get', '/courses/{courseId}', {
      session: learner,
      params,
    });
    const ifNoneMatch = { 'if-none-match': String(course.headers['etag']) };
    await expectCall(304, 'get', '/courses/{courseId}', {
      session: learner,
      params,
      headers: ifNoneMatch,
    });
    await expectCall(401, 'get', '/courses/{courseId}', { params });
    await expectCall(404, 'get', '/courses/{courseId}', {
      session: learner,
      params: { courseId: 'crs-globex-001' },
    });
  });

  it('enrollments', async () => {
    const enroll = (key: string, courseId: string) => ({
      session: learner,
      headers: { 'idempotency-key': key },
      payload: { courseId },
    });
    await expectCall(201, 'post', '/enrollments', enroll('contract-key-1', 'crs-acme-005'));
    // The same key and body again: a replay of the first 201.
    await expectCall(201, 'post', '/enrollments', enroll('contract-key-1', 'crs-acme-005'));
    await expectCall(422, 'post', '/enrollments', enroll('contract-key-1', 'crs-acme-006'));
    await expectCall(409, 'post', '/enrollments', enroll('contract-key-2', 'crs-acme-005'));
    await expectCall(404, 'post', '/enrollments', enroll('contract-key-3', 'crs-globex-001'));
    await expectCall(400, 'post', '/enrollments', {
      session: learner,
      payload: { courseId: 'crs-acme-006' },
    });
    await expectCall(401, 'post', '/enrollments', { payload: { courseId: 'crs-acme-006' } });

    await expectCall(200, 'get', '/me/enrollments', { session: learner });
    await expectCall(401, 'get', '/me/enrollments');
  });

  it('jobs', async () => {
    const completions = { type: 'completions' };
    await expectCall(400, 'post', '/reports', { session: manager, payload: { type: 'grades' } });
    await expectCall(401, 'post', '/reports', { payload: completions });
    await expectCall(403, 'post', '/reports', { session: learner, payload: completions });

    // This job never completes, so its result is a 409 whenever we ask.
    const failing = await expectCall(202, 'post', '/reports', {
      session: manager,
      payload: { ...completions, failAttempts: 5 },
    });
    await expectCall(409, 'get', '/jobs/{jobId}/result', {
      session: manager,
      params: { jobId: failing.json<Job>().id },
    });

    const accepted = await expectCall(202, 'post', '/reports', {
      session: manager,
      payload: completions,
    });
    const params = { jobId: accepted.json<Job>().id };
    const jobStatus = async () => {
      const response = await app.inject({
        url: `/api/jobs/${params.jobId}`,
        headers: manager.auth,
      });
      return response.json<Job>().status;
    };
    await expect.poll(jobStatus).toBe('completed');

    for (const path of ['/jobs/{jobId}', '/jobs/{jobId}/events', '/jobs/{jobId}/result']) {
      await expectCall(200, 'get', path, { session: manager, params });
      await expectCall(401, 'get', path, { params });
      await expectCall(404, 'get', path, { session: learner, params }); // not the job's owner
    }
  });

  it('covers every response the contract documents', () => {
    const documented = Object.entries(contract.paths).flatMap(([path, operations]) =>
      Object.entries(operations as Record<string, Operation>).flatMap(([method, { responses }]) =>
        Object.keys(responses).map((status) => `${method} ${path} ${status}`),
      ),
    );
    expect([...exercised].sort()).toEqual(documented.sort());
  });
});
