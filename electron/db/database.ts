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

  // 002 — books (type CHECK rebuild + reading_progress) and notes
  `
  CREATE TABLE titles_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    original_title TEXT,
    type TEXT NOT NULL DEFAULT 'anime' CHECK (type IN ('anime','movie','series','cartoon','youtube','book')),
    status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('watching','completed','planned','on_hold','dropped')),
    rating INTEGER CHECK (rating BETWEEN 1 AND 10),
    cover_path TEXT,
    total_episodes INTEGER NOT NULL DEFAULT 1,
    reading_progress INTEGER NOT NULL DEFAULT 0,
    year INTEGER,
    genres TEXT NOT NULL DEFAULT '[]',
    tags TEXT NOT NULL DEFAULT '[]',
    notes TEXT,
    intro_end_seconds REAL,
    date_added TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    date_started TEXT,
    date_finished TEXT
  );
  INSERT INTO titles_new (id,title,original_title,type,status,rating,cover_path,total_episodes,year,genres,tags,notes,intro_end_seconds,date_added,date_started,date_finished)
    SELECT id,title,original_title,type,status,rating,cover_path,total_episodes,year,genres,tags,notes,intro_end_seconds,date_added,date_started,date_finished FROM titles;
  DROP TABLE titles;
  ALTER TABLE titles_new RENAME TO titles;

  CREATE TABLE notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',
    tags TEXT NOT NULL DEFAULT '[]',
    linked_title_id INTEGER REFERENCES titles(id) ON DELETE SET NULL,
    pinned INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE INDEX idx_notes_updated ON notes(updated_at);
  `,

  // 003 — second brain: journal, tasks, playlists, vault files, note sources
  `
  CREATE TABLE journal_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    day TEXT NOT NULL UNIQUE,
    mood INTEGER CHECK (mood BETWEEN 1 AND 5),
    content TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    note TEXT,
    done INTEGER NOT NULL DEFAULT 0,
    priority TEXT NOT NULL DEFAULT 'none' CHECK (priority IN ('none','low','high')),
    due_date TEXT,
    tags TEXT NOT NULL DEFAULT '[]',
    source TEXT NOT NULL DEFAULT 'user',
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    completed_at TEXT
  );
  CREATE INDEX idx_tasks_done ON tasks(done, created_at);

  CREATE TABLE playlists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    service TEXT NOT NULL DEFAULT 'other',
    cover_path TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE vault_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    path TEXT NOT NULL,
    size INTEGER NOT NULL DEFAULT 0,
    kind TEXT NOT NULL DEFAULT 'other',
    tags TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  ALTER TABLE notes ADD COLUMN source TEXT NOT NULL DEFAULT 'user';
  `,

  // 004 — projects: a creative workspace that gathers folders/files/refs and
  // links notes & tasks. Pure additive (CREATE + nullable ADD COLUMN) so FK can stay on.
  `
  CREATE TABLE projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    client TEXT,
    kind TEXT NOT NULL DEFAULT 'video' CHECK (kind IN ('video','motion','edit','3d','design','other')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('idea','active','review','done','archived')),
    color TEXT,
    cover_path TEXT,
    deadline TEXT,
    tools TEXT NOT NULL DEFAULT '[]',
    description TEXT,
    pinned INTEGER NOT NULL DEFAULT 0,
    sort INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE project_assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    kind TEXT NOT NULL DEFAULT 'file' CHECK (kind IN ('folder','file','url','image')),
    path TEXT,
    url TEXT,
    label TEXT,
    thumb_path TEXT,
    sort INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE INDEX idx_project_assets_project ON project_assets(project_id);

  ALTER TABLE notes ADD COLUMN project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL;
  ALTER TABLE tasks ADD COLUMN project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL;
  `,

  // 005 — vault becomes a folder tree: parent_id makes nesting possible.
  // kind gains 'folder' (a virtual folder you create) and 'diskfolder' (a live
  // link to an OS directory — opening it browses the real contents, no flat dump).
  `
  ALTER TABLE vault_files ADD COLUMN parent_id INTEGER REFERENCES vault_files(id) ON DELETE CASCADE;
  CREATE INDEX idx_vault_parent ON vault_files(parent_id);
  `,

  // 006 — games library with Steam-style automatic playtime tracking
  `
  CREATE TABLE games (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    exe_path TEXT NOT NULL,
    exe_name TEXT NOT NULL,
    cover_path TEXT,
    total_seconds INTEGER NOT NULL DEFAULT 0,
    last_played TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE TABLE game_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    started_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    ended_at TEXT,
    seconds INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX idx_game_sessions_game ON game_sessions(game_id);
  `,

  // 007 — Canvas: an infinite board stored as one JSON blob per canvas (Obsidian-style)
  `
  CREATE TABLE canvases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    data TEXT NOT NULL DEFAULT '{"nodes":[],"edges":[]}',
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  `,
]

function migrate(d: Database.Database) {
  d.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now','localtime')))`)
  const applied = new Set(
    (d.prepare('SELECT version FROM schema_migrations').all() as Array<{ version: number }>).map((r) => r.version)
  )
  const pending = MIGRATIONS.map((sql, i) => ({ version: i + 1, sql })).filter((m) => !applied.has(m.version))
  if (!pending.length) return

  // FK enforcement must be off while tables are rebuilt (CHECK constraints can't
  // be altered in SQLite) — otherwise DROP TABLE titles would cascade-delete
  // episodes/moments. PRAGMA is a no-op inside a transaction, so manage them manually.
  d.pragma('foreign_keys = OFF')
  try {
    for (const m of pending) {
      d.exec('BEGIN')
      try {
        d.exec(m.sql)
        d.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(m.version)
        d.exec('COMMIT')
      } catch (err) {
        d.exec('ROLLBACK')
        throw err
      }
    }
  } finally {
    d.pragma('foreign_keys = ON')
  }
}

export function now(): string {
  // matches sqlite datetime('now','localtime') format
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}
