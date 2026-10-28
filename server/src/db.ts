import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { CATEGORY_IDS, type Entry } from '../../shared/types';
import { SEED_ENTRIES } from '../../shared/seed-data';
import { placeholderFor } from './seedimg';

export type Row = {
  id: number;
  name: string;
  summary: string;
  url: string;
  audience: string;
  starts_at: string | null;
  ends_at: string | null;
  timeline?: string | null;
  notes?: string | null;
  category: (typeof CATEGORY_IDS)[number];
  image_url: string | null;
  quality: number | null;
  status: 'review' | 'published' | 'removed' | 'withdrawn';
  source: 'search' | 'update-apply' | 'manual';
  created_at: string;
  updated_at: string;
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function toEntry(r: Row): Entry {
  return {
    id: r.id,
    name: r.name,
    summary: r.summary,
    url: r.url,
    audience: JSON.parse(r.audience) as string[],
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    timeline: r.timeline ?? '',
    notes: r.notes ?? '',
    category: r.category,
    imageUrl: r.image_url,
    quality: r.quality,
    status: r.status,
    source: r.source,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function openDb(file: string): Database.Database {
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(readFileSync(path.resolve(__dirname, 'schema.sql'), 'utf-8'));
  // lightweight migrations: columns added after first release
  const cols = db.prepare('PRAGMA table_info(entries)').all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === 'timeline')) {
    db.exec("ALTER TABLE entries ADD COLUMN timeline TEXT NOT NULL DEFAULT ''");
  }
  if (!cols.some((c) => c.name === 'notes')) {
    db.exec("ALTER TABLE entries ADD COLUMN notes TEXT NOT NULL DEFAULT ''");
  }
  const searchCols = db.prepare('PRAGMA table_info(searches)').all() as Array<{ name: string }>;
  if (!searchCols.some((c) => c.name === 'stats')) {
    db.exec('ALTER TABLE searches ADD COLUMN stats TEXT');
  }
  // migration (manual entries): the source CHECK gained 'manual' — SQLite
  // cannot ALTER a CHECK, so an entries table created before this change is
  // rebuilt in place (detected via the stored CREATE TABLE sql). Runs after
  // the column migrations so timeline/notes exist for the row copy.
  const entriesDdl = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'entries'")
    .get() as { sql: string } | undefined;
  if (entriesDdl && !entriesDdl.sql.includes("'manual'")) {
    db.pragma('foreign_keys = OFF');
    db.transaction(() => {
      db.exec(`
        CREATE TABLE entries_new (
          id           INTEGER PRIMARY KEY,
          name         TEXT NOT NULL,
          summary      TEXT NOT NULL,
          url          TEXT NOT NULL UNIQUE,
          audience     TEXT NOT NULL,
          starts_at    TEXT,
          ends_at      TEXT,
          timeline     TEXT NOT NULL DEFAULT '',
          notes        TEXT NOT NULL DEFAULT '',
          category     TEXT NOT NULL CHECK (category IN ('on-campus','fellowships','experiential','events','training')),
          image_url    TEXT,
          quality      INTEGER,
          status       TEXT NOT NULL DEFAULT 'review' CHECK (status IN ('review','published','removed','withdrawn')),
          source       TEXT NOT NULL DEFAULT 'search' CHECK (source IN ('search','update-apply','manual')),
          created_at   TEXT NOT NULL,
          updated_at   TEXT NOT NULL
        );
        INSERT INTO entries_new (id, name, summary, url, audience, starts_at, ends_at, timeline, notes, category, image_url, quality, status, source, created_at, updated_at)
          SELECT id, name, summary, url, audience, starts_at, ends_at, timeline, notes, category, image_url, quality, status, source, created_at, updated_at FROM entries;
        DROP TABLE entries;
        ALTER TABLE entries_new RENAME TO entries;
      `);
    })();
    db.exec(
      'CREATE INDEX IF NOT EXISTS idx_entries_status ON entries(status);\n' +
        'CREATE INDEX IF NOT EXISTS idx_entries_category ON entries(category);',
    );
    db.pragma('foreign_keys = ON');
  }
  return db;
}

/**
 * First-run seed with the FROZEN deterministic split (04-build-phases Phase 1):
 * per category, even seed indices (0,2,4,鈥? 鈫?published; odd (1,3,鈥? 鈫?review.
 * Counts are printed to the server log on first run.
 */
export function seedIfEmpty(db: Database.Database): void {
  const count = (db.prepare('SELECT COUNT(*) AS n FROM entries').get() as { n: number }).n;
  if (count > 0) return;

  const now = new Date().toISOString();
  const insert = db.prepare(
    `INSERT INTO entries (name, summary, url, audience, starts_at, ends_at, timeline, category, image_url, quality, status, source, created_at, updated_at)
     VALUES (@name, @summary, @url, @audience, @startsAt, @endsAt, @timeline, @category, @imageUrl, @quality, @status, 'search', @now, @now)`,
  );

  const perCategory = new Map<string, { published: number; review: number }>();
  const run = db.transaction(() => {
    let idx = 0; // index WITHIN each category (frozen split is per category)
    let currentCat = SEED_ENTRIES[0]?.category ?? '';
    for (const e of SEED_ENTRIES) {
      if (e.category !== currentCat) {
        currentCat = e.category;
        idx = 0;
      }
      const status = idx % 2 === 0 ? 'published' : 'review';
      insert.run({
        name: e.name,
        summary: e.summary,
        url: e.url,
        audience: JSON.stringify(e.audience),
        startsAt: e.startsAt,
        endsAt: e.endsAt,
        timeline: e.timeline ?? '',
        category: e.category,
        imageUrl: placeholderFor(e.imageUrl, e.category),
        quality: e.quality,
        status,
        now,
      });
      const c = perCategory.get(e.category) ?? { published: 0, review: 0 };
      c[status] += 1;
      perCategory.set(e.category, c);
      idx += 1;
    }
  });
  run();

  const parts = [...perCategory.entries()].map(
    ([cat, c]) => `${cat}: ${c.published} published / ${c.review} review`,
  );
  console.log(`[seed] first run: inserted ${SEED_ENTRIES.length} entries (${parts.join(', ')})`);
}
