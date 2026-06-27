// Verifies FTS5 note search (migration 027): full-body + Cyrillic case-insensitivity
// + prefix + snippet + trashed-exclusion, through the real IPC on a throwaway DB.
//   Run: npx electron scripts/smoke-fts.cjs
const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs')

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wist-fts-'))
process.env.WIST_USER_DATA = tmpRoot

const { app, BrowserWindow } = require('electron')
require(path.join(__dirname, '..', 'dist-electron', 'main.js'))

app.whenReady().then(() => {
  setTimeout(async () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) { console.error('no window'); app.exit(3); return }

    const result = await win.webContents.executeJavaScript(`(async () => {
      const out = {}
      const n1 = await window.wist.notes.create({ title: 'Проект Бард', content: 'Это длинный текст про архитектуру и Обсидиан внутри заметки.' })
      await window.wist.notes.create({ title: 'Other', content: 'nothing relevant here at all' })

      const r1 = await window.wist.notes.searchFts('обсидиан')      // body match, lowercase
      out.bodyCyrillic = r1.some(h => h.id === n1.id)
      out.snippet = (r1.find(h => h.id === n1.id)?.snippet || '').length > 0

      const r2 = await window.wist.notes.searchFts('ОБСИДИАН')      // uppercase of a word → case-insensitive
      out.caseInsensitive = r2.some(h => h.id === n1.id)

      const r3 = await window.wist.notes.searchFts('архи')          // prefix
      out.prefix = r3.some(h => h.id === n1.id)

      const r4 = await window.wist.notes.searchFts('nothing')       // latin sanity
      out.latin = r4.length > 0

      await window.wist.notes.remove(n1.id)                         // soft-delete → trash
      const r5 = await window.wist.notes.searchFts('обсидиан')
      out.trashedExcluded = !r5.some(h => h.id === n1.id)
      return out
    })()`)

    console.log('fts:', JSON.stringify(result, null, 2))
    const pass = result.bodyCyrillic && result.snippet && result.caseInsensitive && result.prefix && result.latin && result.trashedExcluded
    console.log(pass ? 'PASS' : 'FAIL')
    try { fs.rmSync(tmpRoot, { recursive: true, force: true }) } catch { /* best effort */ }
    app.exit(pass ? 0 : 1)
  }, 2800)
})
