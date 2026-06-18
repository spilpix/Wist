import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'

let _db: Database.Database | null = null

export function db(): Database.Database {
  if (!_db) throw new Error('Database not initialized')
  return _db
}

function applyPragmas(d: Database.Database) {
  d.pragma('journal_mode = WAL')
  // the app and the local agent API are both writers — wait for a lock instead of
  // failing reads with SQLITE_BUSY the instant another connection is mid-write
  d.pragma('busy_timeout = 5000')
  // NORMAL is the SQLite-recommended durability level for WAL: safe across app
  // crashes, and keeps the WAL checkpointed often enough that it can't drift huge.
  d.pragma('synchronous = NORMAL')
  d.pragma('wal_autocheckpoint = 256')
  d.pragma('foreign_keys = ON')
}

// open a throwaway connection and ask SQLite whether the file is structurally sound
function quickCheck(file: string): string {
  let probe: Database.Database | null = null
  try {
    probe = new Database(file)
    probe.pragma('busy_timeout = 5000')
    return String(probe.pragma('quick_check', { simple: true }))
  } catch (e) {
    return `open-failed: ${(e as Error).message}`
  } finally {
    try {
      probe?.close()
    } catch {
      /* ignore */
    }
  }
}

// best-effort in-place repair of the common corruption class (desynced/garbled
// index pages): checkpoint the WAL, REINDEX, re-check. Returns true if now sound.
function tryRepair(file: string): boolean {
  let d: Database.Database | null = null
  try {
    d = new Database(file)
    d.pragma('busy_timeout = 5000')
    try {
      d.pragma('wal_checkpoint(TRUNCATE)')
    } catch {
      /* ignore */
    }
    d.exec('REINDEX')
    return String(d.pragma('quick_check', { simple: true })) === 'ok'
  } catch {
    return false
  } finally {
    try {
      d?.close()
    } catch {
      /* ignore */
    }
  }
}

export function openDatabase(): Database.Database {
  const dir = app.getPath('userData')
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, 'wist.db')

  // Corruption guard: a malformed disk image otherwise makes EVERY query throw
  // 'database disk image is malformed' and bricks the whole app. If an existing
  // db fails its integrity check, try a REINDEX repair; if that can't fix it,
  // move the file ASIDE (never delete — it stays recoverable) and start fresh so
  // the app always opens. Migrations then rebuild the empty schema.
  if (fs.existsSync(file)) {
    const status = quickCheck(file)
    if (status !== 'ok') {
      console.error(`[db] wist.db integrity check failed (${status}) — attempting repair`)
      if (tryRepair(file)) {
        console.error('[db] repaired wist.db in place (REINDEX)')
      } else {
        const stamp = new Date().toISOString().replace(/[:.]/g, '-')
        const aside = path.join(dir, `wist.corrupt-${stamp}.db`)
        try {
          fs.renameSync(file, aside)
          for (const ext of ['-wal', '-shm']) {
            if (fs.existsSync(file + ext)) fs.rmSync(file + ext, { force: true })
          }
          console.error(`[db] unrepairable — moved corrupt db to ${aside}; starting fresh`)
        } catch (e) {
          console.error('[db] failed to set aside corrupt db', e)
        }
      }
    }
  }

  _db = new Database(file)
  applyPragmas(_db)
  migrate(_db)
  return _db
}

// Fold the WAL back into the main db and close cleanly on quit. Without this the
// WAL could be left un-checkpointed across an unclean exit, which is a classic
// path to a "malformed" image on the next launch.
export function closeDatabase(): void {
  if (!_db) return
  try {
    _db.pragma('wal_checkpoint(TRUNCATE)')
  } catch {
    /* ignore */
  }
  try {
    _db.close()
  } catch {
    /* ignore */
  }
  _db = null
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

  // 008 — tasks gain a kanban 'status' (To-do / In progress / Done). Pure additive;
  // 'done' is kept in sync with status by the db layer for backward compatibility
  // (Home, the sidebar badge and the agent API all still read 'done').
  `
  ALTER TABLE tasks ADD COLUMN status TEXT NOT NULL DEFAULT 'todo';
  UPDATE tasks SET status = 'done' WHERE done = 1;
  CREATE INDEX idx_tasks_status ON tasks(status, created_at);
  `,

  // 009 — projects: drop the kind CHECK so the user can type any project "type".
  // Table rebuild (SQLite can't alter a CHECK); runs with FK off so no cascade.
  `
  CREATE TABLE projects_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    client TEXT,
    kind TEXT NOT NULL DEFAULT 'video',
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
  INSERT INTO projects_new (id,name,client,kind,status,color,cover_path,deadline,tools,description,pinned,sort,created_at,updated_at)
    SELECT id,name,client,kind,status,color,cover_path,deadline,tools,description,pinned,sort,created_at,updated_at FROM projects;
  DROP TABLE projects;
  ALTER TABLE projects_new RENAME TO projects;
  `,

  // 010 — Trash (soft-delete) for hubs(projects) / notes / tasks. Additive nullable
  // columns; list queries filter `deleted_at IS NULL`, the Trash restores/purges.
  `
  ALTER TABLE projects ADD COLUMN deleted_at TEXT;
  ALTER TABLE notes ADD COLUMN deleted_at TEXT;
  ALTER TABLE tasks ADD COLUMN deleted_at TEXT;
  CREATE INDEX idx_projects_deleted ON projects(deleted_at);
  CREATE INDEX idx_notes_deleted ON notes(deleted_at);
  CREATE INDEX idx_tasks_deleted ON tasks(deleted_at);
  `,

  // 011 — hub workspace: user-created sections ("folders") inside a project that
  // group its assets. Assets gain a nullable section_id (NULL = ungrouped). Additive.
  `
  CREATE TABLE project_sections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    sort INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE INDEX idx_project_sections_project ON project_sections(project_id);
  ALTER TABLE project_assets ADD COLUMN section_id INTEGER REFERENCES project_sections(id) ON DELETE SET NULL;
  `,

  // 012 — hub work sessions: a log of work stints per hub (duration + a pasted report
  // + a snapshot diff of what changed in the hub's linked folders). Additive.
  `
  CREATE TABLE project_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    started_at TEXT,
    ended_at TEXT,
    duration_seconds INTEGER NOT NULL DEFAULT 0,
    title TEXT,
    report TEXT,
    changes_json TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE INDEX idx_project_sessions_project ON project_sessions(project_id);

  -- one snapshot per hub of its linked folders' files, used to diff what changed
  -- between sessions (path -> "<mtimeMs>:<size>")
  CREATE TABLE project_snapshots (
    project_id INTEGER PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
    files_json TEXT NOT NULL DEFAULT '{}',
    taken_at TEXT
  );
  `,

  // 013 — task reminders: an optional remind_at timestamp + a 'reminded' flag the
  // main-process scheduler sets once it has fired the OS notification. Additive.
  `
  ALTER TABLE tasks ADD COLUMN remind_at TEXT;
  ALTER TABLE tasks ADD COLUMN reminded INTEGER NOT NULL DEFAULT 0;
  CREATE INDEX idx_tasks_remind ON tasks(remind_at, reminded);
  `,

  // 014 — cross-link a task to a Library title (e.g. "edit intro" → the source video).
  // Additive nullable FK; ON DELETE SET NULL so deleting the title just unlinks.
  `
  ALTER TABLE tasks ADD COLUMN linked_title_id INTEGER REFERENCES titles(id) ON DELETE SET NULL;
  `,

  // 015 — hub patches: a per-hub changelog / version log (planned / in progress /
  // released entries with markdown notes). Turns a hub into a place to track the
  // project's history of changes, not just its files. Additive.
  `
  CREATE TABLE project_patches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    version TEXT,
    title TEXT,
    body TEXT,
    status TEXT NOT NULL DEFAULT 'released',
    tags TEXT NOT NULL DEFAULT '[]',
    released_at TEXT,
    sort INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE INDEX idx_project_patches_project ON project_patches(project_id);
  `,

  // 016 — local music library (a "local Spotify"): scanned audio files with parsed
  // tags + embedded/sidecar cover, like/play-count, and user playlists of local tracks.
  `
  CREATE TABLE tracks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    artist TEXT,
    album TEXT,
    album_artist TEXT,
    genre TEXT,
    year INTEGER,
    track_no INTEGER,
    disc_no INTEGER,
    duration_seconds REAL,
    cover_path TEXT,
    liked INTEGER NOT NULL DEFAULT 0,
    play_count INTEGER NOT NULL DEFAULT 0,
    last_played TEXT,
    added_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE INDEX idx_tracks_artist ON tracks(artist);
  CREATE INDEX idx_tracks_album ON tracks(album);
  CREATE INDEX idx_tracks_liked ON tracks(liked);

  CREATE TABLE music_playlists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    cover_path TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE TABLE music_playlist_tracks (
    playlist_id INTEGER NOT NULL REFERENCES music_playlists(id) ON DELETE CASCADE,
    track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
    sort INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (playlist_id, track_id)
  );
  CREATE INDEX idx_mpt_playlist ON music_playlist_tracks(playlist_id);
  `,

  // 017 — Tools launcher: classify each registered launcher entry as a game or a
  // program/app, so the section can be a local "Steam" for both. Additive.
  `
  ALTER TABLE games ADD COLUMN kind TEXT NOT NULL DEFAULT 'game';
  `,

  // 018 — Notes become an Obsidian-style vault: a tree of folders. note_folders can
  // nest (parent_id), and a note can live in one folder (folder_id, NULL = root).
  // Additive (CREATE + nullable ADD COLUMN) so FK enforcement can stay on. Deleting a
  // folder SETs its notes' folder_id to NULL (they fall back to the root) — the db
  // layer reparents children up first, so nothing is lost.
  `
  CREATE TABLE note_folders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    parent_id INTEGER REFERENCES note_folders(id) ON DELETE CASCADE,
    sort INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE INDEX idx_note_folders_parent ON note_folders(parent_id);
  ALTER TABLE notes ADD COLUMN folder_id INTEGER REFERENCES note_folders(id) ON DELETE SET NULL;
  CREATE INDEX idx_notes_folder ON notes(folder_id);
  `,

  // 019 — task comments: a simple per-task comment thread, shown in the task detail
  // "peek" panel (the Notion list→page pattern). Cascades when the task is purged.
  `
  CREATE TABLE task_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE INDEX idx_task_comments_task ON task_comments(task_id);
  `,

  // 020 — Games/Tools launcher removed: drop its tables (the feature was deleted).
  `
  DROP TABLE IF EXISTS game_sessions;
  DROP TABLE IF EXISTS games;
  `,

  // 021 — universal Favorites ("pin anything"): a single list that can hold ANY
  // entity across every module — a note, hub(project), title, track, canvas, task,
  // vault file, or a whole route. `ref` is the entity identity (numeric id as text,
  // or a path/route string); label/sublabel/cover are a SNAPSHOT for display, but the
  // db layer re-resolves them live on list (and drops favorites whose entity is gone).
  // The unique (kind,ref) index makes pin/unpin idempotent. This SUPERSEDES the old
  // "Избранное = titles with rating ≥ 9" notion (that auto-list survives as a separate
  // "Топ по оценке" section).
  `
  CREATE TABLE favorites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,
    ref TEXT NOT NULL,
    label TEXT NOT NULL DEFAULT '',
    sublabel TEXT,
    cover_path TEXT,
    route TEXT,
    sort INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE UNIQUE INDEX idx_favorites_kind_ref ON favorites(kind, ref);
  `,

  // 022 — manual task ordering: a `position` for drag-to-reorder in the list view.
  // DEFAULT 0 means "unordered" — the list ORDER BY falls back to the natural sort
  // (priority, newest-first) until the user drags, which assigns 1..N to the visible
  // todo set. Additive, so FK enforcement stays on.
  `
  ALTER TABLE tasks ADD COLUMN position INTEGER NOT NULL DEFAULT 0;
  `,

  // 023 — Library collections ("folders"): user-created groups that gather ANY
  // library entity (a title / vault file / playlist / track …) into one named,
  // optionally colored tile — like a desktop app-folder. Membership is polymorphic
  // (kind + ref), mirroring the favorites model; the item's label/cover are
  // re-resolved live from its source row, so a folder never holds stale snapshots.
  // Deleting a folder drops its membership rows only — the items themselves stay.
  `
  CREATE TABLE collections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    icon TEXT,
    color TEXT,
    sort INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE TABLE collection_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    ref TEXT NOT NULL,
    sort INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE INDEX idx_collection_items_collection ON collection_items(collection_id);
  CREATE UNIQUE INDEX idx_collection_items_unique ON collection_items(collection_id, kind, ref);
  `,

  // 024 — AI conversation reports. The "Диалоги с ИИ" feature is SHELVED (its UI/IPC
  // were removed), but this migration stays so the version numbering never shifts for
  // anyone who already applied it. The table is inert until/unless the feature returns.
  `
  CREATE TABLE ai_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    assistant TEXT NOT NULL DEFAULT 'AI',
    chat TEXT NOT NULL DEFAULT 'Без названия',
    title TEXT NOT NULL DEFAULT '',
    summary TEXT NOT NULL DEFAULT '',
    tags TEXT NOT NULL DEFAULT '[]',
    body TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT 'paste',
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE INDEX idx_ai_reports_chat ON ai_reports(assistant, chat);
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
