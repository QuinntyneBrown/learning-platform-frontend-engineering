import { expect, test } from '@playwright/test';
import { PASSWORD, signIn } from './support';

test('a learner finds a course, enrolls once despite a double-click, and stays signed in across a reload', async ({
  page,
}) => {
  await signIn(page, 'learner.acme');

  // Typeahead search; the query lives in the URL so it survives reloads and can be shared.
  await page.getByLabel('Search courses').fill('signals');
  const results = page.getByRole('list', { name: 'Courses' });
  const courseLink = results.getByRole('link', { name: 'Angular Signals in Practice' });
  await expect(courseLink).toBeVisible();
  await expect(page).toHaveURL(/[?&]q=signals/);
  await expect(results.getByRole('link', { name: 'Accessibility Fundamentals' })).toHaveCount(0);

  // A route change moves focus to the new page's heading, so screen-reader users hear where they are.
  await courseLink.click();
  const heading = page.getByRole('heading', { level: 1, name: 'Angular Signals in Practice' });
  await expect(heading).toBeFocused();

  // exhaustMap + Idempotency-Key: a double-click produces exactly one enrollment request.
  const idempotencyKeys: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/api/enrollments')) {
      idempotencyKeys.push(request.headers()['idempotency-key'] ?? '');
    }
  });
  await page.getByRole('button', { name: 'Enroll' }).dblclick();
  await expect(page.getByText("You're enrolled")).toBeVisible();
  expect(idempotencyKeys).toHaveLength(1);
  expect(idempotencyKeys[0]).not.toBe('');

  // The access token lives only in memory; a reload restores the session from the
  // httpOnly refresh cookie.
  await page.reload();
  await expect(heading).toBeVisible();
  await expect(page.getByText("You're enrolled")).toBeVisible();

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
});

test('opening a protected page signed out goes to sign-in, then back to that page', async ({
  page,
}) => {
  await page.goto('/catalog?q=forms');
  await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
  await page.getByLabel('Username').fill('learner.acme');
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/catalog\?q=forms/);
  await expect(
    page.getByRole('list', { name: 'Courses' }).getByRole('link', { name: 'Reactive Forms Deep Dive' }),
  ).toBeVisible();
});

test('a wrong password shows an accessible error', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Username').fill('learner.acme');
  await page.getByLabel('Password').fill('not-the-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toContainText('Username or password is incorrect.');
});
