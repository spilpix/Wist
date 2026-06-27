// Screenshot the sidebar to verify Capacities-style colour-coded type icons (dark +
// light). Seeds a project + note so Projects/Favorites populate. Isolated.
//   Run: npx electron scripts/shoot-sidebar.cjs
const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs')

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wist-sidebar-'))
process.env.WIST_USER_DATA = tmpRoot

const { app, BrowserWindow } = require('electron')
require(path.join(__dirname, '..', 'dist-electron', 'main.js'))
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const themeJs = (theme) => `(() => {
  const r = document.documentElement
  r.dataset.theme = ${JSON.stringify(theme)}
  r.classList.remove('force-dark')
  for (const p of ['--accent','--accent-rgb','--accent-hover-rgb','--accent-bright-rgb']) r.style.removeProperty(p)
})()`

app.whenReady().then(() => {
  setTimeout(async () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) { console.error('no window'); app.exit(3); return }
    win.setSize(1340, 940)

    await win.webContents.executeJavaScript(`(async () => {
      await window.wist.projects.create({ name: 'Запуск Bard' })
      await window.wist.notes.create({ title: 'Идеи продукта', content: 'x' })
    })()`)

    for (const theme of ['dark', 'light']) {
      await win.webContents.executeJavaScript(themeJs(theme))
      await win.webContents.executeJavaScript(`location.hash='#/'`)
      await wait(1100)
      const img = (await win.webContents.capturePage()).resize({ width: 1180 })
      fs.writeFileSync(path.join(__dirname, `sidebar-${theme}.png`), img.toPNG())
      console.log('shot sidebar', theme)
    }

    try { fs.rmSync(tmpRoot, { recursive: true, force: true }) } catch { /* best effort */ }
    app.exit(0)
  }, 2400)
})
