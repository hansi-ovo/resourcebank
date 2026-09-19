import { Router } from 'express';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import { CATEGORY_IDS, type Entry, type PendingUpdate, type UpdateDiffItem } from '../../../shared/types';
import type { Bus } from '../bus';
import type { UpdateChecker, UpdateDraft } from '../providers/types';
import { toEntry, type Row } from '../db';

/** Insert pending updates — the single path used by BOTH the real scheduled
 *  check and the demo action (01-architecture.md §4). */
export function insertPendingUpdates(db: Database.Database, bus: Bus, drafts: UpdateDraft[]): number {
  const now = new Date().toISOString();
  const stmt = db.prepare('INSERT INTO pending_updates (entry_id, diff, detected_at) VALUES (?, ?, ?)');
  const tx = db.transaction(() => {
    for (const d of drafts) stmt.run(d.entryId, JSON.stringify(d.diff), now);
  });
  tx();
  if (drafts.length > 0) bus.emitUpdatesChanged();
  return drafts.length;
}

function rowToPending(r: {
  id: number;
  entry_id: number;
  diff: string;
  detected_at: string;
  status: 'pending' | 'applied' | 'discarded';
  name: string;
}): PendingUpdate {
  return {
    id: r.id,
    entryId: r.entry_id,
    entryName: r.name,
    diff: JSON.parse(r.diff) as UpdateDiffItem[],
    detectedAt: r.detected_at,
    status: r.status,
  };
}

/** Applies one diff to its entry (field patch + source marker + broadcast). */
export function applyDiffToEntry(db: Database.Database, bus: Bus, entry: Entry, diff: UpdateDiffItem[]): Entry {
  const next: Record<string, unknown> = {
    name: entry.name,
    summary: entry.summary,
    url: entry.url,
    audience: JSON.stringify(entry.audience),
    starts_at: entry.startsAt,
    ends_at: entry.endsAt,
    category: entry.category,
    image_url: entry.imageUrl,
    updated_at: new Date().toISOString(),
  };
  for (const d of diff) {
    switch (d.field) {
      case 'name': next.name = d.to; break;
      case 'summary': next.summary = d.to; break;
      case 'url': next.url = d.to; break;
      case 'audience':
        try { next.audience = JSON.stringify(JSON.parse(d.to) as string[]); } catch { /* keep */ }
        break;
      case 'startsAt': next.starts_at = d.to || null; break;
      case 'endsAt': next.ends_at = d.to || null; break;
      case 'category':
        if ((CATEGORY_IDS as readonly string[]).includes(d.to)) next.category = d.to;
        break;
      case 'imageUrl': next.image_url = d.to || null; break;
    }
  }
  db.prepare(
    `UPDATE entries SET name=@name, summary=@summary, url=@url, audience=@audience,
     starts_at=@starts_at, ends_at=@ends_at, category=@category, image_url=@image_url,
     source='update-apply', updated_at=@updated_at WHERE id=@id`,
  ).run({ ...next, id: entry.id });
  bus.emitEntriesChanged();
  return toEntry(db.prepare('SELECT * FROM entries WHERE id = ?').get(entry.id) as Row);
}

export interface UpdatesDeps {
  db: Database.Database;
  bus: Bus;
  checker: UpdateChecker;
}

const idParam = z.coerce.number().int().positive();

export function updatesRoutes(deps: UpdatesDeps): Router {
  const { db, bus, checker } = deps;
  const router = Router();

  const selectPending = () =>
    (
      db
        .prepare(
          `SELECT pu.*, e.name FROM pending_updates pu
           JOIN entries e ON e.id = pu.entry_id
           WHERE pu.status = 'pending' ORDER BY pu.detected_at DESC, pu.id DESC`,
        )
        .all() as {
        id: number;
        entry_id: number;
        diff: string;
        detected_at: string;
        status: 'pending';
        name: string;
      }[]
    ).map(rowToPending);

  /** GET /api/updates?status=pending */
  router.get('/', (req, res) => {
    const status = z.enum(['pending', 'applied', 'discarded']).default('pending').safeParse(req.query.status);
    if (!status.success) {
      res.status(400).json({ error: 'Invalid status' });
      return;
    }
    if (status.data === 'pending') {
      res.json(selectPending());
      return;
    }
    const rows = db
      .prepare(
        `SELECT pu.*, e.name FROM pending_updates pu JOIN entries e ON e.id = pu.entry_id
         WHERE pu.status = ? ORDER BY pu.detected_at DESC, pu.id DESC`,
      )
      .all(status.data) as {
      id: number;
      entry_id: number;
      diff: string;
      detected_at: string;
      status: 'applied' | 'discarded';
      name: string;
    }[];
    res.json(rows.map(rowToPending));
  });

  /** POST /api/updates/:id/apply — patch entry, mark applied, broadcast. */
  router.post('/:id/apply', (req, res) => {
    const parsed = idParam.safeParse(req.params.id);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid id' });
      return;
    }
    const row = db
      .prepare('SELECT * FROM pending_updates WHERE id = ? AND status = ?')
      .get(parsed.data, 'pending') as
      | { id: number; entry_id: number; diff: string; detected_at: string; status: string }
      | undefined;
    if (!row) {
      res.status(404).json({ error: 'Pending update not found' });
      return;
    }
    const entryRow = db.prepare('SELECT * FROM entries WHERE id = ?').get(row.entry_id) as Row | undefined;
    if (!entryRow) {
      res.status(404).json({ error: 'Entry not found' });
      return;
    }
    const diff = JSON.parse(row.diff) as UpdateDiffItem[];
    const entry = applyDiffToEntry(db, bus, toEntry(entryRow), diff);
    db.prepare('UPDATE pending_updates SET status = ? WHERE id = ?').run('applied', row.id);
    bus.emitUpdatesChanged();
    res.json({ ok: true, entry });
  });

  /** POST /api/updates/:id/discard */
  router.post('/:id/discard', (req, res) => {
    const parsed = idParam.safeParse(req.params.id);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid id' });
      return;
    }
    const info = db
      .prepare('UPDATE pending_updates SET status = ? WHERE id = ? AND status = ?')
      .run('discarded', parsed.data, 'pending');
    if (info.changes === 0) {
      res.status(404).json({ error: 'Pending update not found' });
      return;
    }
    bus.emitUpdatesChanged();
    res.json({ ok: true });
  });

  /** POST /demo/update-check — admin-only demo injection (2–3 diffs). */
  router.post('/demo/update-check', async (_req, res) => {
    const published = (
      db.prepare("SELECT * FROM entries WHERE status = 'published'").all() as Row[]
    ).map(toEntry);
    const drafts = checker instanceof Object && 'injectDemo' in checker
      ? (checker as { injectDemo(entries: Entry[], n: number): UpdateDraft[] }).injectDemo(published, 3)
      : [];
    const n = insertPendingUpdates(db, bus, drafts);
    res.json({ ok: true, inserted: n });
  });

  return router;
}

/** Scheduled check: Monday 09:00 Asia/Shanghai (D11) — inserts whatever the
 *  checker finds (mock: none) through the same path as the demo action. */
export async function runScheduledCheck(deps: UpdatesDeps): Promise<number> {
  const { db, bus, checker } = deps;
  const published = (
    db.prepare("SELECT * FROM entries WHERE status = 'published'").all() as Row[]
  ).map(toEntry);
  const drafts = await checker.check(published);
  return insertPendingUpdates(db, bus, drafts);
}
