// Focused screenshots of the redesigned Home board (dark + light, plus the
// block editor popover open) so I can review the redesign myself.
const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

require(path.join(__dirname, '..', 'dist-electron', 'main.js'))

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

async function shoot(win, name, width = 1000) {
  const img = (await win.webContents.capturePage()).resize({ width })
  fs.writeFileSync(path.join(__dirname, `home-${name}.png`), img.toPNG())
  console.log('shot', name)
}

app.whenReady().then(() => {
  setTimeout(async () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) { console.error('no window'); app.exit(3); return }
    win.setSize(1340, 880)
    await win.webContents.executeJavaScript(`location.hash='#/'`)
    await wait(2000)

    // 1) dark, default board
    await shoot(win, 'dark')

    // 2) dark, block editor popover open (click the first header pill)
    await win.webContents.executeJavaScript(`document.querySelector('.block-pill')?.click()`)
    await wait(500)
    await shoot(win, 'dark-editor')
    await win.webContents.executeJavaScript(`document.querySelector('.fixed.inset-0')?.click()`)
    await wait(300)

    // 3) light theme — drop the inline accent overrides so the [data-theme=light] brand applies
    await win.webContents.executeJavaScript(`(() => {
      const r = document.documentElement
      r.dataset.theme = 'light'
      ;['--accent','--accent-rgb','--accent-hover-rgb','--accent-bright-rgb'].forEach(p => r.style.removeProperty(p))
    })()`)
    await wait(600)
    await shoot(win, 'light')

    // 4) light, editor open
    await win.webContents.executeJavaScript(`document.querySelector('.block-pill')?.click()`)
    await wait(500)
    await shoot(win, 'light-editor')

    app.exit(0)
  }, 2200)
})
