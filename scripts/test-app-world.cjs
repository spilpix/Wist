// Boots the REAL app (dist build + real preload/IPC), seeds data, opens
// #/tree, forwards renderer console and screenshots the world page.
const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

require(path.join(__dirname, '..', 'dist-electron', 'main.js'))

let sawError = false

app.whenReady().then(() => {
  setTimeout(async () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) {
      console.error('no window')
      app.exit(3)
      return
    }
    win.webContents.on('console-message', (_e, level, message) => {
      console.log(`[renderer:${level}]`, message.slice(0, 600))
      if (level >= 3 || /WORLD_BOOT_ERR|Uncaught|Error/i.test(message)) sawError = true
    })

    try {
      await win.webContents.executeJavaScript(`(async () => {
        const titles = await window.wist.titles.list({})
        if (!titles.length) {
          await window.wist.titles.create({ title: 'Тестовое аниме', type: 'anime', status: 'completed' })
          await window.wist.notes.create({ title: 'Мысль', content: 'тестовая запись' })
          await window.wist.tasks.create({ title: 'тестовая задача' })
        }
        location.hash = '#/tree'
        return 'seeded'
      })()`)
      console.log('navigated to #/tree')
    } catch (err) {
      console.error('exec failed:', err.message)
      sawError = true
    }

    setTimeout(async () => {
      try {
        const img = await win.webContents.capturePage()
        fs.writeFileSync(path.join(__dirname, 'app-world-shot.png'), img.toPNG())
        console.log('SCREENSHOT saved')
      } catch (err) {
        console.error('capture failed:', err.message)
      }
      console.log('RESULT:', sawError ? 'ERRORS_SEEN' : 'CLEAN')
      app.exit(sawError ? 1 : 0)
    }, 7000)
  }, 2200)
})
