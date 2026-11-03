import { Router } from 'express';
import { z } from 'zod';
import type Database from 'better-sqlite3';
import { config } from '../config';
import type { Bus } from '../bus';

/**
 * WeChat official-account whitelist (admin-managed, live).
 *
 * Stored as a JSON array of account names in the settings table
 * (key = 'wechat_whitelist'). The search source re-reads it every round, so
 * edits apply on the next search without a restart.
 */

const whitelistSchema = z.object({
  names: z
    .array(z.string().trim().min(1).max(80))
    .max(50)
    .transform((arr) => [...new Set(arr.map((n) => n.trim()).filter((n) => n.length > 0))]),
});

const KEY = 'wechat_whitelist';

function readWhitelist(db: Database.Database): string[] {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(KEY) as { value: string } | undefined;
  if (row === undefined) return config.wechatWhitelistSeed;
  try {
    const parsed: unknown = JSON.parse(row.value);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string' && x.trim().length > 0) : config.wechatWhitelistSeed;
  } catch {
    return config.wechatWhitelistSeed;
  }
}

export function wechatWhitelistRoutes(db: Database.Database, bus: Bus): Router {
  const router = Router();

  const write = (names: string[]): void => {
    db.prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    ).run(KEY, JSON.stringify(names));
    // search rounds read the whitelist from the settings table directly; the
    // broadcast keeps multiple admin tabs in sync
    bus.emitEntriesChanged();
  };

  router.get('/api/wechat-whitelist', (_req, res) => {
    res.json({ names: readWhitelist(db) });
  });

  router.put('/api/wechat-whitelist', (req, res) => {
    const parsed = whitelistSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid whitelist', issues: parsed.error.issues });
      return;
    }
    write(parsed.data.names);
    res.json({ names: parsed.data.names });
  });

  router.post('/api/wechat-whitelist/add', (req, res) => {
    const parsed = z.object({ name: z.string().trim().min(1).max(80) }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid account name' });
      return;
    }
    const current = readWhitelist(db);
    const name = parsed.data.name;
    if (!current.some((n) => n.toLowerCase() === name.toLowerCase())) {
      write([...current, name]);
    }
    res.json({ names: readWhitelist(db) });
  });

  router.post('/api/wechat-whitelist/remove', (req, res) => {
    const parsed = z.object({ name: z.string().trim().min(1).max(80) }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid account name' });
      return;
    }
    const lower = parsed.data.name.toLowerCase();
    write(readWhitelist(db).filter((n) => n.toLowerCase() !== lower));
    res.json({ names: readWhitelist(db) });
  });

  return router;
}
