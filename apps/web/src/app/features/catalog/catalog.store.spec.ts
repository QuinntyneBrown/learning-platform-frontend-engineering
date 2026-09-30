import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { CoursePage } from '@cw/core';
import { CatalogStore } from './catalog.store';

const page = (...titles: string[]): CoursePage => ({
  items: titles.map((title, i) => ({
    id: `c${i}`,
    title,
    summary: '',
    level: 'beginner',
    durationMinutes: 30,
  })),
  nextCursor: null,
});

describe('CatalogStore', () => {
  let store: InstanceType<typeof CatalogStore>;
  let http: HttpTestingController;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [CatalogStore, provideHttpClient(), provideHttpClientTesting()],
    });
    store = TestBed.inject(CatalogStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  it('debounces rapid keystrokes into one request for the final query', () => {
    store.search('a');
    store.search('an');
    store.search('ang');
    vi.advanceTimersByTime(250);

    const request = http.expectOne((r) => r.url === '/api/courses');
    expect(request.request.params.get('q')).toBe('ang');
    request.flush(page('Angular Signals in Practice'));

    expect(store.status()).toBe('loaded');
    expect(store.items().map((c) => c.title)).toEqual(['Angular Signals in Practice']);
  });

  it('drops the slow response for an older query when a newer query is issued', () => {
    store.search('react');
    vi.advanceTimersByTime(250);
    const stale = http.expectOne((r) => r.params.get('q') === 'react');

    store.search('angular');
    vi.advanceTimersByTime(250);
    const fresh = http.expectOne((r) => r.params.get('q') === 'angular');

    // switchMap unsubscribed from the old request, which cancels it: it can never land.
    expect(stale.cancelled).toBe(true);
    fresh.flush(page('Angular Signals in Practice'));

    expect(store.query()).toBe('angular');
    expect(store.items().map((c) => c.title)).toEqual(['Angular Signals in Practice']);
  });

  it('keeps searching after a failed request', () => {
    store.search('a');
    vi.advanceTimersByTime(250);
    http
      .expectOne((r) => r.url === '/api/courses')
      .flush(
        { type: '/problems/unavailable', title: 'Unavailable', status: 503 },
        { status: 503, statusText: 'Service Unavailable' },
      );
    expect(store.status()).toBe('error');

    store.search('b');
    vi.advanceTimersByTime(250);
    http.expectOne((r) => r.params.get('q') === 'b').flush(page('Accessibility Fundamentals'));
    expect(store.status()).toBe('loaded');
  });
});
