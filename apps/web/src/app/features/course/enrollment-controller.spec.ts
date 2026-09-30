import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { Enrollment } from '@cw/core';
import { EnrollmentController, backoff } from './enrollment-controller';

const enrollment: Enrollment = {
  id: 'e1',
  courseId: 'c1',
  courseTitle: 'Angular Signals in Practice',
  userId: 'u1',
  status: 'active',
  enrolledAt: '2026-09-30T12:00:00Z',
};

describe('EnrollmentController', () => {
  let controller: EnrollmentController;
  let http: HttpTestingController;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [EnrollmentController, provideHttpClient(), provideHttpClientTesting()],
    });
    controller = TestBed.inject(EnrollmentController);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  it('sends one request for a double-click (exhaustMap ignores the second intent)', () => {
    controller.enroll('c1');
    controller.enroll('c1');

    const request = http.expectOne('/api/enrollments');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ courseId: 'c1' });
    expect(controller.status()).toBe('pending');

    request.flush(enrollment, { status: 201, statusText: 'Created' });
    expect(controller.status()).toBe('enrolled');
  });

  it('retries a 5xx with the same Idempotency-Key', () => {
    controller.enroll('c1');
    const first = http.expectOne('/api/enrollments');
    const key = first.request.headers.get('Idempotency-Key');
    expect(key).toMatch(/^[0-9a-f-]{36}$/);

    first.flush(null, { status: 503, statusText: 'Service Unavailable' });
    vi.advanceTimersByTime(backoff(1));

    const retry = http.expectOne('/api/enrollments');
    expect(retry.request.headers.get('Idempotency-Key')).toBe(key);
    retry.flush(enrollment, { status: 201, statusText: 'Created' });
    expect(controller.status()).toBe('enrolled');
  });

  it('uses a new key for a new intent', () => {
    controller.enroll('c1');
    const first = http.expectOne('/api/enrollments');
    first.flush(
      { type: '/problems/not-found', title: 'Not found', status: 404, detail: 'No such course.' },
      { status: 404, statusText: 'Not Found' },
    );
    expect(controller.status()).toBe('error');
    expect(controller.error()).toBe('No such course.');

    controller.enroll('c1');
    const second = http.expectOne('/api/enrollments');
    expect(second.request.headers.get('Idempotency-Key')).not.toBe(
      first.request.headers.get('Idempotency-Key'),
    );
    second.flush(enrollment, { status: 201, statusText: 'Created' });
  });

  it('treats 409 (already enrolled) as enrolled', () => {
    controller.enroll('c1');
    http
      .expectOne('/api/enrollments')
      .flush(
        { type: '/problems/already-enrolled', title: 'Already enrolled', status: 409 },
        { status: 409, statusText: 'Conflict' },
      );
    expect(controller.status()).toBe('enrolled');
  });
});
