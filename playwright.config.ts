import { defineConfig } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Playwright runs against ISOLATED servers — its own API on :8799 with a
 * dedicated throwaway DB (RB_DB_PATH, reset per run via RB_RESET_DB=1) and
 * its own Vite client on :5199 proxying there. The dev/user servers on
 * :8787/:5173 and their database are never touched, so approved content and
 * statuses survive any test run.
 *
 * PORT CHOICE IS LOAD-BEARING: the dev `npm run dev` client takes the first
 * free port from 5173 upward. When a dev stack was already running and its
 * Vite drifted onto 5174, the e2e client (strictPort) died silently,
 * Playwright only health-checked the API, and the entire suite ran against
 * the DEV stack — mutating the user's database with real searches. :5199 /
 * :8799 sit far beyond the dev drift range, and index.ts additionally
 * refuses to start when RB_RESET_DB=1 points at anything but the test DB.
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
    baseURL: 'http://localhost:5199',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'npm run dev',
      url: 'http://localhost:8799/api/health',
      reuseExistingServer: false,
      timeout: 90_000,
      // SEARCH_SOURCE=off pins the mock provider so e2e never touches the
      // real web/LLM pipeline, even when .env carries live keys. LLM_API_KEY
      // is additionally blanked (the .env loader never overrides existing
      // process.env entries) so /api/import-url reports its 503 offline path
      // deterministically instead of calling the campus gateway.
      // RB_DB_PATH + RB_RESET_DB give each run a fresh throwaway database;
      // PORT/RB_PORT move the API off the dev server's 8787.
      env: {
        FAST_MODE: '300ms',
        SEARCH_SOURCE: 'off',
        LLM_API_KEY: '',
        PORT: '8799',
        RB_PORT: '8799',
        RB_DB_PATH: testDbPath,
        RB_RESET_DB: '1',
        RB_CLIENT_PORT: '5199',
        RB_API_TARGET: 'http://localhost:8799',
      },
      cwd: here,
    },
  ],
  outputDir: 'test-results/',
  reporter: [['list']],
});
