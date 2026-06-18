// Verify the player improvements: play a track, open Now Playing, open the Queue.
const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
require(path.join(__dirname, '..', 'dist-electron', 'main.js'))
const TEST = path.join(__dirname, 'testmusic')
const gesture = (win, code) => win.webContents.executeJavaScript(code, true)

app.whenReady().then(() => {
  setTimeout(async () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) { app.exit(3); return }
    win.setSize(1340, 900)
    await win.webContents.executeJavaScript(`(async () => {
      await window.wist.settings.set({ musicFolders: [${JSON.stringify(TEST)}] })
      await window.wist.music.scan()
    })()`)
    await win.webContents.executeJavaScript(`location.hash='#/music'`)
    await wait(1200)
    // play first track (user gesture so autoplay is allowed)
    await gesture(win, `(() => { const b=[...document.querySelectorAll('button')].find(x=>/First Light|Afterglow|Ember/.test(x.textContent||'')); if(b) b.click(); })()`)
    await wait(1500)
    let img = (await win.webContents.capturePage()).resize({ width: 1080 })
    fs.writeFileSync(path.join(__dirname, 'music2-bar.png'), img.toPNG())
    console.log('shot bar')

    // open Now Playing (expand button carries the music.expand title)
    await gesture(win, `(() => { const b=[...document.querySelectorAll('[title]')].find(x=>/Сейчас играет|now playing/i.test(x.getAttribute('title')||'')); if(b) b.click(); })()`)
    await wait(900)
    img = (await win.webContents.capturePage()).resize({ width: 1080 })
    fs.writeFileSync(path.join(__dirname, 'music2-nowplaying.png'), img.toPNG())
    console.log('shot nowplaying')

    // close NP, open the queue
    await gesture(win, `(() => { const b=[...document.querySelectorAll('[title]')].find(x=>/Свернуть|Close/i.test(x.getAttribute('title')||'')); if(b) b.click(); })()`)
    await wait(500)
    await gesture(win, `(() => { const b=[...document.querySelectorAll('[title]')].find(x=>/Очередь|Queue/i.test(x.getAttribute('title')||'')); if(b) b.click(); })()`)
    await wait(700)
    img = (await win.webContents.capturePage()).resize({ width: 1080 })
    fs.writeFileSync(path.join(__dirname, 'music2-queue.png'), img.toPNG())
    console.log('shot queue')

    await win.webContents.executeJavaScript(`window.wist.music.removeFolder(${JSON.stringify(TEST)})`)
    app.exit(0)
  }, 2400)
})
