// Verify playback + the Now-Playing bar: scan test music, play the first song with a
// real user gesture, confirm the audio is advancing, screenshot, then clean up.
const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
require(path.join(__dirname, '..', 'dist-electron', 'main.js'))

const TEST = path.join(__dirname, 'testmusic')

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
    // click the first track row WITH a user gesture so autoplay is allowed
    await win.webContents.executeJavaScript(
      `(() => { const b=[...document.querySelectorAll('button')].find(x=>/First Light|Afterglow|Ember/.test(x.textContent||'')); if(b){b.click(); return b.textContent;} return 'none'; })()`,
      true
    )
    await wait(1800)
    const state = await win.webContents.executeJavaScript(`(() => {
      const a = document.querySelector('audio') || [...document.querySelectorAll('audio')][0];
      return a ? { src: !!a.src, paused: a.paused, t: a.currentTime, dur: a.duration } : 'no-audio-el';
    })()`)
    console.log('AUDIO', JSON.stringify(state))
    const img = (await win.webContents.capturePage()).resize({ width: 1080 })
    fs.writeFileSync(path.join(__dirname, 'music-play.png'), img.toPNG())
    console.log('shot music-play')
    await win.webContents.executeJavaScript(`window.wist.music.removeFolder(${JSON.stringify(TEST)})`)
    app.exit(0)
  }, 2400)
})
