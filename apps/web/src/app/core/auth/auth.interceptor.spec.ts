import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import type { Session } from '../api/models';
import { authInterceptor } from './auth.interceptor';
import { AuthStore } from './auth.store';

const session = (accessToken: string): Session => ({
  accessToken,
  expiresIn: 900,
  user: {
    id: 'u1',
    username: 'learner.acme',
    displayName: 'Riley Chen',
    tenantId: 't1',
    tenantName: 'Acme Corp',
    roles: ['learner'],
  },
});

const unauthorized = { status: 401, statusText: 'Unauthorized' };

describe('authInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  let auth: AuthStore;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthStore);

    auth.login({ username: 'learner.acme', password: 'secret' }).subscribe();
    backend.expectOne('/api/auth/login').flush(session('old-token'));
  });

  afterEach(() => backend.verify());

  it('sends the bearer token, but not to auth endpoints', () => {
    http.get('/api/courses').subscribe();
    http.post('/api/auth/logout', null).subscribe();

    expect(backend.expectOne('/api/courses').request.headers.get('Authorization')).toBe(
      'Bearer old-token',
    );
    expect(backend.expectOne('/api/auth/logout').request.headers.has('Authorization')).toBe(false);
  });

  it('refreshes once and retries once after a 401', () => {
    let body: unknown;
    http.get('/api/courses').subscribe((value) => (body = value));

    backend.expectOne('/api/courses').flush(null, unauthorized);
    backend.expectOne('/api/auth/refresh').flush(session('new-token'));

    const retry = backend.expectOne('/api/courses');
    expect(retry.request.headers.get('Authorization')).toBe('Bearer new-token');
    retry.flush({ items: [], nextCursor: null });
    expect(body).toEqual({ items: [], nextCursor: null });
  });

  it('shares one refresh between concurrent 401s', () => {
    http.get('/api/courses').subscribe();
    http.get('/api/me/enrollments').subscribe();

    backend.expectOne('/api/courses').flush(null, unauthorized);
    backend.expectOne('/api/me/enrollments').flush(null, unauthorized);
    // expectOne fails if the second 401 had started a second refresh.
    backend.expectOne('/api/auth/refresh').flush(session('new-token'));

    backend.expectOne('/api/courses').flush({ items: [], nextCursor: null });
    backend.expectOne('/api/me/enrollments').flush({ items: [] });
  });

  it('signs out and sends the user to the login page when the refresh fails', () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    let status: number | undefined;
    http.get('/api/courses').subscribe({ error: (error) => (status = error.status) });

    backend.expectOne('/api/courses').flush(null, unauthorized);
    backend.expectOne('/api/auth/refresh').flush(null, unauthorized);

    expect(auth.isAuthenticated()).toBe(false);
    expect(status).toBe(401);
    expect(String(navigate.mock.calls[0][0])).toBe('/login?returnUrl=%2F');
  });
});
