-- DKU Leadership Resource Bank — SQLite schema
-- Idempotent: CREATE IF NOT EXISTS everywhere (04-build-phases Phase 1).

CREATE TABLE IF NOT EXISTS entries (
  id           INTEGER PRIMARY KEY,
  name         TEXT NOT NULL,
  summary      TEXT NOT NULL,
  url          TEXT NOT NULL UNIQUE,
  audience     TEXT NOT NULL,            -- JSON array of strings
  starts_at    TEXT,                     -- ISO date, nullable
  ends_at      TEXT,                     -- ISO date, nullable (deadline)
  category     TEXT NOT NULL CHECK (category IN ('on-campus','fellowships','experiential','events','training')),
  image_url    TEXT,
  quality      INTEGER,
  status       TEXT NOT NULL DEFAULT 'review' CHECK (status IN ('review','published','removed','withdrawn')),
  source       TEXT NOT NULL DEFAULT 'search' CHECK (source IN ('search','update-apply')),
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_entries_status ON entries(status);
CREATE INDEX IF NOT EXISTS idx_entries_category ON entries(category);

CREATE TABLE IF NOT EXISTS pending_updates (
  id          INTEGER PRIMARY KEY,
  entry_id    INTEGER NOT NULL REFERENCES entries(id),
  diff        TEXT NOT NULL,             -- JSON: [{ field, from, to, note }]
  detected_at TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','applied','discarded'))
);

CREATE INDEX IF NOT EXISTS idx_pending_status ON pending_updates(status);

CREATE TABLE IF NOT EXISTS searches (
  id            INTEGER PRIMARY KEY,
  prompt        TEXT NOT NULL,
  scope         TEXT NOT NULL,           -- 'all' | category id
  started_at    TEXT NOT NULL,
  finished_at   TEXT,
  result_count  INTEGER
);

CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
