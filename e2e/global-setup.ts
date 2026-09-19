import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Playwright globalSetup — resets the dev DB to the frozen first-run split
 * before each full-suite run so repeated runs never deplete review stock
 * (each run's approvals accumulate otherwise).
 *
 * Per-category index parity re-derivation mirrors seedIfEmpty (even published,
 * odd review). pending_updates/searches/settings cleared.
 */
export default function globalSetup(): void {
  const dbPath = path.resolve(__dirname, '../server/data/rb.sqlite');
  if (!fs.existsSync(dbPath)) {
    console.log('[globalSetup] no dev DB yet — server will seed on boot; nothing to reset');
    return;
  }
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
      .prepare(
        "SELECT status, COUNT(*) AS n FROM entries GROUP BY status ORDER BY status",
      )
      .all() as Array<{ status: string; n: number }>;
    console.log('[globalSetup] DB reset:', counts.map((c) => `${c.status}=${c.n}`).join(' '));
  } finally {
    db.close();
  }
}
