// Light-theme screenshots of card-heavy pages — checking that white cards on a
// white page still read after the flatter shadows + #F2F2F2 borders.
const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
require(path.join(__dirname, '..', 'dist-electron', 'main.js'))

app.whenReady().then(() => {
  setTimeout(async () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) { app.exit(3); return }
    win.setSize(1340, 880)
    await win.webContents.executeJavaScript(`(() => {
      const r = document.documentElement
      r.dataset.theme = 'light'
      ;['--accent','--accent-rgb','--accent-hover-rgb','--accent-bright-rgb'].forEach(p => r.style.removeProperty(p))
    })()`)
    for (const [name, hash] of [['settings', '#/settings'], ['tasks', '#/tasks'], ['stats', '#/stats'], ['library', '#/library']]) {
      await win.webContents.executeJavaScript(`location.hash=${JSON.stringify(hash)}`)
      await wait(1400)
      const img = (await win.webContents.capturePage()).resize({ width: 1000 })
      fs.writeFileSync(path.join(__dirname, `lt-${name}.png`), img.toPNG())
      console.log('shot', name)
    }
    app.exit(0)
  }, 2200)
})
