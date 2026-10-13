import { defineConfig } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Playwright runs against ISOLATED servers — its own API on :8790 with a
 * dedicated throwaway DB (RB_DB_PATH, reset per run via RB_RESET_DB=1) and
 * its own Vite client on :5174 proxying there. The dev/user servers on
 * :8787/:5173 and their database are never touched, so approved content and
 * statuses survive any test run.
 *
 * Start your own dev server as usual: npm run dev (:8787 + :5173).
 * Run tests anytime: npx playwright test (boots/cleans the isolated pair).
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const testDbPath = path.resolve(here, 'server/data/rb-test.sqlite');

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: 'http://localhost:5174',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'npm run dev',
      url: 'http://localhost:8790/api/health',
      reuseExistingServer: false,
      timeout: 90_000,
      // SEARCH_SOURCE=off pins the mock provider so e2e never touches the
      // real web/LLM pipeline, even when .env carries live keys.
      // RB_DB_PATH + RB_RESET_DB give each run a fresh throwaway database;
      // PORT/RB_PORT move the API off the dev server's 8787.
      env: {
        FAST_MODE: '300ms',
        SEARCH_SOURCE: 'off',
        PORT: '8790',
        RB_PORT: '8790',
        RB_DB_PATH: testDbPath,
        RB_RESET_DB: '1',
        RB_CLIENT_PORT: '5174',
        RB_API_TARGET: 'http://localhost:8790',
      },
      cwd: here,
    },
  ],
  outputDir: 'test-results/',
  reporter: [['list']],
});
