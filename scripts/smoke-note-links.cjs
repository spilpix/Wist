// End-to-end check of note [[wikilinks]] + #tags → edges sync, edge-backed backlinks,
// rename stability and diff-unlink — through the REAL app IPC, on a THROWAWAY userData
// dir so the live database is never touched.
//   Run: npx electron scripts/smoke-note-links.cjs
const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs')

// Isolate userData via main.ts's WIST_USER_DATA test hook → a throwaway temp dir, so
// the real DB is never touched. (APPDATA override does NOT work: Windows Electron reads
// the OS known-folder API, not the env var.)
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wist-notelinks-'))
process.env.WIST_USER_DATA = tmpRoot

const { app, BrowserWindow } = require('electron')
require(path.join(__dirname, '..', 'dist-electron', 'main.js'))

app.whenReady().then(() => {
  setTimeout(async () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) {
      console.error('no window')
      app.exit(3)
      return
    }

    const result = await win.webContents.executeJavaScript(`(async () => {
      const out = {}
      // 1. target note, then a source note linking to it + carrying a #tag
      const target = await window.wist.notes.create({ title: 'Target Note', content: 'I am the target.' })
      const source = await window.wist.notes.create({ title: 'Source Note', content: 'See [[Target Note]] and #idea here.' })

      // 2. refers edge source->target: backlink on target (in) + outgoing on source (out)
      const relTarget = await window.wist.edges.related('note', target.id, ['refers'])
      out.backlinkOnTarget = relTarget.some(r => r.direction === 'in' && r.node.type === 'note' && String(r.node.id) === String(source.id))
      const relSourceOut = await window.wist.edges.related('note', source.id, ['refers'])
      out.outgoingFromSource = relSourceOut.some(r => r.direction === 'out' && String(r.node.id) === String(target.id))

      // 3. tagged edge source->tag(idea)
      const relSourceTags = await window.wist.edges.related('note', source.id, ['tagged'])
      out.tagEdge = relSourceTags.some(r => r.node.type === 'tag' && String(r.node.id) === 'idea')

      // 4. rename target — backlink survives (edges are id-based) AND source body is rewritten
      await window.wist.notes.update(target.id, { title: 'Renamed Target' })
      const relTarget2 = await window.wist.edges.related('note', target.id, ['refers'])
      out.backlinkSurvivesRename = relTarget2.some(r => r.direction === 'in' && String(r.node.id) === String(source.id))
      const srcAfter = await window.wist.notes.get(source.id)
      out.bodyRewritten = srcAfter.content.includes('[[Renamed Target]]') && !srcAfter.content.includes('[[Target Note]]')

      // 5. remove the link from the body — the refers edge must disappear (diff-unlink),
      //    while the #idea tag edge must remain
      await window.wist.notes.update(source.id, { content: 'No more links, just #idea.' })
      const relTarget3 = await window.wist.edges.related('note', target.id, ['refers'])
      out.edgeRemovedOnUnlink = !relTarget3.some(r => r.direction === 'in' && String(r.node.id) === String(source.id))
      const relSourceTags2 = await window.wist.edges.related('note', source.id, ['tagged'])
      out.tagEdgeKept = relSourceTags2.some(r => r.node.type === 'tag' && String(r.node.id) === 'idea')

      return out
    })()`)

    console.log('note-links:', JSON.stringify(result, null, 2))
    const pass =
      result.backlinkOnTarget &&
      result.outgoingFromSource &&
      result.tagEdge &&
      result.backlinkSurvivesRename &&
      result.bodyRewritten &&
      result.edgeRemovedOnUnlink &&
      result.tagEdgeKept
    console.log(pass ? 'PASS' : 'FAIL')
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true })
    } catch {
      /* best effort */
    }
    app.exit(pass ? 0 : 1)
  }, 2800)
})
