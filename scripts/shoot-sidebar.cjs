// Screenshot the new shell: workspace tabs (top), wider sidebar + bottom profile, profile page.
const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

require(path.join(__dirname, '..', 'dist-electron', 'main.js'))

function themeJs(theme) {
  return `(() => {
    const r = document.documentElement
    r.dataset.theme = ${JSON.stringify(theme)}
    for (const p of ['--accent','--accent-rgb','--accent-hover-rgb','--accent-bright-rgb']) r.style.removeProperty(p)
  })()`
}
const go = (win, hash) => win.webContents.executeJavaScript(`location.hash=${JSON.stringify(hash)}`)
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

app.whenReady().then(() => {
  setTimeout(async () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) { console.error('no window'); app.exit(3); return }
    win.setSize(1320, 860)

    for (const theme of ['dark', 'light']) {
      await win.webContents.executeJavaScript(themeJs(theme))
      // open a few routes so the tab strip shows multiple tabs
      for (const h of ['#/', '#/tasks', '#/notes', '#/library']) { await go(win, h); await wait(500) }
      await go(win, '#/'); await wait(900)
      try {
        const img = (await win.webContents.capturePage()).resize({ width: 1000 })
        fs.writeFileSync(path.join(__dirname, `shell-home-${theme}.png`), img.toPNG())
        console.log('shot home', theme)
      } catch (e) { console.log('fail home', theme, e.message) }

      await go(win, '#/profile'); await wait(900)
      try {
        const img = (await win.webContents.capturePage()).resize({ width: 1000 })
        fs.writeFileSync(path.join(__dirname, `shell-profile-${theme}.png`), img.toPNG())
        console.log('shot profile', theme)
      } catch (e) { console.log('fail profile', theme, e.message) }

      await go(win, '#/history'); await wait(900)
      try {
        const img = (await win.webContents.capturePage()).resize({ width: 1000 })
        fs.writeFileSync(path.join(__dirname, `shell-history-${theme}.png`), img.toPNG())
        console.log('shot history', theme)
      } catch (e) { console.log('fail history', theme, e.message) }
    }
    app.exit(0)
  }, 2200)
})
