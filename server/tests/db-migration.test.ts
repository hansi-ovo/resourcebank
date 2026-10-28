import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { openDb } from '../src/db';

/**
 * The entries.source CHECK gained 'manual' (manual-add feature). SQLite
 * cannot ALTER a CHECK, so openDb rebuilds an entries table whose stored
 * DDL predates the change. The harness always creates fresh DBs from
 * schema.sql — this is the only test that exercises the rebuild path.
 */
describe('entries source CHECK migration (manual)', () => {
  it('rebuilds an old DB preserving rows and accepting source=manual', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'rb-mig-'));
    try {
      const file = path.join(dir, 'old.sqlite');
      // PRE-migration schema: no 'manual' in the CHECK, no timeline/notes —
      // the realistic oldest shape (column migrations must run first).
      const old = new Database(file);
      old.exec(`
        CREATE TABLE entries (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          summary TEXT NOT NULL,
          url TEXT NOT NULL UNIQUE,
          audience TEXT NOT NULL,
          starts_at TEXT,
          ends_at TEXT,
          category TEXT NOT NULL CHECK (category IN ('on-campus','fellowships','experiential','events','training')),
          image_url TEXT,
          quality INTEGER,
          status TEXT NOT NULL DEFAULT 'review' CHECK (status IN ('review','published','removed','withdrawn')),
          source TEXT NOT NULL DEFAULT 'search' CHECK (source IN ('search','update-apply')),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX idx_entries_status ON entries(status);
      `);
      old
        .prepare(
          "INSERT INTO entries (name, summary, url, audience, category, status, source, created_at, updated_at) VALUES ('Old Program','Kept summary','https://old.example.org/','[\"All\"]','events','published','search','2026-01-01','2026-01-01')",
        )
        .run();
      old.close();

      // openDb must add timeline/notes, rebuild the CHECK, and preserve the row
      const db = openDb(file);
      const rows = db.prepare('SELECT * FROM entries').all() as Array<{
        id: number;
        name: string;
        source: string;
        timeline: string;
        notes: string;
      }>;
      expect(rows).toHaveLength(1);
      expect(rows[0]!.name).toBe('Old Program');
      expect(rows[0]!.source).toBe('search');
      expect(rows[0]!.timeline).toBe('');

      // 'manual' is accepted now
      expect(() =>
        db
          .prepare(
            "INSERT INTO entries (name, summary, url, audience, category, status, source, created_at, updated_at) VALUES ('M','M summary','https://m.example.org/','[]','events','published','manual','2026-01-02','2026-01-02')",
          )
          .run(),
      ).not.toThrow();

      // the CHECK still enforces the known set
      expect(() =>
        db
          .prepare(
            "INSERT INTO entries (name, summary, url, audience, category, status, source, created_at, updated_at) VALUES ('B','B','https://b.example.org/','[]','events','published','bogus','2026-01-02','2026-01-02')",
          )
          .run(),
      ).toThrow();

      db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('is idempotent — a rebuilt DB is not rebuilt again', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'rb-mig2-'));
    try {
      const file = path.join(dir, 'twice.sqlite');
      openDb(file).close(); // fresh DB already has the new DDL
      const db = openDb(file); // second open must be a no-op
      const ddl = (
        db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'entries'").get() as { sql: string }
      ).sql;
      expect(ddl.includes("'manual'")).toBe(true);
      db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
