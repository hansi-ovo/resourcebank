import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Playwright globalSetup — resets the dev DB to the frozen first-run split
 * before each full-suite run, and warms the Vite module graph (admin chunk
 * cold-compile can exceed test timeouts on the first /admin visit).
 */
export default async function globalSetup(): Promise<void> {
  const dbPath = path.resolve(__dirname, '../server/data/rb.sqlite');
  if (fs.existsSync(dbPath)) {
    const db = new Database(dbPath);
    try {
      db.pragma('journal_mode = WAL');
      db.exec('DELETE FROM pending_updates');
      db.exec('DELETE FROM searches');
      db.exec("DELETE FROM settings WHERE key = 'last_search_at'");
      db.exec(`
      UPDATE entries SET
        status = CASE ((SELECT COUNT(*) FROM entries e2
                        WHERE e2.category = entries.category AND e2.id < entries.id) % 2)
          WHEN 0 THEN 'published' ELSE 'review' END,
        source = 'search',
        updated_at = created_at
    `);
      const counts = db
        .prepare('SELECT status, COUNT(*) AS n FROM entries GROUP BY status ORDER BY status')
        .all() as Array<{ status: string; n: number }>;
      console.log('[globalSetup] DB reset:', counts.map((c) => `${c.status}=${c.n}`).join(' '));
    } finally {
      db.close();
    }
  }

  // warm the client dev server (trigger Vite transforms for all routes)
  try {
    const { chromium } = await import('@playwright/test');
    const browser = await chromium.launch();
    const page = await (await browser.newContext()).newPage();
    // hero route compiles the eager chunk + react-bits deps
    await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForTimeout(1_500);
    // admin route compiles the lazy AdminApp chunk (the slow cold one)
    await page.goto('http://localhost:5173/admin', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page
      .locator('h1')
      .first()
      .waitFor({ state: 'visible', timeout: 60_000 });
    // /resources compiles the ContentPage chunk
    await page.goto('http://localhost:5173/resources', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForTimeout(1_000);
    await browser.close();
    console.log('[globalSetup] dev-server modules warmed');
  } catch (err) {
    console.log('[globalSetup] warm-up skipped:', String(err).slice(0, 120));
  }
}
