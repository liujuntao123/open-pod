import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export type Db = Database.Database;

export function openDb(dbPath: string): Db {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

function migrate(db: Db): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS provider_connections (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL CHECK (provider IN ('fish', 'mimo')),
      name TEXT NOT NULL,
      base_url TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS voices (
      id TEXT PRIMARY KEY,
      provider_connection_id TEXT NOT NULL REFERENCES provider_connections(id),
      name TEXT NOT NULL,
      config_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS works (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chapters (
      id TEXT PRIMARY KEY,
      work_id TEXT NOT NULL REFERENCES works(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      position INTEGER NOT NULL,
      script_draft TEXT NOT NULL DEFAULT '',
      production_started INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS work_characters (
      id TEXT PRIMARY KEY,
      work_id TEXT NOT NULL REFERENCES works(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      is_narrator INTEGER NOT NULL DEFAULT 0,
      voice_id TEXT REFERENCES voices(id) ON DELETE SET NULL,
      param_override_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (work_id, name)
    );

    CREATE TABLE IF NOT EXISTS lines (
      id TEXT PRIMARY KEY,
      chapter_id TEXT NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
      work_character_id TEXT NOT NULL REFERENCES work_characters(id),
      text TEXT NOT NULL,
      position INTEGER NOT NULL,
      param_override_json TEXT NOT NULL DEFAULT '{}',
      audio_path TEXT,
      audio_fingerprint TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL CHECK (kind IN ('line_synthesis', 'chapter_export')),
      status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
      work_id TEXT,
      chapter_id TEXT,
      line_id TEXT,
      snapshot_json TEXT,
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      started_at TEXT,
      finished_at TEXT
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );


    CREATE INDEX IF NOT EXISTS idx_chapters_work ON chapters(work_id, position);
    CREATE INDEX IF NOT EXISTS idx_lines_chapter ON lines(chapter_id, position);
    CREATE INDEX IF NOT EXISTS idx_characters_work ON work_characters(work_id);
    CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status, created_at);
  `);

  ensureColumn(db, "chapters", "script_draft", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "chapters", "script_instruction", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "chapters", "script_source_text", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "chapters", "production_started", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "chapters", "bgm_preset_id", "TEXT");
  ensureColumn(db, "chapters", "bgm_volume", "INTEGER NOT NULL DEFAULT 45");
  ensureColumn(db, "chapters", "bgm_intro_seconds", "INTEGER NOT NULL DEFAULT 3");
  ensureColumn(db, "works", "provider", "TEXT NOT NULL DEFAULT 'fish'");

  // Existing chapters that already have lines are treated as in production.
  db.exec(`
    UPDATE chapters
    SET production_started = 1
    WHERE production_started = 0
      AND EXISTS (SELECT 1 FROM lines WHERE lines.chapter_id = chapters.id)
  `);

  const row = db.prepare(`SELECT value FROM settings WHERE key = 'tts_concurrency'`).get() as
    | { value: string }
    | undefined;
  if (!row) {
    db.prepare(`INSERT INTO settings (key, value) VALUES ('tts_concurrency', '1')`).run();
  }
}

function ensureColumn(
  db: Db,
  table: string,
  column: string,
  definition: string,
): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (cols.some((c) => c.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
