import { Injectable, computed, inject, signal } from '@angular/core';
import { type Observable, catchError, finalize, map, of, share, tap } from 'rxjs';
import { CoursewrightApi } from '../api/coursewright-api';
import type { LoginRequest, Role, Session, User } from '../api/models';

@Injectable({ providedIn: 'root' })
export class AuthStore {
  private readonly api = inject(CoursewrightApi);

  // In memory only, never localStorage or sessionStorage: any script on the page can read
  // storage, so a single XSS bug would leak the token. After a reload, restore() gets a new
  // access token from the httpOnly refresh cookie, which script can't read at all.
  private readonly session = signal<Session | null>(null);
  private refreshInFlight: Observable<Session> | null = null;

  readonly user = computed(() => this.session()?.user ?? null);
  readonly accessToken = computed(() => this.session()?.accessToken ?? null);
  readonly isAuthenticated = computed(() => this.session() !== null);

  hasRole(role: Role): boolean {
    return this.user()?.roles.includes(role) ?? false;
  }

  login(credentials: LoginRequest): Observable<User> {
    return this.api.login(credentials).pipe(
      tap((session) => this.session.set(session)),
      map((session) => session.user),
    );
  }

  /**
   * Concurrent callers share one request. Refresh tokens are single-use, so a second parallel
   * refresh would present a spent token, and the BFF's reuse detection would revoke the session.
   */
  refresh(): Observable<Session> {
    this.refreshInFlight ??= this.api.refresh().pipe(
      tap({
        next: (session) => this.session.set(session),
        error: () => this.session.set(null),
      }),
      finalize(() => (this.refreshInFlight = null)),
      share(),
    );
    return this.refreshInFlight;
  }

  /** Startup: a valid refresh cookie silently restores the session; a 401 just means signed out. */
  restore(): Observable<unknown> {
    return this.refresh().pipe(catchError(() => of(null)));
  }

  logout(): Observable<void> {
    this.session.set(null);
    return this.api.logout().pipe(catchError(() => of(undefined)));
  }
}
