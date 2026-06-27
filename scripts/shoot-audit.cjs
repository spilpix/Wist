// DESIGN AUDIT: seed a realistic dataset and screenshot every problem section so we can
// SEE the inconsistencies (Tasks vs Notes vs Hubs vs Canvas vs Graph). Isolated.
//   Run: npx electron scripts/shoot-audit.cjs
const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs')

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wist-audit-'))
process.env.WIST_USER_DATA = tmpRoot

const { app, BrowserWindow } = require('electron')
require(path.join(__dirname, '..', 'dist-electron', 'main.js'))
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const uid = () => Math.random().toString(36).slice(2, 10)

app.whenReady().then(() => {
  setTimeout(async () => {
    try {
      const win = BrowserWindow.getAllWindows()[0]
      if (!win) { console.error('no window'); app.exit(3); return }
      win.setSize(1440, 960)

      const ids = await win.webContents.executeJavaScript(`(async () => {
        try {
          const types = await window.wist.objectTypes.list()
          const tid = (n) => { const t = types.find((x) => x.name === n); return t ? t.id : undefined }
          const proj = await window.wist.projects.create({ name: 'Запуск Bard 1.0' })
          await window.wist.tasks.create({ title: 'Свести дизайн-систему', project_id: proj.id, status: 'doing', priority: 'high' })
          await window.wist.tasks.create({ title: 'Починить граф', project_id: proj.id, status: 'todo', priority: 'high', props: { type: tid('Идея') } })
          await window.wist.tasks.create({ title: 'Релиз беты', project_id: proj.id, status: 'todo', priority: 'low' })
          await window.wist.tasks.create({ title: 'Собрать отзывы', project_id: proj.id, status: 'done' })
          const n1 = await window.wist.notes.create({ title: 'Архитектура', content: '# Архитектура\\n\\nСвязь [[Граф знаний]] и [[Холст]].\\n\\n## Принципы\\n- одна система\\n- плотность\\n\\n#дизайн #pkm', project_id: proj.id, props: { type: tid('Книга') } })
          await window.wist.notes.create({ title: 'Граф знаний', content: 'Идея. #pkm', project_id: proj.id })
          await window.wist.notes.create({ title: 'Холст', content: 'Доска. #дизайн' })
          const c = await window.wist.canvas.create('Мудборд продукта')
          const uid2 = () => Math.random().toString(36).slice(2, 10)
          const nodes = [
            { id: uid2(), type: 'frame', x: -40, y: -40, w: 520, h: 360, text: 'Идеи' },
            { id: uid2(), type: 'sticky', x: 0, y: 20, w: 180, h: 180, fill: '#FFE45C', text: 'Главная идея продукта' },
            { id: uid2(), type: 'sticky', x: 210, y: 20, w: 180, h: 180, fill: '#8AA6FF', text: 'Вторая мысль' },
            { id: uid2(), type: 'text', x: 0, y: 230, w: 240, h: 60, text: 'Свободный текст на холсте', fontSize: 18 },
            { id: uid2(), type: 'shape', shape: 'roundRect', x: 560, y: 20, w: 200, h: 120, fill: '#D9D9D9', text: 'Фигура' },
            { id: uid2(), type: 'shape', shape: 'ellipse', x: 560, y: 180, w: 160, h: 120, fill: '#62D9A8', text: 'Эллипс' },
            { id: uid2(), type: 'note', x: 800, y: 20, w: 240, h: 130, noteId: n1.id },
          ]
          const edges = [{ id: uid2(), from: nodes[1].id, to: nodes[2].id, type: 'curve', arrow: 'end' }]
          await window.wist.canvas.update(c.id, { data: { nodes, edges, viewport: { x: 380, y: 260, k: 0.9 } } })
          return { ok: true, proj: proj.id, canvas: c.id, note: n1.id }
        } catch (e) { return { ok: false, error: String((e && e.stack) || e) } }
      })()`)
      console.log('seed:', JSON.stringify(ids).slice(0, 400))
      if (!ids || !ids.ok) { app.exit(5); return }

      const shot = async (name) => {
        const img = (await win.webContents.capturePage()).resize({ width: 1280 })
        fs.writeFileSync(path.join(__dirname, `audit-${name}.png`), img.toPNG())
        console.log('shot', name)
      }
      const go = async (hash, ms = 1500) => { await win.webContents.executeJavaScript(`location.hash=${JSON.stringify(hash)}`); await wait(ms) }

      await go('#/'); await shot('home')
      await go('#/tasks'); await shot('tasks-list')
      await go('#/projects'); await shot('projects')
      await go('#/project/' + ids.proj, 1800); await shot('project-detail')
      await go('#/canvas/' + ids.canvas, 2200); await shot('canvas')
      await go('#/notes?open=' + ids.note, 1800); await shot('notes')

      try { fs.rmSync(tmpRoot, { recursive: true, force: true }) } catch { /* best effort */ }
      app.exit(0)
    } catch (e) {
      console.error('AUDIT FAILED:', (e && e.stack) || e)
      app.exit(9)
    }
  }, 2400)
})
