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
    notes: z.string().trim().max(1000).optional(),
    // image URL: plain string (relative /seed/... paths or external URLs);
    // empty string clears the image
    imageUrl: z.string().trim().max(1000).optional(),
    category: z.enum(CATEGORY_IDS).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'At least one field');

/** POST /api/entries — manual creation (admin fills the form by hand).
 *  Same required core as the review table header: name, summary, url,
 *  category; the rest optional. Created straight into `published` — the
 *  admin's manual entry IS the review decision. */
const createSchema = z.object({
  name: z.string().trim().min(1).max(300),
  summary: z.string().trim().min(1).max(2000),
  url: z.string().trim().url().max(1000),
  category: z.enum(CATEGORY_IDS),
  audience: z.array(z.string().trim().min(1).max(120)).max(12).default([]),
  timeline: z.string().trim().max(500).default(''),
  notes: z.string().trim().max(1000).default(''),
  imageUrl: z.union([z.literal(''), z.string().trim().url().max(1000)]).optional(),
});

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

  /** POST /api/entries — manual creation. 409 on duplicate URL (any status). */
  router.post('/', (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid entry', issues: parsed.error.issues });
      return;
    }
    const v = parsed.data;
    if (db.prepare('SELECT id FROM entries WHERE url = ?').get(v.url)) {
      res.status(409).json({ error: 'URL already exists' });
      return;
    }
    const now = new Date().toISOString();
    const imageUrl = v.imageUrl ? v.imageUrl : null;
    const info = db
      .prepare(
        `INSERT INTO entries (name, summary, url, audience, starts_at, ends_at, timeline, notes, category, image_url, quality, status, source, created_at, updated_at)
         VALUES (@name, @summary, @url, @audience, NULL, NULL, @timeline, @notes, @category, @imageUrl, NULL, 'published', 'manual', @now, @now)`,
      )
      .run({
        name: v.name,
        summary: v.summary,
        url: v.url,
        audience: JSON.stringify(v.audience),
        timeline: v.timeline,
        notes: v.notes,
        category: v.category,
        imageUrl,
        now,
      });
    bus.emitEntriesChanged();
    const row = db.prepare('SELECT * FROM entries WHERE id = ?').get(info.lastInsertRowid) as Row;
    res.status(201).json(toEntry(row));
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
      notes: patch.notes ?? existing.notes ?? '',
      image_url:
        patch.imageUrl !== undefined
          ? patch.imageUrl === ''
            ? null
            : patch.imageUrl
          : existing.image_url,
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
      'UPDATE entries SET name=@name, summary=@summary, url=@url, audience=@audience, category=@category, timeline=@timeline, notes=@notes, image_url=@image_url, updated_at=@updated_at WHERE id=@id',
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
