// E2E: open a note, click "Разложить на холст" (Text → Canvas), verify it lands on
// a board laid out as a mind-map, screenshot dark + light. Isolated via WIST_USER_DATA.
//   Run: npx electron scripts/shoot-note-to-canvas.cjs
const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs')

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wist-note2canvas-'))
process.env.WIST_USER_DATA = tmpRoot

const { app, BrowserWindow } = require('electron')
require(path.join(__dirname, '..', 'dist-electron', 'main.js'))
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const body = [
  '# Запуск продукта', '',
  'Краткий план запуска второго мозга для команды.', '',
  '## Исследование',
  '- интервью с пользователями',
  '- анализ конкурентов',
  '  - Notion',
  '  - Obsidian',
  '## Разработка',
  '- [x] объектная модель',
  '- [ ] мульти-виды',
  '- [ ] текст → холст',
  '## Запуск',
  '1. бета-тест',
  '2. сбор отзывов',
  '3. публичный релиз', '',
  '# Риски',
  '- сроки',
  '- объём фич',
].join('\n')

app.whenReady().then(() => {
  setTimeout(async () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) { console.error('no window'); app.exit(3); return }
    win.setSize(1340, 940)

    const id = await win.webContents.executeJavaScript(
      `window.wist.notes.create({ title: 'Запуск продукта', content: ${JSON.stringify(body)} }).then(n => n.id)`
    )
    await win.webContents.executeJavaScript(`location.hash='#/notes?open=${id}'`)
    await wait(1600)

    // open the ⋮ options menu
    await win.webContents.executeJavaScript(`(() => {
      const b = [...document.querySelectorAll('button')].find(x => /^(Параметры|Options)$/.test(x.getAttribute('title')||''))
      if (b) b.click()
    })()`)
    await wait(300)
    // click "Разложить на холст"
    const clicked = await win.webContents.executeJavaScript(`(() => {
      const b = [...document.querySelectorAll('button')].find(x => /Разложить на холст|Lay out on canvas/.test(x.textContent||''))
      if (b) { b.click(); return true }
      return false
    })()`)
    console.log('button clicked:', clicked)
    await wait(2800) // navigation + canvas load + first autosave

    const info = await win.webContents.executeJavaScript(`(async () => {
      const m = location.hash.match(/canvas\\/(\\d+)/)
      if (!m) return { ok: false, hash: location.hash }
      const c = await window.wist.canvas.get(Number(m[1]))
      return { ok: true, hash: location.hash, nodes: c.data.nodes.length, edges: c.data.edges.length }
    })()`)
    console.log('result:', JSON.stringify(info))

    const shot = async (name) => {
      const img = (await win.webContents.capturePage()).resize({ width: 1180 })
      fs.writeFileSync(path.join(__dirname, name), img.toPNG())
      console.log('shot', name)
    }
    await shot('note-to-canvas-dark.png')

    await win.webContents.executeJavaScript(`document.documentElement.dataset.theme='light'`)
    await wait(600)
    await shot('note-to-canvas-light.png')

    try { fs.rmSync(tmpRoot, { recursive: true, force: true }) } catch { /* best effort */ }
    app.exit(info.ok ? 0 : 4)
  }, 2400)
})
