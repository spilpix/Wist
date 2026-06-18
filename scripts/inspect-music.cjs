const { app, BrowserWindow } = require('electron')
const path = require('node:path')
require(path.join(__dirname, '..', 'dist-electron', 'main.js'))
app.whenReady().then(() => {
  setTimeout(async () => {
    const win = BrowserWindow.getAllWindows()[0]
    const r = await win.webContents.executeJavaScript(`(async () => ({
      folders: await window.wist.music.folders(),
      paths: (await window.wist.music.list()).map(t => t.path),
    }))()`)
    const dirs = [...new Set(r.paths.map((p) => path.dirname(p)))]
    console.log('FOLDERS_SETTING', JSON.stringify(r.folders))
    console.log('TRACK_COUNT', r.paths.length)
    console.log('DISTINCT_DIRS', JSON.stringify(dirs))
    app.exit(0)
  }, 2200)
})
