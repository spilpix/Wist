// Smoke: object_types — migration 029 seeds presets, CRUD works, and a type can be
// assigned to a note (props.type + seeded fields). Isolated via WIST_USER_DATA.
//   Run: npx electron scripts/smoke-object-types.cjs
const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs')

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wist-objtypes-'))
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

      // 1. seed applied — 5 presets
      const seeded = await window.wist.objectTypes.list()
      log.push(['seed: 5 preset types', seeded.length === 5])
      const book = seeded.find((t) => t.name === 'Книга')
      log.push(['seed: Книга exists w/ icon+hue', !!book && book.icon === 'BookOpen' && book.hue === 'orange'])
      log.push(['seed: Книга has 4 preset fields', !!book && Array.isArray(book.fields) && book.fields.length === 4 && book.fields[0].name === 'Автор'])

      // 2. create a custom type
      const made = await window.wist.objectTypes.create({ name: 'Фильм', icon: 'Film', hue: 'pink', fields: [{ id: 'd', name: 'Режиссёр', type: 'text', value: '' }] })
      const after = await window.wist.objectTypes.list()
      log.push(['create: type added', after.length === 6 && after.some((t) => t.id === made.id && t.name === 'Фильм')])
      log.push(['create: fields round-trip', eq(made.fields, [{ id: 'd', name: 'Режиссёр', type: 'text', value: '' }])])

      // 3. update
      await window.wist.objectTypes.update(made.id, { name: 'Кино', hue: 'purple' })
      const upd = (await window.wist.objectTypes.list()).find((t) => t.id === made.id)
      log.push(['update: name+hue', upd && upd.name === 'Кино' && upd.hue === 'purple'])

      // 4. assign type to a note (props.type + seeded fields)
      const note = await window.wist.notes.create({ title: 'Дюна', props: { type: made.id, fields: [{ id: 'd', name: 'Режиссёр', type: 'text', value: 'Вильнёв' }] } })
      const got = await window.wist.notes.get(note.id)
      log.push(['assign: note.props.type persists', got.props && got.props.type === made.id])
      log.push(['assign: note.props.fields persist', !!got.props && Array.isArray(got.props.fields) && got.props.fields[0].value === 'Вильнёв'])

      // 5. delete
      await window.wist.objectTypes.remove(made.id)
      const final = await window.wist.objectTypes.list()
      log.push(['delete: type removed', !final.some((t) => t.id === made.id) && final.length === 5])

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
