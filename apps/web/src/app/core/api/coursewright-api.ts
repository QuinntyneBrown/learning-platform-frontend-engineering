import { HttpClient, HttpParams, httpResource, type HttpResourceRef } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import type {
  Course,
  CoursePage,
  CourseSearchParams,
  Enrollment,
  EnrollmentList,
  EnrollmentRequest,
  Job,
  LoginRequest,
  ReportRequest,
  Session,
} from './models';

/** Typed access to the BFF. Every path is same-origin under /api; see contracts/openapi.yaml. */
@Injectable({ providedIn: 'root' })
export class CoursewrightApi {
  private readonly http = inject(HttpClient);

  login(credentials: LoginRequest): Observable<Session> {
    return this.http.post<Session>('/api/auth/login', credentials);
  }

  /** The browser sends the httpOnly refresh cookie itself; script never sees it. */
  refresh(): Observable<Session> {
    return this.http.post<Session>('/api/auth/refresh', null);
  }

  logout(): Observable<void> {
    return this.http.post<void>('/api/auth/logout', null);
  }

  searchCourses({ q, cursor, limit }: CourseSearchParams): Observable<CoursePage> {
    let params = new HttpParams();
    if (q) params = params.set('q', q);
    if (cursor) params = params.set('cursor', cursor);
    if (limit) params = params.set('limit', limit);
    return this.http.get<CoursePage>('/api/courses', { params });
  }

  /** A signal-driven GET that refetches when `courseId` changes. Call it from an injection context. */
  course(courseId: () => string): HttpResourceRef<Course | undefined> {
    return httpResource<Course>(() => `/api/courses/${encodeURIComponent(courseId())}`);
  }

  enroll(courseId: string, idempotencyKey: string): Observable<Enrollment> {
    const body: EnrollmentRequest = { courseId };
    return this.http.post<Enrollment>('/api/enrollments', body, {
      headers: { 'Idempotency-Key': idempotencyKey },
    });
  }

  myEnrollments(): Observable<EnrollmentList> {
    return this.http.get<EnrollmentList>('/api/me/enrollments');
  }

  requestReport(request: ReportRequest): Observable<Job> {
    return this.http.post<Job>('/api/reports', request);
  }

  getJob(jobId: string): Observable<Job> {
    return this.http.get<Job>(`/api/jobs/${encodeURIComponent(jobId)}`);
  }

  /** A URL rather than an Observable: JobProgress reads this SSE stream with fetch. */
  jobEventsUrl(jobId: string): string {
    return `/api/jobs/${encodeURIComponent(jobId)}/events`;
  }

  downloadJobResult(jobId: string): Observable<Blob> {
    return this.http.get(`/api/jobs/${encodeURIComponent(jobId)}/result`, { responseType: 'blob' });
  }
}
