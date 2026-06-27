// Demo of a POPULATED Связи list (colored chips in context). Creates 2 refers edges on
// a task, screenshots dark+light, then removes them so the DB is left clean.
// Run: npx electron scripts/shoot-relations-filled.cjs
const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

require(path.join(__dirname, '..', 'dist-electron', 'main.js'))
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
async function shoot(win, name, width = 1040) {
  const img = (await win.webContents.capturePage()).resize({ width })
  fs.writeFileSync(path.join(__dirname, `relations-${name}.png`), img.toPNG())
  console.log('shot', name)
}
const toLight = (win) => win.webContents.executeJavaScript(`(() => {
  const r = document.documentElement; r.dataset.theme='light'
  ;['--accent','--accent-rgb','--accent-hover-rgb','--accent-bright-rgb'].forEach(p=>r.style.removeProperty(p))
})()`)

app.whenReady().then(() => {
  setTimeout(async () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) { console.error('no window'); app.exit(3); return }
    win.setSize(1360, 920)

    const focusId = await win.webContents.executeJavaScript(`(async () => {
      const ts = await window.wist.tasks.list({})
      if (ts.length < 4) return null
      const focus = { type:'task', id: ts[0].id }
      // link to two other objects (a note if any, else other tasks)
      const notes = await window.wist.notes.list({})
      const targets = []
      if (notes[0]) targets.push({ type:'note', id: notes[0].id })
      targets.push({ type:'task', id: ts[1].id })
      if (targets.length < 2) targets.push({ type:'task', id: ts[2].id })
      for (const dst of targets) await window.wist.edges.link(focus, 'refers', dst)
      return ts[0].id
    })()`)
    if (!focusId) { console.error('not enough data'); app.exit(2); return }

    await win.webContents.executeJavaScript(`location.hash='#/tasks?open=${focusId}'`)
    await wait(1700)
    await shoot(win, 'filled-dark')
    await toLight(win); await wait(500)
    await shoot(win, 'filled-light')

    // cleanup — remove the demo edges
    await win.webContents.executeJavaScript(`(async () => {
      const rels = await window.wist.edges.related('task', ${focusId}, ['refers'])
      for (const r of rels) await window.wist.edges.unlink(r.edgeId)
    })()`)
    console.log('cleaned demo edges')
    app.exit(0)
  }, 2600)
})
