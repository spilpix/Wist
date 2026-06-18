// Side-by-side dark vs light screenshots of the shell (sidebar + topbar + page)
// so I can compare theme polish directly. Output: cmp-<theme>-<page>.png
const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
require(path.join(__dirname, '..', 'dist-electron', 'main.js'))

const PAGES = [
  ['home', '#/'],
  ['tasks', '#/tasks'],
  ['hub', '#/projects'],
  ['library', '#/library'],
  ['settings', '#/settings'],
]

app.whenReady().then(() => {
  setTimeout(async () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) { app.exit(3); return }
    win.setSize(1340, 880)
    for (const theme of ['dark', 'light']) {
      await win.webContents.executeJavaScript(`(() => {
        const r = document.documentElement
        r.dataset.theme = ${JSON.stringify(theme)}
      })()`)
      for (const [name, hash] of PAGES) {
        await win.webContents.executeJavaScript(`location.hash=${JSON.stringify(hash)}`)
        await wait(1200)
        const img = (await win.webContents.capturePage()).resize({ width: 1080 })
        fs.writeFileSync(path.join(__dirname, `cmp-${theme}-${name}.png`), img.toPNG())
        console.log('shot', theme, name)
      }
    }
    app.exit(0)
  }, 2200)
})
