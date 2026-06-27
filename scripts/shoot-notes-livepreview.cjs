// Screenshot the EDIT surface to verify the metric-safe live-preview overlay
// (dimmed markdown syntax + emphasized content). Isolated via WIST_USER_DATA.
const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs')

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wist-livep-'))
process.env.WIST_USER_DATA = tmpRoot

const { app, BrowserWindow } = require('electron')
require(path.join(__dirname, '..', 'dist-electron', 'main.js'))
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const body = [
  '# Большой заголовок',
  '',
  'Обычный текст с **жирным**, ~~зачёркнутым~~, ==выделением== и `кодом`.',
  'Ссылка на [[Другую заметку]] и тег #идея прямо в строке.',
  '',
  '## Подзаголовок второго уровня',
  '- первый пункт',
  '- второй пункт',
].join('\n')

app.whenReady().then(() => {
  setTimeout(async () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) { console.error('no window'); app.exit(3); return }
    win.setSize(1340, 940)
    const id = await win.webContents.executeJavaScript(
      `window.wist.notes.create({ title: 'Live preview', content: ${JSON.stringify(body)} }).then(n => n.id)`
    )
    await win.webContents.executeJavaScript(`location.hash='#/notes?open=${id}'`)
    await wait(1600)
    const img = (await win.webContents.capturePage()).resize({ width: 1100 })
    fs.writeFileSync(path.join(__dirname, 'notes-livepreview.png'), img.toPNG())
    console.log('shot notes-livepreview')
    try { fs.rmSync(tmpRoot, { recursive: true, force: true }) } catch { /* ok */ }
    app.exit(0)
  }, 2400)
})
