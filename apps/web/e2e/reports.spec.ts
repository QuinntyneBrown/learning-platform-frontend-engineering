import { expect, test } from '@playwright/test';
import { signIn } from './support';

test('a manager exports a report that fails once, retries, completes and downloads', async ({
  page,
}) => {
  await signIn(page, 'manager.acme');
  await page.getByRole('link', { name: 'Reports' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Reports' })).toBeVisible();

  // One simulated failure: the worker retries with backoff and succeeds on attempt 2.
  await page.getByLabel('Simulated failures').selectOption('1');
  await page.getByRole('button', { name: 'Export completions report' }).click();

  await expect(page.getByRole('progressbar', { name: 'Export progress' })).toBeVisible();
  await expect(page.getByText(/attempt 2 of 3/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Completed')).toBeVisible({ timeout: 15_000 });

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download report' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.csv$/);
});

test('reports are hidden from learners', async ({ page }) => {
  await signIn(page, 'learner.acme');
  await expect(page.getByRole('link', { name: 'Catalog' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Reports' })).toHaveCount(0);
});
