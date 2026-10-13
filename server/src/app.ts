import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import type { AdminSummary, SearchStats } from '../../shared/types';
import { authRoutes } from './routes/auth';
import {
  applyTransition,
  entriesRoutes,
  publishedPayload,
  type TransitionName,
} from './routes/entries';
import { searchRoutes, sweepStaleJobs } from './routes/search';
import { updatesRoutes } from './routes/updates';
import { streamRoutes } from './routes/stream';
import { createBus, type Bus } from './bus';
import type { SearchProvider, UpdateChecker } from './providers/types';
import type { AuthDeps } from './auth';
import { requireAdmin } from './auth';
import { placeholderBody } from './seedimg';

export interface AppDeps {
  db: Database.Database;
  bus: Bus;
  auth: AuthDeps;
  provider: SearchProvider;
  checker: UpdateChecker;
  searchDelayMs: number;
}

export function createApp(deps: AppDeps): Express {
  const { db, bus, auth } = deps;
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '256kb' }));

  const admin = requireAdmin(auth.sessionSecret);

  // ── public ────────────────────────────────────────────────────────────
  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  app.get('/api/seedimg/:cat/:file', (req, res) => {
    const ok = placeholderBody(req.params.cat, req.params.file);
    if (!ok) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.type(ok.type).send(ok.body);
  });

  app.get('/api/published', (_req, res) => {
    res.json(publishedPayload(db));
  });

  app.use(streamRoutes(bus)); // GET /api/stream

  // ── auth ──────────────────────────────────────────────────────────────
  app.use(authRoutes(auth));

  // ── admin-only ────────────────────────────────────────────────────────
  app.get('/api/summary', admin, (_req, res) => {
    const reviewCount = (
      db.prepare("SELECT COUNT(*) AS n FROM entries WHERE status = 'review'").get() as { n: number }
    ).n;
    const pendingUpdatesCount = (
      db.prepare("SELECT COUNT(*) AS n FROM pending_updates WHERE status = 'pending'").get() as {
        n: number;
      }
    ).n;
    const lastSearchAt =
      (
        db.prepare("SELECT value FROM settings WHERE key = 'last_search_at'").get() as
          | { value: string }
          | undefined
      )?.value ?? null;
    const lastStatsRow = db
      .prepare(
        'SELECT stats FROM searches WHERE finished_at IS NOT NULL AND stats IS NOT NULL ORDER BY started_at DESC, id DESC LIMIT 1',
      )
      .get() as { stats: string } | undefined;
    const running = (
      db.prepare('SELECT COUNT(*) AS n FROM searches WHERE finished_at IS NULL').get() as { n: number }
    ).n;
    const summary: AdminSummary = {
      reviewCount,
      pendingUpdatesCount,
      lastSearchAt,
      searchRunning: running > 0,
      lastSearchStats: lastStatsRow ? (JSON.parse(lastStatsRow.stats) as SearchStats) : null,
    };
    res.json(summary);
  });

  app.use('/api/entries', admin, entriesRoutes(db, bus));

  const idParam = z.coerce.number().int().positive();
  function transitionRoute(name: TransitionName) {
    return (req: Request, res: Response) => {
      const parsed = idParam.safeParse(req.params.id);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid id' });
        return;
      }
      const result = applyTransition(db, bus, parsed.data, name);
      if (result.ok) res.json(result.entry);
      else res.status(result.code).json({ error: result.error });
    };
  }
  app.post('/api/entries/:id/approve', admin, transitionRoute('approve'));
  app.post('/api/entries/:id/remove', admin, transitionRoute('remove'));
  app.post('/api/entries/:id/withdraw', admin, transitionRoute('withdraw'));

  const batchSchema = z.object({
    ids: z.array(z.coerce.number().int().positive()).min(1).max(200),
    action: z.enum(['approve', 'remove']),
  });
  app.post('/api/entries/batch', admin, (req, res) => {
    const parsed = batchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid batch request', issues: parsed.error.issues });
      return;
    }
    const { ids, action } = parsed.data;
    const results = { applied: 0, rejected: 0 };
    for (const id of ids) {
      const r = applyTransition(db, bus, id, action);
      if (r.ok) results.applied += 1;
      else results.rejected += 1;
    }
    if (results.applied > 0) bus.emitEntriesChanged();
    res.json(results);
  });

  app.use(
    '/api/search',
    admin,
    searchRoutes({ db, bus, provider: deps.provider, delayMs: deps.searchDelayMs }),
  );
  app.use('/api/updates', admin, updatesRoutes({ db, bus, checker: deps.checker }));

  // ── errors ────────────────────────────────────────────────────────────
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'Not found' });
  });
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[server] error', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

export { createBus, sweepStaleJobs };
