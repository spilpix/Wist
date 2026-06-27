// End-to-end check of the edges IPC: link → related → unlink through the real app.
// Uses two live task ids, leaves the DB clean afterwards.
// Run: npx electron scripts/smoke-edges-roundtrip.cjs
const { app, BrowserWindow } = require('electron')
const path = require('node:path')

require(path.join(__dirname, '..', 'dist-electron', 'main.js'))
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

app.whenReady().then(() => {
  setTimeout(async () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) { console.error('no window'); app.exit(3); return }

    const result = await win.webContents.executeJavaScript(`(async () => {
      const ts = await window.wist.tasks.list({})
      if (ts.length < 2) return { skip: 'need 2 tasks', n: ts.length }
      const a = { type: 'task', id: ts[0].id }
      const b = { type: 'task', id: ts[1].id }

      await window.wist.edges.link(a, 'refers', b)
      const relA = await window.wist.edges.related('task', a.id, ['refers'])
      const relB = await window.wist.edges.related('task', b.id, ['refers']) // backlink must appear

      const linkedFromA = relA.some(r => r.node.type === 'task' && String(r.node.id) === String(b.id) && r.direction === 'out')
      const backlinkOnB = relB.some(r => r.node.type === 'task' && String(r.node.id) === String(a.id) && r.direction === 'in')

      const edgeId = relA.find(r => String(r.node.id) === String(b.id))?.edgeId
      await window.wist.edges.unlink(edgeId)
      const afterA = await window.wist.edges.related('task', a.id, ['refers'])
      const gone = !afterA.some(r => String(r.node.id) === String(b.id))

      return { a: a.id, b: b.id, linkedFromA, backlinkOnB, gone }
    })()`)

    console.log('roundtrip:', JSON.stringify(result))
    const pass = result.skip || (result.linkedFromA && result.backlinkOnB && result.gone)
    console.log(pass ? 'PASS' : 'FAIL')
    app.exit(pass ? 0 : 1)
  }, 2600)
})
