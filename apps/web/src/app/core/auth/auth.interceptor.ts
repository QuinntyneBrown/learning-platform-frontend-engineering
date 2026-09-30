import { HttpErrorResponse, type HttpInterceptorFn, type HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthStore } from './auth.store';

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  // Auth endpoints use the cookie, not the bearer token, and must never trigger a refresh loop.
  if (!request.url.startsWith('/api/') || request.url.startsWith('/api/auth/')) {
    return next(request);
  }

  const auth = inject(AuthStore);
  const router = inject(Router);

  return next(withToken(request, auth.accessToken())).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse) || error.status !== 401) {
        return throwError(() => error);
      }
      // The access token expired: refresh once, then retry once. A second 401 propagates.
      return auth.refresh().pipe(
        catchError(() => {
          // The refresh cookie is gone or revoked too. AuthStore has already cleared the session.
          const returnUrl = router.url;
          void router.navigateByUrl(
            router.createUrlTree(['/login'], { queryParams: { returnUrl } }),
          );
          return throwError(() => error);
        }),
        switchMap((session) => next(withToken(request, session.accessToken))),
      );
    }),
  );
};

function withToken(request: HttpRequest<unknown>, token: string | null): HttpRequest<unknown> {
  return token ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : request;
}
