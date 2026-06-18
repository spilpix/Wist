// Sidebar rework check: open a real project so "Недавнее" populates, then shoot
// the full sidebar (Home + Hub worlds) in both themes. Output: sb2-<theme>-<view>.png
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
    // grab a real project id so we can build a deep recent
    const pid = await win.webContents.executeJavaScript(
      `window.wist.projects.list().then(p => (p[0] && p[0].id) || null)`
    )
    for (const theme of ['dark', 'light']) {
      await win.webContents.executeJavaScript(`document.documentElement.dataset.theme=${JSON.stringify(theme)}`)
      if (pid) { // visit the project detail → becomes a deep recent
        await win.webContents.executeJavaScript(`location.hash='#/project/${pid}'`)
        await wait(1100)
      }
      for (const [name, hash] of [['home', '#/journal'], ['hub', '#/projects']]) {
        await win.webContents.executeJavaScript(`location.hash=${JSON.stringify(hash)}`)
        await wait(1100)
        const img = (await win.webContents.capturePage()).resize({ width: 1080 })
        fs.writeFileSync(path.join(__dirname, `sb2-${theme}-${name}.png`), img.toPNG())
        console.log('shot', theme, name)
      }
    }
    app.exit(0)
  }, 2200)
})
