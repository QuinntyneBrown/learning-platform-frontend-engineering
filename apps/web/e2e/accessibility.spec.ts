import { expect, test } from '@playwright/test';
import { expectNoSeriousA11yViolations, signIn } from './support';

test('the sign-in page has no serious accessibility violations', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
  await expectNoSeriousA11yViolations(page);
});

test('the catalog, course and reports pages have no serious accessibility violations', async ({
  page,
}) => {
  await signIn(page, 'manager.acme');
  const course = page
    .getByRole('list', { name: 'Courses' })
    .getByRole('link', { name: 'Accessibility Fundamentals' });
  await expect(course).toBeVisible();
  await expectNoSeriousA11yViolations(page);

  await course.click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Accessibility Fundamentals' }),
  ).toBeVisible();
  await expectNoSeriousA11yViolations(page);

  await page.getByRole('link', { name: 'Reports' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Reports' })).toBeVisible();
  await expectNoSeriousA11yViolations(page);
});

test('keyboard users can skip straight to the main content', async ({ page }) => {
  await signIn(page, 'learner.acme');
  // Route focus moved to the h1 after sign-in. A fresh load leaves focus at the top of the
  // document, where a keyboard user starts.
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Catalog' })).toBeVisible();
  await page.keyboard.press('Tab');
  const skipLink = page.getByRole('link', { name: 'Skip to main content' });
  await expect(skipLink).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toBeFocused();
});
