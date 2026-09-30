import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { Job } from '@cw/core';
import { JobProgress, pollDelay } from './job-progress';
import { parseSse } from './sse';

const job = (status: Job['status'], progress: number): Job => ({
  id: 'j1',
  type: 'completions',
  status,
  progress,
  attempt: 1,
  maxAttempts: 3,
  createdAt: '2026-09-30T12:00:00Z',
  updatedAt: '2026-09-30T12:00:00Z',
  resultUrl: status === 'completed' ? '/api/jobs/j1/result' : null,
  error: null,
});

describe('parseSse', () => {
  it('parses several messages in one chunk, with id, event and multi-line data', () => {
    const { messages, rest } = parseSse(
      'id: 1\nevent: job\ndata: {"a":1}\n\nid: 2\nevent: job\ndata: line one\ndata: line two\n\n',
    );
    expect(messages).toEqual([
      { id: '1', event: 'job', data: '{"a":1}' },
      { id: '2', event: 'job', data: 'line one\nline two' },
    ]);
    expect(rest).toBe('');
  });

  it('keeps a message split mid-line until the rest arrives', () => {
    const first = parseSse('event: job\nda');
    expect(first.messages).toEqual([]);

    const second = parseSse(first.rest + 'ta: {"progress":50}\n\nevent: jo');
    expect(second.messages).toEqual([{ event: 'job', data: '{"progress":50}' }]);
    expect(second.rest).toBe('event: jo');
  });

  it('ignores comments and keep-alives, and defaults the event name', () => {
    const { messages } = parseSse(': keep-alive\n\n:comment\ndata: hi\r\n\r\n');
    expect(messages).toEqual([{ event: 'message', data: 'hi' }]);
  });
});

describe('JobProgress', () => {
  let jobs: JobProgress;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    jobs = TestBed.inject(JobProgress);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('emits snapshots from the event stream and completes on a terminal status', async () => {
    const body = [job('running', 40), job('completed', 100)]
      .map((j, i) => `id: ${i + 1}\nevent: job\ndata: ${JSON.stringify(j)}\n\n`)
      .join('');
    const fetch = vi.fn().mockResolvedValue(new Response(body, { status: 200 }));
    vi.stubGlobal('fetch', fetch);

    const seen: Job[] = [];
    await new Promise<void>((resolve, reject) =>
      jobs
        .watchJob('j1')
        .subscribe({ next: (j) => seen.push(j), complete: resolve, error: reject }),
    );

    expect(seen.map((j) => j.status)).toEqual(['running', 'completed']);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('/api/jobs/j1/events');
    expect(init.headers.traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
  });

  it('falls back to polling with backoff when the stream fails', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    const seen: Job[] = [];
    let completed = false;
    jobs.watchJob('j1').subscribe({
      next: (j) => seen.push(j),
      complete: () => (completed = true),
    });
    await vi.advanceTimersByTimeAsync(0); // let the rejected fetch settle

    http.expectOne('/api/jobs/j1').flush(job('running', 30));
    await vi.advanceTimersByTimeAsync(pollDelay(1) - 1);
    http.expectNone('/api/jobs/j1');
    await vi.advanceTimersByTimeAsync(1);

    http.expectOne('/api/jobs/j1').flush(job('completed', 100));
    expect(seen.map((j) => j.status)).toEqual(['running', 'completed']);
    expect(completed).toBe(true);
  });

  it('backs off 1 s, 2 s, 4 s, then caps at 8 s', () => {
    expect([1, 2, 3, 4, 5, 6].map(pollDelay)).toEqual([1000, 2000, 4000, 8000, 8000, 8000]);
  });
});
