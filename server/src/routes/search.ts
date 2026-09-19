import { Router } from 'express';
import { z } from 'zod';
import type Database from 'better-sqlite3';
import { CATEGORY_IDS, type EntryDraft, type SearchJob } from '../../../shared/types';
import type { Bus } from '../bus';
import type { SearchProvider } from '../providers/types';
import { placeholderFor } from '../seedimg';
import { toEntry, type Row } from '../db';

const searchSchema = z.object({
  prompt: z.string().trim().min(2).max(500),
  scope: z.enum(['all', ...CATEGORY_IDS]).default('all'),
});

export interface SearchDeps {
  db: Database.Database;
  bus: Bus;
  provider: SearchProvider;
  delayMs: number;
}

/**
 * POST /api/search — creates a job, 202 {jobId}. The server-side timer runs
 * the provider, inserts drafts as `review`, sets settings.last_search_at and
 * broadcasts. Never blocks other endpoints (async, no global lock).
 * Job rows live in `searches`; a boot sweep closes stale jobs (Risk table).
 */
export function searchRoutes(deps: SearchDeps): Router {
  const { db, bus, provider, delayMs } = deps;
  const router = Router();

  const insertDraft = db.prepare(
    `INSERT INTO entries (name, summary, url, audience, starts_at, ends_at, category, image_url, quality, status, source, created_at, updated_at)
     VALUES (@name, @summary, @url, @audience, @startsAt, @endsAt, @category, @imageUrl, @quality, 'review', 'search', @now, @now)`,
  );

  function runJob(jobId: number, prompt: string, scope: 'all' | (typeof CATEGORY_IDS)[number]): void {
    setTimeout(() => {
      try {
        const existing = new Set(
          (db.prepare('SELECT url FROM entries').all() as { url: string }[]).map((r) => r.url),
        );
        void provider.search(prompt, scope, existing).then((drafts: EntryDraft[]) => {
          try {
            const now = new Date().toISOString();
            const tx = db.transaction(() => {
              for (const d of drafts) {
                insertDraft.run({
                  name: d.name,
                  summary: d.summary,
                  url: d.url,
                  audience: JSON.stringify(d.audience),
                  startsAt: d.startsAt,
                  endsAt: d.endsAt,
                  category: d.category,
                  imageUrl: placeholderFor(d.imageUrl, d.category),
                  quality: d.quality,
                  now,
                });
              }
              db.prepare('UPDATE searches SET finished_at = ?, result_count = ? WHERE id = ?').run(
                now,
                drafts.length,
                jobId,
              );
              db.prepare(
                "INSERT INTO settings (key, value) VALUES ('last_search_at', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
              ).run(now);
            });
            tx();
            bus.emitEntriesChanged();
            console.log(`[search] job ${jobId} finished: ${drafts.length} drafts -> review`);
          } catch (err) {
            console.error('[search] job insert failed', err);
            db.prepare('UPDATE searches SET finished_at = ? WHERE id = ?').run(
              new Date().toISOString(),
              jobId,
            );
          }
        });
      } catch (err) {
        console.error('[search] job failed', err);
      }
    }, delayMs);
  }

  router.post('/', (req, res) => {
    const parsed = searchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid search request', issues: parsed.error.issues });
      return;
    }
    const { prompt, scope } = parsed.data;
    const info = db
      .prepare('INSERT INTO searches (prompt, scope, started_at) VALUES (?, ?, ?)')
      .run(prompt, scope, new Date().toISOString());
    runJob(Number(info.lastInsertRowid), prompt, scope);
    res.status(202).json({ jobId: Number(info.lastInsertRowid) });
  });

  return router;
}

/** Boot sweep: any unfinished job older than 90s is closed as finished(0). */
export function sweepStaleJobs(db: Database.Database): void {
  const cutoff = Date.now() - 90_000;
  const rows = db.prepare('SELECT id, started_at FROM searches WHERE finished_at IS NULL').all() as {
    id: number;
    started_at: string;
  }[];
  for (const r of rows) {
    if (Date.parse(r.started_at) < cutoff) {
      db.prepare('UPDATE searches SET finished_at = ?, result_count = 0 WHERE id = ?').run(
        new Date().toISOString(),
        r.id,
      );
    }
  }
}

export function jobToSearchJob(r: {
  id: number;
  prompt: string;
  scope: string;
  started_at: string;
  finished_at: string | null;
  result_count: number | null;
}): SearchJob {
  return {
    id: r.id,
    prompt: r.prompt,
    scope: r.scope as SearchJob['scope'],
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    resultCount: r.result_count,
    status: r.finished_at ? 'finished' : 'running',
  };
}
