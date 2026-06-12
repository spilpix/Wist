import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'

let _db: Database.Database | null = null

export function db(): Database.Database {
  if (!_db) throw new Error('Database not initialized')
  return _db
}

export function openDatabase(): Database.Database {
  const dir = app.getPath('userData')
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, 'wist.db')
  _db = new Database(file)
  _db.pragma('journal_mode = WAL')
  _db.pragma('foreign_keys = ON')
  migrate(_db)
  return _db
}

const MIGRATIONS: string[] = [
  // 001 — initial schema
  `
  CREATE TABLE titles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    original_title TEXT,
    type TEXT NOT NULL DEFAULT 'anime' CHECK (type IN ('anime','movie','series','cartoon','youtube')),
    status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('watching','completed','planned','on_hold','dropped')),
    rating INTEGER CHECK (rating BETWEEN 1 AND 10),
    cover_path TEXT,
    total_episodes INTEGER NOT NULL DEFAULT 1,
    year INTEGER,
    genres TEXT NOT NULL DEFAULT '[]',
    tags TEXT NOT NULL DEFAULT '[]',
    notes TEXT,
    intro_end_seconds REAL,
    date_added TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    date_started TEXT,
    date_finished TEXT
  );

  CREATE TABLE episodes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title_id INTEGER NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
    episode_number INTEGER NOT NULL DEFAULT 1,
    season INTEGER NOT NULL DEFAULT 1,
    name TEXT,
    file_path TEXT,
    duration_seconds REAL,
    watched INTEGER NOT NULL DEFAULT 0,
    watch_date TEXT,
    watch_position_seconds REAL NOT NULL DEFAULT 0
  );
  CREATE INDEX idx_episodes_title ON episodes(title_id);
  CREATE INDEX idx_episodes_path ON episodes(file_path);

  CREATE TABLE moments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title_id INTEGER NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
    episode_id INTEGER REFERENCES episodes(id) ON DELETE SET NULL,
    timestamp_seconds REAL NOT NULL DEFAULT 0,
    screenshot_path TEXT,
    note TEXT,
    tag TEXT CHECK (tag IN ('epic','funny','sad','important','beautiful')),
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE INDEX idx_moments_title ON moments(title_id);

  CREATE TABLE youtube_sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title_id INTEGER NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
    channel_url TEXT,
    playlist_url TEXT,
    last_synced TEXT
  );

  CREATE TABLE watch_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title_id INTEGER REFERENCES titles(id) ON DELETE SET NULL,
    episode_id INTEGER REFERENCES episodes(id) ON DELETE SET NULL,
    started_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    ended_at TEXT,
    duration_seconds REAL NOT NULL DEFAULT 0
  );
  CREATE INDEX idx_sessions_started ON watch_sessions(started_at);

  CREATE TABLE screenshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    moment_id INTEGER REFERENCES moments(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  `,
]

function migrate(d: Database.Database) {
  d.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now','localtime')))`)
  const applied = new Set(
    (d.prepare('SELECT version FROM schema_migrations').all() as Array<{ version: number }>).map((r) => r.version)
  )
  const run = d.transaction((version: number, sql: string) => {
    d.exec(sql)
    d.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(version)
  })
  MIGRATIONS.forEach((sql, i) => {
    const version = i + 1
    if (!applied.has(version)) run(version, sql)
  })
}

export function now(): string {
  // matches sqlite datetime('now','localtime') format
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}
