// Screenshot the redesigned sidebar (dark + light), isolated via WIST_USER_DATA.
//   Run: npx electron scripts/shoot-sidebar-new.cjs
const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs')

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wist-sidebar-'))
process.env.WIST_USER_DATA = tmpRoot

const { app, BrowserWindow } = require('electron')
require(path.join(__dirname, '..', 'dist-electron', 'main.js'))
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

app.whenReady().then(() => {
  setTimeout(async () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) { console.error('no window'); app.exit(3); return }
    win.setSize(1340, 940)

    // seed a couple hubs + a pinned favorite so all sections have content
    await win.webContents.executeJavaScript(`(async () => {
      try {
        const p1 = await window.wist.projects.create({ name: 'Дизайн-система' })
        await window.wist.projects.create({ name: 'Исследование' })
        const n = await window.wist.notes.create({ title: 'Заметка о связях', content: 'x' })
        await window.wist.favorites.toggle({ kind: 'note', ref: n.id, label: 'Заметка о связях', route: '/notes?open=' + n.id })
      } catch (e) { console.log('seed err', e && e.message) }
    })()`)

    const shoot = async (name) => {
      const img = (await win.webContents.capturePage()).resize({ width: 1100 })
      fs.writeFileSync(path.join(__dirname, `sidebar-${name}.png`), img.toPNG())
      console.log('shot', name)
    }

    await win.webContents.executeJavaScript(`window.wist.settings.set({ theme: 'dark' })`)
    win.webContents.reload()
    await wait(2400)
    await win.webContents.executeJavaScript(`location.hash = '#/'`)
    await wait(1200)
    await shoot('dark')

    await win.webContents.executeJavaScript(`window.wist.settings.set({ theme: 'light' })`)
    win.webContents.reload()
    await wait(2400)
    await win.webContents.executeJavaScript(`location.hash = '#/'`)
    await wait(1200)
    await shoot('light')

    try { fs.rmSync(tmpRoot, { recursive: true, force: true }) } catch { /* best effort */ }
    app.exit(0)
  }, 2400)
})
