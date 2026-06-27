// Validates migration 025 (edges + project_id backfill) against a COPY of the live
// DB — so we prove the SQL is valid and the backfill is correct WITHOUT touching real
// data. Run: npx electron scripts/smoke-edges.cjs
const { app } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')

// migration 025 — kept verbatim in sync with electron/db/database.ts
const MIGRATION_025 = `
CREATE TABLE edges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  src_type TEXT NOT NULL,
  src_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  dst_type TEXT NOT NULL,
  dst_id TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE UNIQUE INDEX idx_edges_unique ON edges(src_type, src_id, kind, dst_type, dst_id);
CREATE INDEX idx_edges_src ON edges(src_type, src_id);
CREATE INDEX idx_edges_dst ON edges(dst_type, dst_id);

INSERT OR IGNORE INTO edges (src_type, src_id, kind, dst_type, dst_id)
  SELECT 'project', CAST(project_id AS TEXT), 'contains', 'task', CAST(id AS TEXT)
  FROM tasks WHERE project_id IS NOT NULL;
INSERT OR IGNORE INTO edges (src_type, src_id, kind, dst_type, dst_id)
  SELECT 'project', CAST(project_id AS TEXT), 'contains', 'note', CAST(id AS TEXT)
  FROM notes WHERE project_id IS NOT NULL;
`

app.whenReady().then(() => {
  try {
    const Database = require('better-sqlite3')
    const live = path.join(app.getPath('appData'), 'Wist', 'wist.db')
    if (!fs.existsSync(live)) {
      console.log('no live db yet — nothing to test, treating as pass')
      return app.exit(0)
    }
    // work on a throwaway copy so the real DB is never touched
    const copy = path.join(os.tmpdir(), `wist-edges-test-${process.pid}.db`)
    fs.copyFileSync(live, copy)

    const db = new Database(copy)
    db.pragma('foreign_keys = OFF')

    const expectTasks = db.prepare('SELECT COUNT(*) n FROM tasks WHERE project_id IS NOT NULL').get().n
    const expectNotes = db.prepare('SELECT COUNT(*) n FROM notes WHERE project_id IS NOT NULL').get().n

    db.exec('BEGIN')
    db.exec(MIGRATION_025)
    db.exec('COMMIT')

    const edgeCount = db.prepare('SELECT COUNT(*) n FROM edges').get().n
    const containsTasks = db.prepare("SELECT COUNT(*) n FROM edges WHERE kind='contains' AND dst_type='task'").get().n
    const containsNotes = db.prepare("SELECT COUNT(*) n FROM edges WHERE kind='contains' AND dst_type='note'").get().n
    const quick = db.pragma('quick_check')
    const fk = db.pragma('foreign_key_check')

    // idempotency: re-running the backfill must not duplicate (unique index holds)
    db.exec(`INSERT OR IGNORE INTO edges (src_type, src_id, kind, dst_type, dst_id)
      SELECT 'project', CAST(project_id AS TEXT), 'contains', 'task', CAST(id AS TEXT) FROM tasks WHERE project_id IS NOT NULL;`)
    const afterReRun = db.prepare('SELECT COUNT(*) n FROM edges').get().n

    db.close()
    fs.unlinkSync(copy)

    console.log('live db:', live)
    console.log('tasks w/ project_id:', expectTasks, '→ contains-task edges:', containsTasks, containsTasks === expectTasks ? 'OK' : 'MISMATCH')
    console.log('notes w/ project_id:', expectNotes, '→ contains-note edges:', containsNotes, containsNotes === expectNotes ? 'OK' : 'MISMATCH')
    console.log('total edges:', edgeCount)
    console.log('idempotent re-run (no dupes):', afterReRun === edgeCount ? 'OK' : `FAIL (${afterReRun} vs ${edgeCount})`)
    console.log('quick_check:', quick.map((r) => r.quick_check ?? r).join(', '))
    console.log('foreign_key_check violations:', fk.length)

    const pass =
      containsTasks === expectTasks &&
      containsNotes === expectNotes &&
      afterReRun === edgeCount &&
      quick.length === 1 &&
      (quick[0].quick_check === 'ok' || quick[0] === 'ok') &&
      fk.length === 0
    app.exit(pass ? 0 : 1)
  } catch (err) {
    console.error('SMOKE FAILED:', err)
    app.exit(1)
  }
})
