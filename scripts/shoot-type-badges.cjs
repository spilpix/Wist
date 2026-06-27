// Screenshot type badges on note + task list cards (colour-coded by object type).
// Isolated (seeds preset types). Run: npx electron scripts/shoot-type-badges.cjs
const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs')

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wist-badges-'))
process.env.WIST_USER_DATA = tmpRoot

const { app, BrowserWindow } = require('electron')
require(path.join(__dirname, '..', 'dist-electron', 'main.js'))
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

app.whenReady().then(() => {
  setTimeout(async () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) { console.error('no window'); app.exit(3); return }
    win.setSize(1340, 940)

    await win.webContents.executeJavaScript(`(async () => {
      const types = await window.wist.objectTypes.list()
      const id = (n) => (types.find((t) => t.name === n) || {}).id
      const book = id('Книга'), person = id('Человек'), meet = id('Встреча'), idea = id('Идея')
      // notes — some typed, one plain
      await window.wist.notes.create({ title: 'Дюна', content: 'x', props: { type: book } })
      await window.wist.notes.create({ title: 'Фрэнк Герберт', content: 'x', props: { type: person } })
      await window.wist.notes.create({ title: 'Просто заметка', content: 'x' })
      await window.wist.notes.create({ title: 'Идея: связи в графе', content: 'x', props: { type: idea } })
      // tasks
      await window.wist.tasks.create({ title: 'Встреча с командой', props: { type: meet } })
      await window.wist.tasks.create({ title: 'Прочитать главу', props: { type: book } })
      await window.wist.tasks.create({ title: 'Обычная задача' })
    })()`)

    const shot = async (name) => {
      const img = (await win.webContents.capturePage()).resize({ width: 1180 })
      fs.writeFileSync(path.join(__dirname, name), img.toPNG())
      console.log('shot', name)
    }

    await win.webContents.executeJavaScript(`location.hash='#/notes'`)
    await wait(1500)
    await shot('type-badges-notes.png')

    await win.webContents.executeJavaScript(`location.hash='#/tasks'`)
    await wait(1300)
    await shot('type-badges-tasks.png')

    try { fs.rmSync(tmpRoot, { recursive: true, force: true }) } catch { /* best effort */ }
    app.exit(0)
  }, 2400)
})
