// Autonomous world-scene test: opens the harness, forwards console, screenshots.
const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

let ok = false
let failed = false

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1240,
    height: 840,
    x: 60,
    y: 60,
    show: true,
    backgroundColor: '#06051a',
    webPreferences: { offscreen: false },
  })

  win.webContents.on('console-message', (_e, _level, message) => {
    console.log('[renderer]', message)
    if (message.includes('WORLD_OK')) ok = true
    if (message.includes('WORLD_ERR') || message.includes('WORLD_REJECTION') || message.includes('WORLD_WINDOW_ERR')) failed = true
  })

  await win.loadFile(path.join(__dirname, 'world-test.html'))

  // let intro animations play, then capture
  setTimeout(async () => {
    try {
      const img = await win.webContents.capturePage()
      fs.writeFileSync(path.join(__dirname, 'world-shot.png'), img.toPNG())
      console.log('SCREENSHOT saved, size', img.getSize().width, 'x', img.getSize().height)
    } catch (err) {
      console.error('capture failed:', err.message)
    }
    console.log('RESULT:', failed ? 'FAILED' : ok ? 'OK' : 'NO_SIGNAL')
    app.exit(failed ? 1 : ok ? 0 : 2)
  }, 4500)
})
