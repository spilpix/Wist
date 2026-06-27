// Screenshot the Canvas Phase-2 Relations panel (edge-backed backlinks on the board).
// Isolated via WIST_USER_DATA. Run: npx electron scripts/shoot-canvas-relations.cjs
const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs')

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wist-canvasrel-'))
process.env.WIST_USER_DATA = tmpRoot

const { app, BrowserWindow } = require('electron')
require(path.join(__dirname, '..', 'dist-electron', 'main.js'))
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

app.whenReady().then(() => {
  setTimeout(async () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) { console.error('no window'); app.exit(3); return }
    win.setSize(1340, 940)

    const cid = await win.webContents.executeJavaScript(`(async () => {
      const n1 = await window.wist.notes.create({ title: 'Карта проекта', content: 'x' })
      const t1 = await window.wist.tasks.create({ title: 'Собрать референсы' })
      const c1 = await window.wist.canvas.create('Мудборд')
      // link the canvas to a note + task so the panel has content (same edges the board cards write)
      await window.wist.edges.link({ type: 'canvas', id: c1.id }, 'refers', { type: 'note', id: n1.id })
      await window.wist.edges.link({ type: 'canvas', id: c1.id }, 'refers', { type: 'task', id: t1.id })
      return c1.id
    })()`)

    await win.webContents.executeJavaScript(`location.hash = '#/canvas/${cid}'`)
    await wait(2000)
    // open the relations panel via its toolbar toggle
    await win.webContents.executeJavaScript(`(() => {
      const b = [...document.querySelectorAll('button')].find(x => /Связи|Relations/.test(x.getAttribute('title') || ''))
      if (b) b.click()
    })()`)
    await wait(800)

    const img = (await win.webContents.capturePage()).resize({ width: 1100 })
    fs.writeFileSync(path.join(__dirname, 'canvas-relations.png'), img.toPNG())
    console.log('shot canvas-relations')

    try { fs.rmSync(tmpRoot, { recursive: true, force: true }) } catch { /* best effort */ }
    app.exit(0)
  }, 2400)
})
