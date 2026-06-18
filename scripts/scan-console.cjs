// Visits every route in the real bundle (real user data) and prints every
// console warning/error with its source, to hunt down what the user is seeing.
const { app, BrowserWindow } = require('electron')
const path = require('node:path')

require(path.join(__dirname, '..', 'dist-electron', 'main.js'))

const LEVELS = ['log', 'info', 'WARN', 'ERROR']
const seen = []

app.whenReady().then(() => {
  setTimeout(async () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) { console.error('no window'); app.exit(3); return }
    win.webContents.on('console-message', (_e, level, message, line, sourceId) => {
      if (level >= 2) seen.push(`[${LEVELS[level] || level}] ${message.slice(0, 400)}  (${(sourceId || '').split('/').pop()}:${line})`)
    })
    win.webContents.on('render-process-gone', (_e, d) => seen.push('RENDER GONE: ' + JSON.stringify(d)))

    const routes = ['#/', '#/library', '#/library?type=book', '#/continue', '#/favorites',
      '#/moments', '#/notes', '#/journal', '#/tasks', '#/music', '#/vault', '#/games',
      '#/tree', '#/local', '#/youtube', '#/stats', '#/settings']
    for (const r of routes) {
      seen.push(`---- ${r} ----`)
      try {
        await win.webContents.executeJavaScript(`location.hash=${JSON.stringify(r)}`)
      } catch (e) { seen.push('nav error: ' + e.message) }
      await new Promise((res) => setTimeout(res, 1800))
    }
    // open the first title detail if any
    try {
      const id = await win.webContents.executeJavaScript(`window.wist.titles.list({}).then(t=>t[0]?.id ?? null)`)
      if (id) {
        seen.push(`---- #/title/${id} ----`)
        await win.webContents.executeJavaScript(`location.hash='#/title/${id}'`)
        await new Promise((res) => setTimeout(res, 1800))
      }
    } catch (e) { seen.push('title nav: ' + e.message) }

    console.log('\n===== CONSOLE (warn+error) =====')
    console.log(seen.join('\n'))
    app.exit(0)
  }, 2200)
})
