// E2E: open a note, pick the "Книга" type, verify the preset properties get pulled in
// and the type chip shows. Screenshot. Isolated. Run: npx electron scripts/shoot-object-type-ui.cjs
const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs')

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wist-typeui-'))
process.env.WIST_USER_DATA = tmpRoot

const { app, BrowserWindow } = require('electron')
require(path.join(__dirname, '..', 'dist-electron', 'main.js'))
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

app.whenReady().then(() => {
  setTimeout(async () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) { console.error('no window'); app.exit(3); return }
    win.setSize(1340, 940)

    const id = await win.webContents.executeJavaScript(
      `window.wist.notes.create({ title: 'Дюна', content: 'Научная фантастика Фрэнка Герберта.' }).then(n => n.id)`
    )
    await win.webContents.executeJavaScript(`location.hash='#/notes?open=${id}'`)
    await wait(1600)

    // open the type picker (title = 'Тип объекта')
    await win.webContents.executeJavaScript(`(() => {
      const b = [...document.querySelectorAll('button[title]')].find(x => /Тип объекта|Object type/.test(x.getAttribute('title')||''))
      if (b) b.click()
    })()`)
    await wait(400)
    // pick "Книга"
    const picked = await win.webContents.executeJavaScript(`(() => {
      const b = [...document.querySelectorAll('button')].find(x => (x.textContent||'').trim() === 'Книга')
      if (b) { b.click(); return true }
      return false
    })()`)
    console.log('picked Книга:', picked)
    await wait(900)

    // verify preset fields were pulled in (name inputs carry the preset names as values)
    const fieldNames = await win.webContents.executeJavaScript(`(() => {
      return [...document.querySelectorAll('input')].map(i => i.value).filter(Boolean)
    })()`)
    console.log('field values present:', JSON.stringify(fieldNames))

    const img = (await win.webContents.capturePage()).resize({ width: 1180 })
    fs.writeFileSync(path.join(__dirname, 'object-type-ui.png'), img.toPNG())
    console.log('shot object-type-ui')

    const ok = picked && fieldNames.includes('Автор') && fieldNames.includes('Прочитано')
    try { fs.rmSync(tmpRoot, { recursive: true, force: true }) } catch { /* best effort */ }
    app.exit(ok ? 0 : 4)
  }, 2400)
})
