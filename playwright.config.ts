import { defineConfig } from '@playwright/test';

/**
 * Playwright runs against the dev servers with FAST_MODE=300ms.
 * Start: npm run dev (already FAST_MODE via scripts) then npx playwright test.
 * globalSetup resets the dev DB to the frozen split so runs are repeatable.
 */
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: 'http://localhost:5173',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'npm run dev',
      url: 'http://localhost:8787/api/health',
      reuseExistingServer: true,
      timeout: 60_000,
      env: { FAST_MODE: '300ms' },
    },
  ],
  outputDir: 'test-results/',
  reporter: [['list']],
});
