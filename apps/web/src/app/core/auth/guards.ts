import { inject } from '@angular/core';
import { type CanMatchFn, Router } from '@angular/router';
import type { Role } from '../api/models';
import { AuthStore } from './auth.store';

/** Signed-out users go to the login page, which sends them back here afterwards. */
export const authGuard: CanMatchFn = () => {
  if (inject(AuthStore).isAuthenticated()) {
    return true;
  }
  const router = inject(Router);
  const returnUrl = router.currentNavigation()?.extractedUrl.toString() ?? '/';
  return router.createUrlTree(['/login'], { queryParams: { returnUrl } });
};

/**
 * canMatch, not canActivate: when it fails, the router falls through to the `**` route, so
 * a learner sees "Page not found" and the page's existence doesn't leak. The BFF does the
 * same with cross-tenant resources (404, not 403). The BFF still enforces the role itself.
 */
export function roleGuard(role: Role): CanMatchFn {
  return () => inject(AuthStore).hasRole(role);
}
