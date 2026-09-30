import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // node:sqlite still prints an ExperimentalWarning in Node 22; it's noise in every test worker.
    execArgv: ['--disable-warning=ExperimentalWarning'],
  },
});
