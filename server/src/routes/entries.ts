import { Router } from 'express';
import { z } from 'zod';
import type Database from 'better-sqlite3';
import { CATEGORIES, CATEGORY_IDS, type Entry, type EntryPatch } from '../../../shared/types';
import type { Bus } from '../bus';
import { toEntry, type Row } from '../db';

const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(300).optional(),
    summary: z.string().trim().min(1).max(2000).optional(),
    url: z.string().trim().url().max(1000).optional(),
    audience: z.array(z.string().trim().min(1).max(120)).max(12).optional(),
    timeline: z.string().trim().max(500).optional(),
    category: z.enum(CATEGORY_IDS).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'At least one field');

/** GET /api/entries/published — public display payload grouped by canonical order. */
export function publishedPayload(db: Database.Database) {
  const rows = db
    .prepare("SELECT * FROM entries WHERE status = 'published' ORDER BY created_at ASC, id ASC")
    .all() as Row[];
  return CATEGORIES.map((c) => ({
    category: c,
    entries: rows.filter((r) => r.category === c.id).map(toEntry),
  }));
}

export function entriesRoutes(db: Database.Database, bus: Bus): Router {
  const router = Router();

  /** GET /api/entries?status=review|published — admin list. */
  router.get('/', (req, res) => {
    const status = z.enum(['review', 'published', 'removed', 'withdrawn']).safeParse(req.query.status);
    const rows = status.success
      ? db
          .prepare('SELECT * FROM entries WHERE status = ? ORDER BY created_at DESC, id DESC')
          .all(status.data)
      : db.prepare('SELECT * FROM entries ORDER BY created_at DESC, id DESC').all();
    res.json(rows.map((r) => toEntry(r as Row)));
  });

  router.get('/published', (_req, res) => {
    res.json(publishedPayload(db));
  });

  /** PUT /api/entries/:id — inline edits. */
  router.put('/:id', (req, res) => {
    const id = Number(req.params.id);
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid patch', issues: parsed.error.issues });
      return;
    }
    const existing = db.prepare('SELECT * FROM entries WHERE id = ?').get(id) as Row | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const patch = parsed.data as EntryPatch;
    const next = {
      name: patch.name ?? existing.name,
      summary: patch.summary ?? existing.summary,
      url: patch.url ?? existing.url,
      audience: patch.audience ? JSON.stringify(patch.audience) : existing.audience,
      category: patch.category ?? existing.category,
      timeline: patch.timeline ?? existing.timeline ?? '',
      updated_at: new Date().toISOString(),
    };
    if (next.url !== existing.url) {
      const dupe = db.prepare('SELECT id FROM entries WHERE url = ? AND id != ?').get(next.url, id);
      if (dupe) {
        res.status(409).json({ error: 'URL already exists' });
        return;
      }
    }
    db.prepare(
      'UPDATE entries SET name=@name, summary=@summary, url=@url, audience=@audience, category=@category, timeline=@timeline, updated_at=@updated_at WHERE id=@id',
    ).run({ ...next, id });
    // Edits to a published entry change live display content.
    if (existing.status === 'published') bus.emitEntriesChanged();
    const updated = db.prepare('SELECT * FROM entries WHERE id = ?').get(id) as Row;
    res.json(toEntry(updated));
  });

  return router;
}

/** Entry state machine (01-architecture.md §2). */
export const transitions = {
  approve: { from: 'review', to: 'published' },
  remove: { from: 'review', to: 'removed' },
  withdraw: { from: 'published', to: 'withdrawn' },
} as const;

export type TransitionName = keyof typeof transitions;

export function applyTransition(
  db: Database.Database,
  bus: Bus,
  id: number,
  name: TransitionName,
): { ok: true; entry: Entry } | { ok: false; code: number; error: string } {
  const t = transitions[name];
  const existing = db.prepare('SELECT * FROM entries WHERE id = ?').get(id) as Row | undefined;
  if (!existing) return { ok: false, code: 404, error: 'Not found' };
  if (existing.status !== t.from) {
    return { ok: false, code: 409, error: `Cannot ${name} a ${existing.status} entry` };
  }
  db.prepare('UPDATE entries SET status = ?, updated_at = ? WHERE id = ?').run(
    t.to,
    new Date().toISOString(),
    id,
  );
  // approve/withdraw change the published set; remove only touches review rows
  // but still broadcasts so admin tabs refresh their counts.
  bus.emitEntriesChanged();
  const updated = db.prepare('SELECT * FROM entries WHERE id = ?').get(id) as Row;
  return { ok: true, entry: toEntry(updated) };
}
