import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import type { Express } from 'express';
import { createApp, type AppDeps } from '../src/app';
import { openDb, seedIfEmpty } from '../src/db';
import { createBus, type Bus } from '../src/bus';
import { MockSearchProvider } from '../src/providers/MockSearchProvider';
import { MockUpdateChecker } from '../src/providers/MockUpdateChecker';

export interface TestContext {
  dir: string;
  db: ReturnType<typeof openDb>;
  bus: Bus;
  app: Express;
  cleanup: () => void;
}

export interface MakeAppOptions {
  seed?: boolean;
  searchDelayMs?: number;
  adminPassword?: string;
}

/** Builds an Express app backed by a throwaway SQLite file. No ports involved. */
export function makeApp(opts: MakeAppOptions = {}): TestContext {
  const dir = mkdtempSync(path.join(tmpdir(), 'rb-test-'));
  const db = openDb(path.join(dir, 'test.sqlite'));
  if (opts.seed !== false) seedIfEmpty(db);
  const bus = createBus();
  const deps: AppDeps = {
    db,
    bus,
    auth: { adminPassword: opts.adminPassword ?? 'pw', sessionSecret: 'test-secret' },
    provider: new MockSearchProvider(),
    checker: new MockUpdateChecker(),
    searchDelayMs: opts.searchDelayMs ?? 300,
  };
  const app = createApp(deps);
  return {
    dir,
    db,
    bus,
    app,
    cleanup: () => {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** Logs in via the API and returns the cookie header value. */
export async function login(app: Express, password = 'pw'): Promise<string> {
  const res = await request(app).post('/api/login').send({ password });
  const cookie = res.headers['set-cookie']?.[0];
  return cookie ? cookie.split(';')[0]! : '';
}

/** GET /api/entries?status=... with admin cookie, parsed body. */
export async function listEntries(app: Express, cookie: string, status: string) {
  const res = await request(app).get(`/api/entries?status=${status}`).set('Cookie', cookie);
  return res.body as Array<{ id: number; name: string; status: string; url: string }>;
}
