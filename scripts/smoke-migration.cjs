// Inspects the app database after a launch — verifies migration 002 applied cleanly.
// Run: npx electron scripts/smoke-migration.cjs
const { app } = require('electron')
const path = require('node:path')

app.whenReady().then(() => {
  try {
    const Database = require('better-sqlite3')
    // standalone-script runs get app name "Electron", so resolve the real app dir explicitly
    const file = path.join(app.getPath('appData'), 'Wist', 'wist.db')
    // not readonly: WAL databases need write access to the -shm file even for reads
    const db = new Database(file, { fileMustExist: true })
    const version = db.prepare('SELECT MAX(version) AS v FROM schema_migrations').get()
    const titlesSql = db.prepare(`SELECT sql FROM sqlite_master WHERE name = 'titles'`).get()
    const notesTable = db.prepare(`SELECT name FROM sqlite_master WHERE name = 'notes' AND type = 'table'`).get()
    const counts = {
      titles: db.prepare('SELECT COUNT(*) AS n FROM titles').get().n,
      episodes: db.prepare('SELECT COUNT(*) AS n FROM episodes').get().n,
      moments: db.prepare('SELECT COUNT(*) AS n FROM moments').get().n,
    }
    const fkCheck = db.pragma('foreign_key_check')
    db.close()

    console.log('db file:', file)
    console.log('schema version:', version.v)
    console.log('titles CHECK has book:', /'book'/.test(titlesSql.sql))
    console.log('titles has reading_progress:', /reading_progress/.test(titlesSql.sql))
    console.log('notes table exists:', !!notesTable)
    console.log('row counts:', JSON.stringify(counts))
    console.log('foreign_key_check violations:', fkCheck.length)
    app.exit(version.v === 2 && notesTable && fkCheck.length === 0 ? 0 : 1)
  } catch (err) {
    console.error('SMOKE FAILED:', err)
    app.exit(1)
  }
})
