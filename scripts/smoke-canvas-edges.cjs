// Verifies canvas board note/task cards sync to universal `refers` edges (Canvas
// Phase 1): card→edge, backlink, card-removal→unlink, canvas-delete→cleanup.
// Real IPC, throwaway DB via WIST_USER_DATA.
//   Run: npx electron scripts/smoke-canvas-edges.cjs
const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs')

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wist-canvasedges-'))
process.env.WIST_USER_DATA = tmpRoot

const { app, BrowserWindow } = require('electron')
require(path.join(__dirname, '..', 'dist-electron', 'main.js'))

app.whenReady().then(() => {
  setTimeout(async () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) { console.error('no window'); app.exit(3); return }

    const result = await win.webContents.executeJavaScript(`(async () => {
      const out = {}
      const n1 = await window.wist.notes.create({ title: 'Canvas note', content: 'x' })
      const t1 = await window.wist.tasks.create({ title: 'Canvas task' })
      const c1 = await window.wist.canvas.create('Board')

      // board with a note card + a task card
      await window.wist.canvas.update(c1.id, { data: { nodes: [
        { id: 'a', type: 'note', noteId: n1.id },
        { id: 'b', type: 'task', taskId: t1.id },
      ], edges: [] } })

      const relC = await window.wist.edges.related('canvas', c1.id, ['refers'])
      out.cardNoteEdge = relC.some(r => r.direction === 'out' && r.node.type === 'note' && String(r.node.id) === String(n1.id))
      out.cardTaskEdge = relC.some(r => r.direction === 'out' && r.node.type === 'task' && String(r.node.id) === String(t1.id))

      // backlink on the note: the canvas points at it
      const relN = await window.wist.edges.related('note', n1.id, ['refers'])
      out.backlinkOnNote = relN.some(r => r.direction === 'in' && r.node.type === 'canvas' && String(r.node.id) === String(c1.id))

      // remove the task card → its edge must disappear (delta unlink), note edge stays
      await window.wist.canvas.update(c1.id, { data: { nodes: [{ id: 'a', type: 'note', noteId: n1.id }], edges: [] } })
      const relC2 = await window.wist.edges.related('canvas', c1.id, ['refers'])
      out.taskEdgeRemoved = !relC2.some(r => r.node.type === 'task' && String(r.node.id) === String(t1.id))
      out.noteEdgeKept = relC2.some(r => r.node.type === 'note' && String(r.node.id) === String(n1.id))

      // delete the canvas → all its edges cleaned up
      await window.wist.canvas.remove(c1.id)
      const relN2 = await window.wist.edges.related('note', n1.id, ['refers'])
      out.cleanedOnDelete = !relN2.some(r => r.node.type === 'canvas' && String(r.node.id) === String(c1.id))
      return out
    })()`)

    console.log('canvas-edges:', JSON.stringify(result, null, 2))
    const pass = result.cardNoteEdge && result.cardTaskEdge && result.backlinkOnNote && result.taskEdgeRemoved && result.noteEdgeKept && result.cleanedOnDelete
    console.log(pass ? 'PASS' : 'FAIL')
    try { fs.rmSync(tmpRoot, { recursive: true, force: true }) } catch { /* best effort */ }
    app.exit(pass ? 0 : 1)
  }, 2800)
})
