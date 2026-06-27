// Screenshots the command palette: recent (empty query) + FTS note results w/ snippets
// for a Cyrillic query. Isolated DB via WIST_USER_DATA.
//   Run: npx electron scripts/shoot-palette.cjs
const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs')

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wist-pal-'))
process.env.WIST_USER_DATA = tmpRoot

const { app, BrowserWindow } = require('electron')
require(path.join(__dirname, '..', 'dist-electron', 'main.js'))
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

app.whenReady().then(() => {
  setTimeout(async () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) { console.error('no window'); app.exit(3); return }
    win.setSize(1340, 940)

    const shoot = async (name) => {
      const img = (await win.webContents.capturePage()).resize({ width: 1100 })
      fs.writeFileSync(path.join(__dirname, `palette-${name}.png`), img.toPNG())
      console.log('shot', name)
    }

    const ids = await win.webContents.executeJavaScript(`(async () => {
      const n1 = await window.wist.notes.create({ title: 'Архитектура проекта', content: 'Мысли про Обсидиан и графы знаний внутри Барда.' })
      await window.wist.notes.create({ title: 'Дневник', content: 'Сегодня делал поиск FTS5 и кириллицу в заметках.' })
      await window.wist.notes.create({ title: 'Plans', content: 'english only content here, nothing cyrillic' })
      const c = await window.wist.canvas.create('Доска идей')
      await window.wist.tasks.create({ title: 'Починить поиск' })
      return { n1: n1.id, c: (c && c.id) || null }
    })()`)

    // build some history for the "recent" group
    await win.webContents.executeJavaScript(`location.hash='#/notes?open=${ids.n1}'`); await wait(700)
    if (ids.c) { await win.webContents.executeJavaScript(`location.hash='#/canvas/${ids.c}'`); await wait(700) }
    await win.webContents.executeJavaScript(`location.hash='#/tasks'`); await wait(500)
    await win.webContents.executeJavaScript(`location.hash='#/'`); await wait(700)

    // open palette via Ctrl+K
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'K', modifiers: ['control'] })
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'K', modifiers: ['control'] })
    await wait(700)
    await shoot('recent')

    // type a Cyrillic query (React-controlled input → use the native value setter)
    await win.webContents.executeJavaScript(`(() => {
      const input = document.querySelector('.z-50 input') || document.querySelector('input'); if (!input) return
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      setter.call(input, 'обсидиан')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })()`)
    await wait(700)
    await shoot('search')

    try { fs.rmSync(tmpRoot, { recursive: true, force: true }) } catch { /* best effort */ }
    app.exit(0)
  }, 2600)
})
