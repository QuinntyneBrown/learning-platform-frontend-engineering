import { defineConfig, devices } from '@playwright/test';

// E2E runs its own BFF and web server on separate ports, so it never collides
// with `pnpm dev` and always starts from a freshly seeded in-memory database.
const BFF_PORT = 3100;
const WEB_PORT = 4300;
const isCI = !!process.env['CI'];

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: isCI,
  retries: 0,
  workers: 1,
  reporter: isCI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'pnpm --filter @coursewright/bff start',
      url: `http://localhost:${BFF_PORT}/api/health`,
      env: { PORT: String(BFF_PORT) },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `pnpm exec ng serve --port ${WEB_PORT}`,
      url: `http://localhost:${WEB_PORT}`,
      env: { BFF_URL: `http://localhost:${BFF_PORT}` },
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});
