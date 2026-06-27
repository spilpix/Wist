// Focused screenshots of the reworked top bar: pinned Home + nav arrows · divider ·
// open-document tabs (colour-tinted active icon) … accent swatch + theme. Boots the app
// against a throwaway userData dir (fresh, empty session → a clean, uncrowded bar) and
// captures a crisp full-resolution strip of just the top bar (dark, light, accent open).
const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs')

// redirect appData BEFORE main.ts runs — main builds userData as <appData>/Wist, so this
// gives the app a pristine profile (no real tabs/data) without touching the user's session
const tmp = path.join(os.tmpdir(), 'bard-shot-' + Date.now())
app.setPath('appData', tmp)

require(path.join(__dirname, '..', 'dist-electron', 'main.js'))

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

async function strip(win, name, height = 50) {
  const w = win.getContentBounds().width
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: w, height })
  fs.writeFileSync(path.join(__dirname, `topbar-${name}.png`), img.toPNG())
  console.log('shot', name, w + 'x' + height)
}

app.whenReady().then(() => {
  setTimeout(async () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) { console.error('no window'); app.exit(3); return }
    win.setSize(1340, 900)
    await wait(2500)

    // open two document tabs (non-/tree, so the sidebar stays expanded); end on /notes
    for (const route of ['/tasks', '/notes']) {
      await win.webContents.executeJavaScript(`location.hash='#${route}'`)
      await wait(900)
    }
    await wait(700)

    const n = await win.webContents.executeJavaScript(`document.querySelectorAll('[data-tab-id]').length`)
    console.log('rendered tabs:', n)

    await strip(win, 'dark')

    await win.webContents.executeJavaScript(`document.querySelector('[data-accent-swatch]')?.click()`)
    await wait(500)
    await strip(win, 'accent-open', 130)
    await win.webContents.executeJavaScript(`document.body.click()`)
    await wait(300)

    await win.webContents.executeJavaScript(`(() => {
      const r = document.documentElement
      r.dataset.theme = 'light'
      ;['--accent','--accent-rgb','--accent-hover-rgb','--accent-bright-rgb'].forEach(p => r.style.removeProperty(p))
    })()`)
    await wait(700)
    await strip(win, 'light')

    app.exit(0)
  }, 2200)
})
