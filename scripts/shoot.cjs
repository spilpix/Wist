// Screenshot key pages (real data) at a fixed size so I can review the UI myself.
const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

require(path.join(__dirname, '..', 'dist-electron', 'main.js'))

app.whenReady().then(() => {
  setTimeout(async () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) { console.error('no window'); app.exit(3); return }
    win.setSize(1320, 860)
    const pages = [['home', '#/'], ['library', '#/library'], ['notes', '#/notes'], ['tasks', '#/tasks'],
      ['journal', '#/journal'], ['music', '#/music'], ['vault', '#/vault'], ['stats', '#/stats'], ['settings', '#/settings']]
    for (const [name, hash] of pages) {
      await win.webContents.executeJavaScript(`location.hash=${JSON.stringify(hash)}`)
      await new Promise((r) => setTimeout(r, 1600))
      try {
        const img = (await win.webContents.capturePage()).resize({ width: 820 })
        fs.writeFileSync(path.join(__dirname, `ui-${name}.png`), img.toPNG())
        console.log('shot', name)
      } catch (e) { console.log('fail', name, e.message) }
    }
    app.exit(0)
  }, 2200)
})
