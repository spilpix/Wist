// Repair: my screenshot harnesses overwrote the user's musicFolders setting and
// then cleared it. The tracks are still in the DB — restore musicFolders to the
// distinct directories those tracks actually live in, so rescan works again.
const { app, BrowserWindow } = require('electron')
const path = require('node:path')
require(path.join(__dirname, '..', 'dist-electron', 'main.js'))
app.whenReady().then(() => {
  setTimeout(async () => {
    const win = BrowserWindow.getAllWindows()[0]
    const paths = await win.webContents.executeJavaScript(`(async () => (await window.wist.music.list()).map(t => t.path))()`)
    const dirs = [...new Set(paths.map((p) => path.dirname(p)))]
    if (dirs.length) {
      await win.webContents.executeJavaScript(`window.wist.settings.set({ musicFolders: ${JSON.stringify(dirs)} })`)
    }
    const after = await win.webContents.executeJavaScript(`window.wist.music.folders()`)
    console.log('RESTORED_FOLDERS', JSON.stringify(after))
    app.exit(0)
  }, 2200)
})
