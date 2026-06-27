// Isolated runtime smoke for the layering refactor. Boots the BUILT app against a
// THROWAWAY userData dir (WIST_USER_DATA — honoured by main.ts, so real data is never
// touched), seeds a little content, visits the refactored routes, fails on any console
// error (React's "Maximum update depth" loop guard logs at error level, so a bad data
// hook would be caught), and screenshots the migrated Tasks page as proof.
//   Run:  npx electron scripts/smoke-refactor.cjs
const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wist-smoke-'))
process.env.WIST_USER_DATA = tmp

require(path.join(__dirname, '..', 'dist-electron', 'main.js'))

const errors = []
app.whenReady().then(() => {
  setTimeout(async () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) { console.log('RESULT: NO_WINDOW'); app.exit(3); return }
    win.webContents.on('console-message', (_e, level, message) => {
      if (level >= 3) errors.push(message.slice(0, 300))
    })

    await win.webContents.executeJavaScript(`(async () => {
      const t = await window.wist.tasks.list()
      if (!t.length) {
        await window.wist.tasks.create({ title: 'Тест-задача', status: 'todo' })
        await window.wist.tasks.create({ title: 'Сделано', status: 'done' })
      }
      const p = await window.wist.projects.list()
      if (!p.length) await window.wist.projects.create({ name: 'Тест-проект' })
      const n = await window.wist.notes.list()
      if (!n.length) await window.wist.notes.create({ title: 'Заметка', content: 'тест [[Тест-проект]] #идея' })
      const cv = await window.wist.canvas.list()
      if (!cv.length) await window.wist.canvas.create('Тест-холст')
      return 'seeded'
    })()`).catch((e) => errors.push('seed: ' + e.message))

    const routes = ['#/tasks', '#/projects', '#/notes', '#/calendar', '#/vault', '#/canvas', '#/tree', '#/']
    for (const r of routes) {
      await win.webContents.executeJavaScript(`location.hash = '${r}'`).catch((e) => errors.push('nav ' + r + ': ' + e.message))
      await new Promise((res) => setTimeout(res, 1600))
    }

    // open a hub detail page — exercises the extracted project/Overview + project/AssetItems
    const pid = await win.webContents.executeJavaScript(`window.wist.projects.list().then((p) => (p[0] ? p[0].id : 0))`).catch(() => 0)
    if (pid) {
      await win.webContents.executeJavaScript(`location.hash = '#/project/' + ${pid}`)
      await new Promise((res) => setTimeout(res, 1600))
    }

    // open a board — mounts CanvasBoard, runs the extracted useElementSize + useCanvasPersistence
    const cid = await win.webContents.executeJavaScript(`window.wist.canvas.list().then((c) => (c[0] ? c[0].id : 0))`).catch(() => 0)
    if (cid) {
      await win.webContents.executeJavaScript(`location.hash = '#/canvas/' + ${cid}`)
      await new Promise((res) => setTimeout(res, 2000))
      try {
        fs.writeFileSync(path.join(__dirname, 'smoke-board.png'), (await win.webContents.capturePage()).toPNG())
      } catch { /* ignore */ }
    }

    // screenshot the migrated Tasks page (data layer) as proof it renders
    await win.webContents.executeJavaScript(`location.hash = '#/tasks'`)
    await new Promise((res) => setTimeout(res, 1600))
    try {
      const img = await win.webContents.capturePage()
      fs.writeFileSync(path.join(__dirname, 'smoke-tasks.png'), img.toPNG())
    } catch { /* ignore */ }

    console.log('CONSOLE_ERRORS:', errors.length ? JSON.stringify(errors.slice(0, 8), null, 2) : 'none')
    console.log('RESULT:', errors.length ? 'ERRORS_SEEN' : 'CLEAN')
    app.exit(errors.length ? 1 : 0)
  }, 2600)
})
