// Screenshot a note in READING mode to verify markdown rendering: images (![]()),
// GFM tables, headings, inline formatting, code. Isolated via WIST_USER_DATA.
//   Run: npx electron scripts/shoot-notes-reading.cjs
const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs')

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wist-reading-'))
process.env.WIST_USER_DATA = tmpRoot

const { app, BrowserWindow } = require('electron')
require(path.join(__dirname, '..', 'dist-electron', 'main.js'))
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="260" height="90"><rect width="260" height="90" rx="8" fill="#2383E1"/><text x="16" y="54" fill="white" font-size="22" font-family="sans-serif">Image works</text></svg>`
const dataUri = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64')
const body = [
  '# Рендер заметки', '',
  'Абзац с **жирным**, *курсивом*, `кодом` и [[вики-ссылкой]].', '',
  '| Колонка A | Колонка B |',
  '| --- | --- |',
  '| ячейка 1 | ячейка 2 |',
  '| ячейка 3 | ячейка 4 |', '',
  '![пример](' + dataUri + ')', '',
  '- список один',
  '- список два',
  '',
  '```js',
  'const x = 42',
  '```',
].join('\n')

app.whenReady().then(() => {
  setTimeout(async () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) { console.error('no window'); app.exit(3); return }
    win.setSize(1340, 1000)

    const id = await win.webContents.executeJavaScript(
      `window.wist.notes.create({ title: 'Рендер', content: ${JSON.stringify(body)} }).then(n => n.id)`
    )
    await win.webContents.executeJavaScript(`location.hash='#/notes?open=${id}'`)
    await wait(1500)
    // flip into reading mode (button title = 'Режим чтения')
    await win.webContents.executeJavaScript(`(() => {
      const b = [...document.querySelectorAll('button')].find(x => /чтения|Reading/.test(x.getAttribute('title')||''))
      if (b) b.click()
    })()`)
    await wait(900)
    const img = (await win.webContents.capturePage()).resize({ width: 1100 })
    fs.writeFileSync(path.join(__dirname, 'notes-reading.png'), img.toPNG())
    console.log('shot notes-reading')

    try { fs.rmSync(tmpRoot, { recursive: true, force: true }) } catch { /* best effort */ }
    app.exit(0)
  }, 2400)
})
