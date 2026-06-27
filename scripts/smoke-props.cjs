// Smoke: props (typed-properties JSON bag) round-trips through notes + tasks, default
// '{}' applies, and tags are unaffected. Isolated via WIST_USER_DATA (fresh temp DB →
// migration 028 runs from scratch). Run: npx electron scripts/smoke-props.cjs
const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs')

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wist-props-'))
process.env.WIST_USER_DATA = tmpRoot

const { app, BrowserWindow } = require('electron')
require(path.join(__dirname, '..', 'dist-electron', 'main.js'))

app.whenReady().then(() => {
  setTimeout(async () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) { console.error('no window'); app.exit(3); return }

    const results = await win.webContents.executeJavaScript(`(async () => {
      const log = []
      const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b)
      const props = { fields: [
        { id: 'a1', name: 'Автор', type: 'text', value: 'Эрадж' },
        { id: 'a2', name: 'Готово', type: 'checkbox', value: true },
        { id: 'a3', name: 'Страниц', type: 'number', value: 42 },
        { id: 'a4', name: 'Срок', type: 'date', value: '2026-07-01' },
      ] }
      const props2 = { fields: [{ id: 'a1', name: 'Автор', type: 'text', value: 'Новый' }] }

      // 1. note create → props round-trip
      const n = await window.wist.notes.create({ title: 'Свойства', content: 'x', props })
      const g1 = await window.wist.notes.get(n.id)
      log.push(['note.create props round-trip', eq(g1.props, props)])

      // 2. note update props
      await window.wist.notes.update(n.id, { props: props2 })
      const g2 = await window.wist.notes.get(n.id)
      log.push(['note.update props', eq(g2.props, props2)])

      // 3. note without props → default {}
      const n2 = await window.wist.notes.create({ title: 'Без свойств', content: '' })
      const g3 = await window.wist.notes.get(n2.id)
      log.push(['note default props is {}', eq(g3.props, {})])

      // 4. task create → props round-trip
      const t = await window.wist.tasks.create({ title: 'Задача', props })
      const tl = await window.wist.tasks.list()
      const gt = tl.find((x) => x.id === t.id)
      log.push(['task.create props round-trip', eq(gt && gt.props, props)])

      // 5. task update props
      await window.wist.tasks.update(t.id, { props: props2 })
      const tl2 = await window.wist.tasks.list()
      const gt2 = tl2.find((x) => x.id === t.id)
      log.push(['task.update props', eq(gt2 && gt2.props, props2)])

      // 6. no regression: tags still parse as an array; props is a separate bag
      const n3 = await window.wist.notes.create({ title: 'Теги', content: '', tags: ['x', 'y'] })
      const g4 = await window.wist.notes.get(n3.id)
      log.push(['tags unaffected by props', Array.isArray(g4.tags) && g4.tags.length === 2 && eq(g4.props, {})])

      // 7. invalid props (array) coerced to {}
      const n4 = await window.wist.notes.create({ title: 'Кривые', content: '', props: [1, 2, 3] })
      const g5 = await window.wist.notes.get(n4.id)
      log.push(['invalid props coerced to {}', eq(g5.props, {})])

      return log
    })()`)

    let pass = 0
    for (const [name, ok] of results) {
      console.log((ok ? 'PASS' : 'FAIL') + ' — ' + name)
      if (ok) pass++
    }
    console.log(`\n${pass}/${results.length} passed`)

    try { fs.rmSync(tmpRoot, { recursive: true, force: true }) } catch { /* best effort */ }
    app.exit(pass === results.length ? 0 : 4)
  }, 2400)
})
