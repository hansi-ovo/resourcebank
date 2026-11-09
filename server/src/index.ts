import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createApp } from './app';
import { openDb, seedIfEmpty } from './db';
import { createBus } from './bus';
import { config, searchSourceReady } from './config';
import { MockSearchProvider } from './providers/MockSearchProvider';
import { MockUpdateChecker } from './providers/MockUpdateChecker';
import { RealUpdateChecker } from './providers/RealUpdateChecker';
import { WebSearchProvider } from './providers/WebSearchProvider';
import { createSearchSource } from './providers/search-source';
import { makeLlm } from './providers/llm';
import type { SearchProvider } from './providers/types';
import { sweepStaleJobs } from './routes/search';
import { runScheduledCheck } from './routes/updates';
import { startScheduler } from './jobs/scheduler';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
void __dirname;

function main(): void {
  const dataDir = path.isAbsolute(config.dataDir)
    ? config.dataDir
    : path.resolve(process.cwd(), config.dataDir);
  fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = process.env.RB_DB_PATH || path.join(dataDir, 'rb.sqlite');

  // Test isolation hook: when RB_RESET_DB=1 (playwright webServer), a stale
  // test DB from a previous run is deleted so every suite starts from the
  // frozen first-run seed. The dev/user DB is NEVER touched — e2e always runs
  // against its own RB_DB_PATH on separate ports.
  if (process.env.RB_RESET_DB === '1' && fs.existsSync(dbPath)) {
    fs.rmSync(dbPath);
    console.log(`[server] RB_RESET_DB=1 — removed test db ${dbPath}`);
  }

  const db = openDb(dbPath);
  seedIfEmpty(db);
  sweepStaleJobs(db, config.searchJobTimeoutMs);

  const bus = createBus();

  // Real pipeline (Tavily + campus LLM) only when both are configured via
  // env; otherwise the mock keeps tests and dev fully offline. SEARCH_SOURCE
  // can be pinned to 'off' (playwright does exactly that) to force the mock.
  const llm = makeLlm();
  const liveSearch = llm !== null && searchSourceReady();
  // WeChat whitelist is live-managed (settings table) — read per round, not
  // at boot, so admin edits take effect on the next search without restart.
  // Seed it once so the very first round already filters.
  db.prepare(
    "INSERT INTO settings (key, value) VALUES ('wechat_whitelist', ?) ON CONFLICT(key) DO NOTHING",
  ).run(JSON.stringify(config.wechatWhitelistSeed));
  const readWhitelist = (): string[] => {
    try {
      const row = db.prepare("SELECT value FROM settings WHERE key = 'wechat_whitelist'").get() as
        | { value: string }
        | undefined;
      if (row === undefined) return config.wechatWhitelistSeed;
      const parsed: unknown = JSON.parse(row.value);
      return Array.isArray(parsed)
        ? parsed.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
        : config.wechatWhitelistSeed;
    } catch {
      return config.wechatWhitelistSeed;
    }
  };

  const provider: SearchProvider =
    llm && liveSearch
      ? new WebSearchProvider(llm, createSearchSource({ wechatWhitelist: readWhitelist }), {
          qualityFloor: config.searchQualityFloor,
        })
      : new MockSearchProvider();

  // Same gate as search: the real update checker needs the LLM gateway.
  // UPDATE_CHECKER=off pins the mock (playwright parity with SEARCH_SOURCE).
  // The demo action only fires on MockUpdateChecker (injectDemo seam); with
  // the real checker it returns inserted:0.
  const checker =
    llm && liveSearch && process.env.UPDATE_CHECKER !== 'off'
      ? new RealUpdateChecker(llm)
      : new MockUpdateChecker();

  const app = createApp({
    db,
    bus,
    auth: { adminPassword: config.adminPassword, sessionSecret: config.sessionSecret },
    provider,
    checker,
    searchDelayMs: liveSearch ? 500 : config.searchDelayMs,
    // uploaded admin images live next to the SQLite file — same backup story
    uploadDir: path.join(path.dirname(dbPath), 'uploads'),
  });

  // Monday 09:00 Asia/Shanghai update check (D11).
  startScheduler(() => runScheduledCheck({ db, bus, checker }));

  app.listen(config.port, () => {
    console.log(
      `[server] listening on :${config.port} (db=${dbPath}, provider=${provider.constructor.name}, checker=${checker.constructor.name}, searchDelayMs=${
        liveSearch ? 500 : config.searchDelayMs
      })`,
    );
  });
}

main();
