import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
void here;

/**
 * Playwright globalSetup — warms the ISOLATED Vite client (:5174) module
 * graph (admin chunk cold-compile can exceed test timeouts on the first
 * /admin visit).
 *
 * The old destructive DB reset lives here no more: tests run against their
 * own throwaway database (playwright.config → RB_DB_PATH, wiped per run by
 * RB_RESET_DB=1) on separate ports. The dev/user database on :8787 is never
 * touched, so approved/published content survives any test run.
 */
export default async function globalSetup(): Promise<void> {
  // warm the isolated client dev server (trigger Vite transforms for all routes)
  try {
    const { chromium } = await import('@playwright/test');
    const browser = await chromium.launch();
    const page = await (await browser.newContext()).newPage();
    // hero route compiles the eager chunk + react-bits deps
    await page.goto('http://localhost:5174/', { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForTimeout(1_500);
    // admin route compiles the lazy AdminApp chunk (the slow cold one)
    await page.goto('http://localhost:5174/admin', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page
      .locator('h1')
      .first()
      .waitFor({ state: 'visible', timeout: 60_000 });
    // /resources compiles the ContentPage chunk
    await page.goto('http://localhost:5174/resources', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForTimeout(1_000);
    await browser.close();
    console.log('[globalSetup] isolated dev-server modules warmed');
  } catch (err) {
    console.log('[globalSetup] warm-up skipped:', String(err).slice(0, 120));
  }
}
