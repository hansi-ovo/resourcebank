import { Router } from 'express';
import { z } from 'zod';
import type Database from 'better-sqlite3';
import { CATEGORY_IDS, type EntryDraft, type Scope, type SearchJob, type SearchStats } from '../../../shared/types';
import type { Bus } from '../bus';
import type { ExistingEntryRef, SearchContext, SearchProvider } from '../providers/types';
import { insertPendingUpdates } from './updates';
import { config } from '../config';
import { placeholderFor } from '../seedimg';
import { toEntry, type Row } from '../db';

const searchSchema = z.object({
  // Empty prompt = tag-only search: the scope's category spec drives query
  // planning server-side (the client no longer concatenates keyword soup).
  prompt: z.string().trim().max(500).default(''),
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
    `INSERT INTO entries (name, summary, url, audience, starts_at, ends_at, timeline, category, image_url, quality, status, source, created_at, updated_at)
     VALUES (@name, @summary, @url, @audience, @startsAt, @endsAt, @timeline, @category, @imageUrl, @quality, 'review', 'search', @now, @now)`,
  );

  /**
   * Same program found on a newer page (e.g. .../2027): published entries
   * get a pending url-diff → Check updates tab. Review-stage entries are
   * skipped (the draft under review still covers them).
   */
  function routeEditionUpdate(existing: ExistingEntryRef, candidate: { name: string; url: string }): void {
    if (existing.status !== 'published') return;
    const dupe = db
      .prepare("SELECT 1 FROM pending_updates WHERE entry_id = ? AND status = 'pending' AND diff LIKE ? LIMIT 1")
      .get(existing.id, `%${candidate.url}%`);
    if (dupe) return;
    insertPendingUpdates(db, bus, [
      {
        entryId: existing.id,
        diff: [
          {
            field: 'url',
            from: existing.url,
            to: candidate.url,
            note: `Search found a newer page for this program: ${candidate.name}`,
          },
        ],
      },
    ]);
  }

  function runJob(jobId: number, prompt: string, scope: Scope): void {
    setTimeout(() => {
      let stats: SearchStats | undefined;
      try {
        const rows = db
          .prepare('SELECT id, name, url, summary, category, status FROM entries')
          .all() as ExistingEntryRef[];
        // Queries from the last 3 rounds (most recent first) — the planner
        // avoids repeating them so consecutive same-prompt rounds diversify.
        const recent = db
          .prepare(
            "SELECT stats FROM searches WHERE finished_at IS NOT NULL AND stats IS NOT NULL ORDER BY started_at DESC, id DESC LIMIT 3",
          )
          .all() as { stats: string }[];
        const recentQueries: string[] = [];
        for (const r of recent) {
          try {
            const s = JSON.parse(r.stats) as Partial<SearchStats>;
            if (Array.isArray(s.queries)) recentQueries.push(...s.queries);
          } catch {
            /* unreadable stats row — skip it */
          }
        }
        const ctx: SearchContext = {
          existingUrls: new Set(rows.map((r) => r.url)),
          existingEntries: rows,
          recentQueries: [...new Set(recentQueries)],
          onSameProgramEdition: (candidate, existing) => routeEditionUpdate(existing, candidate),
          onStats: (s) => {
            stats = s;
          },
        };
        void provider
          .search(prompt, scope, ctx)
          .then((drafts: EntryDraft[]) => {
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
                    timeline: d.timeline ?? '',
                    category: d.category,
                    imageUrl: placeholderFor(d.imageUrl, d.category),
                    quality: d.quality,
                    now,
                  });
                }
                db.prepare('UPDATE searches SET finished_at = ?, result_count = ?, stats = ? WHERE id = ?').run(
                  now,
                  drafts.length,
                  stats ? JSON.stringify(stats) : null,
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
          })
          .catch((err: unknown) => {
            console.error('[search] job failed', err);
            const s: SearchStats = stats ?? {
              candidatesFound: 0,
              dedupSkipped: 0,
              sameProgramEditions: 0,
              extractionFailed: 0,
              lowQuality: 0,
              returned: 0,
              queries: [],
            };
            s.error = err instanceof Error ? err.message : String(err);
            db.prepare('UPDATE searches SET finished_at = ?, result_count = 0, stats = ? WHERE id = ?').run(
              new Date().toISOString(),
              JSON.stringify(s),
              jobId,
            );
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

/**
 * Boot sweep: any unfinished job older than `timeoutMs` is closed as
 * finished(0). Real pipelines (Tavily + LLM extraction) take minutes, so the
 * timeout is config-driven — 90s would kill live jobs mid-flight.
 */
export function sweepStaleJobs(db: Database.Database, timeoutMs: number = config.searchJobTimeoutMs): void {
  const cutoff = Date.now() - timeoutMs;
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
