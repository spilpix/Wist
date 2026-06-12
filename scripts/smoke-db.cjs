// Verifies better-sqlite3 loads inside Electron's runtime (ABI match) and basic SQL works.
const { app } = require('electron')
app.whenReady().then(() => {
  try {
    const Database = require('better-sqlite3')
    const db = new Database(':memory:')
    db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)')
    db.prepare('INSERT INTO t (name) VALUES (?)').run('wist')
    const row = db.prepare('SELECT * FROM t').get()
    console.log('SMOKE_OK', JSON.stringify(row), 'sqlite', db.pragma('user_version', { simple: true }))
    process.exit(0)
  } catch (err) {
    console.error('SMOKE_FAIL', err)
    process.exit(1)
  }
})
