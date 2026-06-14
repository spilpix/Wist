// Visits several routes in the real bundle, captures console errors, screenshots key pages.
const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

require(path.join(__dirname, '..', 'dist-electron', 'main.js'))

let sawError = false
const errors = []

app.whenReady().then(() => {
  setTimeout(async () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) { console.error('no window'); app.exit(3); return }
    win.webContents.on('console-message', (_e, level, message) => {
      if (level >= 3) { errors.push(message.slice(0, 300)); sawError = true }
    })

    await win.webContents.executeJavaScript(`(async () => {
      const titles = await window.wist.titles.list({})
      if (!titles.length) {
        await window.wist.titles.create({ title: 'Тест', type: 'anime', status: 'completed' })
        await window.wist.notes.create({ title: 'Мысль', content: 'про [[Тест]]' })
      }
      return 'ok'
    })()`).catch((e) => { errors.push('seed: ' + e.message); sawError = true })

    const routes = ['#/tree', '#/games', '#/vault', '#/notes', '#/']
    for (const r of routes) {
      await win.webContents.executeJavaScript(`location.hash = '${r}'`)
      await new Promise((res) => setTimeout(res, 2500))
      if (r === '#/tree' || r === '#/games') {
        try {
          const img = await win.webContents.capturePage()
          fs.writeFileSync(path.join(__dirname, `shot-${r.replace(/[#/]/g, '') || 'home'}.png`), img.toPNG())
        } catch (e) { /* ignore */ }
      }
    }
    console.log('ERRORS:', errors.length ? JSON.stringify(errors.slice(0, 10), null, 2) : 'none')
    console.log('RESULT:', sawError ? 'ERRORS_SEEN' : 'CLEAN')
    app.exit(sawError ? 1 : 0)
  }, 2200)
})
