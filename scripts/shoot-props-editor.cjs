// Screenshot the Capacities-style PropertyEditor on a note (typed properties under the
// title). Seeds a note with mixed-type props, opens it, shoots; then opens the type
// menu. Isolated via WIST_USER_DATA. Run: npx electron scripts/shoot-props-editor.cjs
const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs')

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wist-propsui-'))
process.env.WIST_USER_DATA = tmpRoot

const { app, BrowserWindow } = require('electron')
require(path.join(__dirname, '..', 'dist-electron', 'main.js'))
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const props = {
  fields: [
    { id: 'p1', name: 'Автор', type: 'text', value: 'Эрадж Рахмонбердиев' },
    { id: 'p2', name: 'Прогресс', type: 'number', value: 75 },
    { id: 'p3', name: 'Дедлайн', type: 'date', value: '2026-07-15' },
    { id: 'p4', name: 'Опубликовано', type: 'checkbox', value: true },
    { id: 'p5', name: 'Источник', type: 'url', value: 'capacities.io' },
  ],
}

app.whenReady().then(() => {
  setTimeout(async () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) { console.error('no window'); app.exit(3); return }
    win.setSize(1340, 940)

    const id = await win.webContents.executeJavaScript(
      `window.wist.notes.create({ title: 'Запуск Bard 1.0', content: 'Заметка с типизированными свойствами в стиле Capacities.\\n\\n## Контекст\\n- объектная модель\\n- цветные типы', props: ${JSON.stringify(props)} }).then(n => n.id)`
    )
    await win.webContents.executeJavaScript(`location.hash='#/notes?open=${id}'`)
    await wait(1600)

    const shot = async (name) => {
      const img = (await win.webContents.capturePage()).resize({ width: 1180 })
      fs.writeFileSync(path.join(__dirname, name), img.toPNG())
      console.log('shot', name)
    }
    await shot('props-editor-dark.png')

    // open the type menu on the first property's type chip
    const opened = await win.webContents.executeJavaScript(`(() => {
      const b = [...document.querySelectorAll('button[title]')].find(x => /Сменить тип|Change type/.test(x.getAttribute('title')||''))
      if (b) { b.click(); return true }
      return false
    })()`)
    console.log('type menu opened:', opened)
    await wait(400)
    await shot('props-editor-typemenu.png')

    try { fs.rmSync(tmpRoot, { recursive: true, force: true }) } catch { /* best effort */ }
    app.exit(0)
  }, 2400)
})
