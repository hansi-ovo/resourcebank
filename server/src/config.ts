/**
 * Central env config for the server.
 */
export const config = {
  port: Number(process.env.PORT || 8787),
  /**
   * FAST_MODE shortens the simulated search delay (300ms) so Playwright
   * tests and dev demos don't wait the default 25s
   * (01-architecture.md §8; 04-build-phases.md Phase 1).
   * Accepts "300ms", "300", "true" → 300ms.
   */
  searchDelayMs: parseFastMode(process.env.FAST_MODE),
  adminPassword: process.env.ADMIN_PASSWORD || 'dku-admin',
  sessionSecret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  dataDir: process.env.DATA_DIR || 'data',
};

function parseFastMode(v: string | undefined): number {
  if (!v || v === '0' || v.toLowerCase() === 'false') return 25_000;
  if (v.toLowerCase() === 'true') return 300;
  const m = /^(\d+)(ms)?$/.exec(v.trim());
  if (m) return m[1] === '1' && !m[2] && v.trim() === '1' ? 25_000 : Number(m[1]);
  return 25_000;
}
