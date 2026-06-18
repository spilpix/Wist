// Safe queue verification — uses the already-scanned real library, NEVER writes
// settings / scans / removes. Plays a track, opens the queue via aria-label.
const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
require(path.join(__dirname, '..', 'dist-electron', 'main.js'))
const gesture = (win, code) => win.webContents.executeJavaScript(code, true)

app.whenReady().then(() => {
  setTimeout(async () => {
    const win = BrowserWindow.getAllWindows()[0]
    win.setSize(1340, 900)
    await win.webContents.executeJavaScript(`location.hash='#/music'`)
    await wait(1500)
    // play the first real track row (the index/play button is the first button per row)
    const played = await gesture(win, `(() => {
      const row = document.querySelector('.group.grid');
      const btn = row && row.querySelector('button');
      if (btn) { btn.click(); return row.textContent.slice(0,40); }
      return 'no-row';
    })()`)
    console.log('PLAYED', played)
    await wait(1200)
    // open the queue (Tooltip stamps aria-label, not title)
    await gesture(win, `(() => { const b=[...document.querySelectorAll('footer [aria-label]')].find(x=>/Очередь|Queue/.test(x.getAttribute('aria-label')||'')); if(b){b.click(); return true;} return false; })()`)
    await wait(700)
    const img = (await win.webContents.capturePage()).resize({ width: 1080 })
    fs.writeFileSync(path.join(__dirname, 'music2-queue.png'), img.toPNG())
    console.log('shot queue')
    app.exit(0)
  }, 2400)
})
