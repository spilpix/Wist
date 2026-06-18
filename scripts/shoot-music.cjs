// Point the music library at scripts/testmusic, scan it, and screenshot the
// Songs / Albums / Artists views in both themes. Output: music-<theme>-<view>.png
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
    // configure the music folder + scan via the real renderer API
    const scan = await win.webContents.executeJavaScript(`(async () => {
      await window.wist.settings.set({ musicFolders: [${JSON.stringify(TEST)}] })
      const res = await window.wist.music.scan()
      const list = await window.wist.music.list()
      return { res, count: list.length, sample: list.slice(0,3) }
    })()`)
    console.log('SCAN', JSON.stringify(scan))

    for (const theme of ['dark', 'light']) {
      await win.webContents.executeJavaScript(`document.documentElement.dataset.theme=${JSON.stringify(theme)}`)
      await win.webContents.executeJavaScript(`location.hash='#/music'`)
      await wait(1000)
      for (const [view, click] of [['songs', 'songs'], ['albums', 'albums'], ['artists', 'artists']]) {
        await win.webContents.executeJavaScript(`(() => {
          const btns = [...document.querySelectorAll('button')].filter(b => b.textContent.trim());
          const b = btns.find(b => /^(Songs|Песни)$/.test(b.textContent.trim()) && ${JSON.stringify(click)}==='songs')
            || btns.find(b => /^(Albums|Альбомы)$/.test(b.textContent.trim()) && ${JSON.stringify(click)}==='albums')
            || btns.find(b => /^(Artists|Исполнители)$/.test(b.textContent.trim()) && ${JSON.stringify(click)}==='artists');
          if (b) b.click();
        })()`)
        await wait(700)
        const img = (await win.webContents.capturePage()).resize({ width: 1080 })
        fs.writeFileSync(path.join(__dirname, `music-${theme}-${view}.png`), img.toPNG())
        console.log('shot', theme, view)
      }
    }
    // start playback of the first song so the player bar shows
    await win.webContents.executeJavaScript(`(() => { const b=[...document.querySelectorAll('button')].find(x=>/First Light/.test(x.textContent||'')); if(b) b.click(); })()`)
    await wait(900)
    const bar = (await win.webContents.capturePage()).resize({ width: 1080 })
    fs.writeFileSync(path.join(__dirname, 'music-playerbar.png'), bar.toPNG())
    console.log('shot playerbar')
    // CLEANUP: drop the test folder + its tracks so the real library stays clean
    const cleaned = await win.webContents.executeJavaScript(`window.wist.music.removeFolder(${JSON.stringify(TEST)})`)
    console.log('cleaned tracks:', cleaned)
    app.exit(0)
  }, 2400)
})
