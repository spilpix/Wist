// Screenshot the Settings → Object types panel: the type list + the type editor modal.
// Isolated (seeds 5 preset types). Run: npx electron scripts/shoot-type-editor.cjs
const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs')

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wist-typeed-'))
process.env.WIST_USER_DATA = tmpRoot

const { app, BrowserWindow } = require('electron')
require(path.join(__dirname, '..', 'dist-electron', 'main.js'))
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

app.whenReady().then(() => {
  setTimeout(async () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) { console.error('no window'); app.exit(3); return }
    win.setSize(1340, 940)
    await win.webContents.executeJavaScript(`location.hash='#/settings'`)
    await wait(1200)

    // click the "Типы объектов" category in the left rail
    await win.webContents.executeJavaScript(`(() => {
      const b = [...document.querySelectorAll('button')].find(x => /Типы объектов|Object types/.test((x.textContent||'').trim()))
      if (b) b.click()
    })()`)
    await wait(700)
    const shot = async (name) => {
      const img = (await win.webContents.capturePage()).resize({ width: 1180 })
      fs.writeFileSync(path.join(__dirname, name), img.toPNG())
      console.log('shot', name)
    }
    await shot('type-editor-list.png')

    const seen = await win.webContents.executeJavaScript(`document.body.innerText.includes('Книга') && document.body.innerText.includes('Встреча')`)
    console.log('types listed:', seen)

    // open the editor (New type)
    await win.webContents.executeJavaScript(`(() => {
      const b = [...document.querySelectorAll('button')].find(x => /Создать тип|New type/.test((x.textContent||'').trim()))
      if (b) b.click()
    })()`)
    await wait(700)
    await shot('type-editor-modal.png')

    try { fs.rmSync(tmpRoot, { recursive: true, force: true }) } catch { /* best effort */ }
    app.exit(seen ? 0 : 4)
  }, 2400)
})
