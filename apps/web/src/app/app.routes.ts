import type { Routes } from '@angular/router';
import { authGuard, roleGuard } from '@cw/core';

// Every feature is lazy-loaded, so the initial bundle is just the shell, core and design system.
// canMatch (not canActivate) also keeps a guarded feature's code from downloading at all.
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'catalog' },
  {
    path: 'login',
    title: 'Sign in',
    loadComponent: () => import('./features/login/login-page').then((m) => m.LoginPage),
  },
  {
    path: 'catalog',
    title: 'Catalog',
    canMatch: [authGuard],
    loadComponent: () => import('./features/catalog/catalog-page').then((m) => m.CatalogPage),
  },
  {
    path: 'courses/:courseId',
    title: 'Course',
    canMatch: [authGuard],
    loadComponent: () => import('./features/course/course-page').then((m) => m.CoursePage),
  },
  {
    path: 'reports',
    title: 'Reports',
    canMatch: [authGuard, roleGuard('manager')],
    loadComponent: () => import('./features/reports/reports-page').then((m) => m.ReportsPage),
  },
  {
    path: '**',
    title: 'Page not found',
    loadComponent: () => import('./features/not-found/not-found-page').then((m) => m.NotFoundPage),
  },
];
