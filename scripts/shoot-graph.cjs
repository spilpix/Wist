// Screenshot the knowledge graph (/tree) with a realistic linked dataset — baseline +
// after polish. Isolated. Run: npx electron scripts/shoot-graph.cjs
const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs')

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wist-graph-'))
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
      const proj = await window.wist.projects.create({ name: 'Запуск Bard' })
      // notes that link to each other + share #tags → real edges
      await window.wist.notes.create({ title: 'Архитектура', content: 'Связь [[Граф знаний]] и [[Холст]]. #дизайн #pkm', project_id: proj.id })
      await window.wist.notes.create({ title: 'Граф знаний', content: 'Идея визуализации. #pkm Смотри [[Холст]].' })
      await window.wist.notes.create({ title: 'Холст', content: 'Доска для [[Архитектура]]. #дизайн' })
      await window.wist.notes.create({ title: 'Объектная модель', content: 'Типы и свойства. #pkm [[Граф знаний]]' })
      await window.wist.notes.create({ title: 'Идеи', content: 'Разное. #дизайн' })
      await window.wist.tasks.create({ title: 'Сделать графы', project_id: proj.id, props: {} })
      await window.wist.tasks.create({ title: 'Покрасить узлы', project_id: proj.id })
      await window.wist.canvas.create('Мудборд')
    })()`)

    for (const theme of ['dark', 'light']) {
      await win.webContents.executeJavaScript(themeJs(theme))
      await win.webContents.executeJavaScript(`location.hash='#/tree'`)
      await wait(2600) // let the force sim settle
      const img = (await win.webContents.capturePage()).resize({ width: 1180 })
      fs.writeFileSync(path.join(__dirname, `graph-${theme}.png`), img.toPNG())
      console.log('shot graph', theme)
    }

    try { fs.rmSync(tmpRoot, { recursive: true, force: true }) } catch { /* best effort */ }
    app.exit(0)
  }, 2400)
})
