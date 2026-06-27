// Safe data-layer smoke for the audit fixes. Runs under Electron (so the real
// better-sqlite3 native ABI is available) but against a THROWAWAY temp DB — it never
// touches the real wist.db. It applies the project's ACTUAL migrations (read from
// electron/db/database.ts, incl. the new 026) and the ACTUAL backup TABLES list (read
// from electron/ipc/data.ts), then exercises the exact SQL the fixed helpers use:
//   1. setContainer keeps ONE contains edge in lockstep with project_id (create/reparent/clear)
//   2. removeNode drops all edges touching a purged object (both directions)
//   3. backup round-trip now preserves edges/collections (export → wipe → import)
//   4. migration 026 created task_attachments
// Run: npx electron scripts/smoke-fixes.cjs
const { app } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const Database = require('better-sqlite3')

const root = path.join(__dirname, '..')

// pull a multi-line array literal of pure backtick/quoted strings out of a source file
// and eval it (the entries have NO ${} interpolation, so this is just string parsing)
function extractArray(file, marker) {
  const src = fs.readFileSync(path.join(root, file), 'utf8')
  const at = src.indexOf(marker)
  if (at < 0) throw new Error(`marker not found: ${marker}`)
  const open = src.indexOf('[', at)
  const close = src.indexOf('\n]', open)
  // eslint-disable-next-line no-eval
  return eval(src.slice(open, close + 2))
}

const results = []
const check = (name, cond, extra) => {
  results.push({ name, pass: !!cond, extra })
  console.log(`${cond ? 'ok  ' : 'FAIL'}  ${name}${extra ? '  ' + JSON.stringify(extra) : ''}`)
}

function run() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bard-smoke-'))
  const file = path.join(dir, 'smoke.db')
  const db = new Database(file)
  db.pragma('journal_mode = WAL')

  // --- apply the real migrations (FK off while rebuilding, like database.ts) ---
  const MIGRATIONS = extractArray('electron/db/database.ts', 'const MIGRATIONS')
  db.pragma('foreign_keys = OFF')
  for (const sql of MIGRATIONS) db.exec(sql)
  db.pragma('foreign_keys = ON')
  check(`migrations applied (${MIGRATIONS.length})`, MIGRATIONS.length >= 26)

  // --- migration 026: task_attachments must exist ---
  const hasAtt = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='task_attachments'").get()
  check('migration 026 created task_attachments', !!hasAtt)

  // exact helper SQL (mirrors electron/db/edges.ts)
  const setContainer = (childType, childId, projectId) => {
    db.prepare("DELETE FROM edges WHERE kind='contains' AND src_type='project' AND dst_type=? AND dst_id=?")
      .run(childType, String(childId))
    if (projectId != null) {
      db.prepare("INSERT OR IGNORE INTO edges (src_type, src_id, kind, dst_type, dst_id) VALUES ('project', ?, 'contains', ?, ?)")
        .run(String(projectId), childType, String(childId))
    }
  }
  const removeNode = (type, id) =>
    db.prepare('DELETE FROM edges WHERE (src_type=? AND src_id=?) OR (dst_type=? AND dst_id=?)')
      .run(type, String(id), type, String(id))
  const link = (st, si, kind, dt, di) =>
    db.prepare('INSERT OR IGNORE INTO edges (src_type, src_id, kind, dst_type, dst_id) VALUES (?, ?, ?, ?, ?)')
      .run(st, String(si), kind, dt, String(di))
  const containsOf = (childType, childId) =>
    db.prepare("SELECT src_id FROM edges WHERE kind='contains' AND dst_type=? AND dst_id=?").all(childType, String(childId)).map((r) => r.src_id)

  // seed projects + a task + a note
  const p1 = db.prepare("INSERT INTO projects (name) VALUES ('P1')").run().lastInsertRowid
  const p2 = db.prepare("INSERT INTO projects (name) VALUES ('P2')").run().lastInsertRowid
  const t1 = db.prepare("INSERT INTO tasks (title, project_id) VALUES ('T1', ?)").run(p1).lastInsertRowid
  const n1 = db.prepare("INSERT INTO notes (title, content) VALUES ('N1', '')").run().lastInsertRowid

  // 1a. create with project → one contains edge from P1
  setContainer('task', t1, p1)
  check('create: task contained by P1', JSON.stringify(containsOf('task', t1)) === JSON.stringify([String(p1)]), { edges: containsOf('task', t1) })

  // 1b. reparent to P2 → old edge gone, single edge now from P2 (no drift / no double-parent)
  setContainer('task', t1, p2)
  check('reparent: task now contained by P2 only', JSON.stringify(containsOf('task', t1)) === JSON.stringify([String(p2)]), { edges: containsOf('task', t1) })

  // 1c. clear project → no contains edge
  setContainer('task', t1, null)
  check('clear: task has no container', containsOf('task', t1).length === 0)

  // 2. removeNode drops all edges touching a purged node (both directions)
  setContainer('task', t1, p1) // contains P1 -> t1  (incoming on t1)
  link('task', t1, 'refers', 'note', n1) // refers t1 -> n1  (outgoing on t1)
  const before = db.prepare('SELECT COUNT(*) c FROM edges').get().c
  removeNode('task', t1)
  const touchingT1 = db.prepare("SELECT COUNT(*) c FROM edges WHERE (src_type='task' AND src_id=?) OR (dst_type='task' AND dst_id=?)").get(String(t1), String(t1)).c
  check('purge: no edges reference the removed task', touchingT1 === 0, { before, after: db.prepare('SELECT COUNT(*) c FROM edges').get().c })

  // 3. backup round-trip preserves edges + collections (uses the REAL TABLES list)
  const TABLES = extractArray('electron/ipc/data.ts', 'const TABLES')
  check("backup TABLES includes 'edges'", TABLES.includes('edges'), { tables: TABLES })
  check("backup TABLES includes 'collections' + 'task_attachments'", TABLES.includes('collections') && TABLES.includes('task_attachments'))

  // make some relations + a collection to round-trip
  link('task', t1, 'refers', 'note', n1)
  setContainer('note', n1, p1)
  const col = db.prepare("INSERT INTO collections (name) VALUES ('Col')").run().lastInsertRowid
  db.prepare("INSERT INTO collection_items (collection_id, kind, ref) VALUES (?, 'note', ?)").run(col, String(n1))
  const edgeCountPre = db.prepare('SELECT COUNT(*) c FROM edges').get().c
  const colItemsPre = db.prepare('SELECT COUNT(*) c FROM collection_items').get().c

  // export: snapshot each table (like data.exportAll)
  const snap = {}
  for (const tbl of TABLES) {
    try { snap[tbl] = db.prepare(`SELECT * FROM ${tbl}`).all() } catch { snap[tbl] = [] }
  }
  // import: wipe (reverse) then re-insert (forward), FK off, column-intersect (like the fixed importAll)
  db.pragma('foreign_keys = OFF')
  db.transaction(() => {
    for (const tbl of [...TABLES].reverse()) { try { db.prepare(`DELETE FROM ${tbl}`).run() } catch {} }
    for (const tbl of TABLES) {
      const rows = snap[tbl] || []
      if (!rows.length) continue
      const cols = db.prepare(`PRAGMA table_info(${tbl})`).all().map((c) => c.name).filter((c) => Object.prototype.hasOwnProperty.call(rows[0], c))
      if (!cols.length) continue
      const ins = db.prepare(`INSERT INTO ${tbl} (${cols.join(',')}) VALUES (${cols.map((c) => '@' + c).join(',')})`)
      for (const row of rows) { const clean = {}; for (const c of cols) clean[c] = row[c] ?? null; ins.run(clean) }
    }
  })()
  db.pragma('foreign_keys = ON')
  const edgeCountPost = db.prepare('SELECT COUNT(*) c FROM edges').get().c
  const colItemsPost = db.prepare('SELECT COUNT(*) c FROM collection_items').get().c
  check('round-trip: edges preserved', edgeCountPre > 0 && edgeCountPost === edgeCountPre, { pre: edgeCountPre, post: edgeCountPost })
  check('round-trip: collection_items preserved', colItemsPre > 0 && colItemsPost === colItemsPre, { pre: colItemsPre, post: colItemsPost })

  db.close()
  fs.rmSync(dir, { recursive: true, force: true })

  const allPass = results.every((r) => r.pass)
  console.log(allPass ? '\nPASS — all checks green' : '\nFAIL — see above')
  return allPass
}

app.whenReady().then(() => {
  let ok = false
  try { ok = run() } catch (e) { console.error('smoke crashed:', e); ok = false }
  app.exit(ok ? 0 : 1)
})
