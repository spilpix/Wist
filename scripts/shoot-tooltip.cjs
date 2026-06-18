// Hover a sidebar tab pill and capture the custom tooltip chip.
const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
require(path.join(__dirname, '..', 'dist-electron', 'main.js'))

app.whenReady().then(() => {
  setTimeout(async () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) { app.exit(3); return }
    win.setSize(1320, 860)
    await win.webContents.executeJavaScript(`location.hash='#/'`)
    // force LIGHT theme — the tooltip text bug was light-theme only
    await win.webContents.executeJavaScript(`(() => {
      const r = document.documentElement
      r.dataset.theme = 'light'
      for (const p of ['--accent','--accent-rgb','--accent-hover-rgb','--accent-bright-rgb']) r.style.removeProperty(p)
    })()`)
    await new Promise((r) => setTimeout(r, 1200))
    // hover the collapse toggle at the very top-left corner (the off-screen-clamp case)
    await win.webContents.executeJavaScript(`(() => {
      const el = document.querySelector('aside .app-drag button')
      if (!el) return 'no btn'
      const r = el.getBoundingClientRect()
      const opts = { bubbles: true, cancelable: true, clientX: r.left + r.width/2, clientY: r.top + r.height/2 }
      el.dispatchEvent(new MouseEvent('mouseover', opts))
      return 'hovered'
    })()`)
    await new Promise((r) => setTimeout(r, 700)) // wait past the 350ms tooltip delay
    try {
      const img = (await win.webContents.capturePage()).resize({ width: 900 })
      fs.writeFileSync(path.join(__dirname, 'tooltip-test.png'), img.toPNG())
      console.log('shot tooltip')
    } catch (e) { console.log('fail', e.message) }
    app.exit(0)
  }, 2200)
})
