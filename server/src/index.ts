import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createApp } from './app';
import { openDb, seedIfEmpty } from './db';
import { createBus } from './bus';
import { config } from './config';
import { MockSearchProvider } from './providers/MockSearchProvider';
import { MockUpdateChecker } from './providers/MockUpdateChecker';
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

  const db = openDb(dbPath);
  seedIfEmpty(db);
  sweepStaleJobs(db);

  const bus = createBus();
  const app = createApp({
    db,
    bus,
    auth: { adminPassword: config.adminPassword, sessionSecret: config.sessionSecret },
    provider: new MockSearchProvider(),
    checker: new MockUpdateChecker(),
    searchDelayMs: config.searchDelayMs,
  });

  // Monday 09:00 Asia/Shanghai update check (D11).
  startScheduler(() => runScheduledCheck({ db, bus, checker: new MockUpdateChecker() }));

  app.listen(config.port, () => {
    console.log(
      `[server] listening on :${config.port} (db=${dbPath}, searchDelayMs=${config.searchDelayMs})`,
    );
  });
}

main();
