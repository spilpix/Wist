// Screenshot the /tree knowledge graph in light + dark to verify the connected-map
// reskin (edges visible, hub anchors, Capacities chips). Captures idle + a focused
// state (dispatches a mousemove over the centre root so beams light up).
const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
require(path.join(__dirname, '..', 'dist-electron', 'main.js'))

app.whenReady().then(() => {
  setTimeout(async () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) { app.exit(3); return }
    win.setSize(1340, 880)

    const shoot = async (file) => {
      const img = (await win.webContents.capturePage()).resize({ width: 1100 })
      fs.writeFileSync(path.join(__dirname, file), img.toPNG())
      console.log('shot', file)
    }

    for (const theme of ['light', 'dark']) {
      // Persist the real theme setting + reload so the React store re-inits with it
      // (the graph reads `dark` from the store, not the DOM attribute).
      await win.webContents.executeJavaScript(`window.wist.settings.set({ theme: ${JSON.stringify(theme)} })`)
      win.webContents.reload()
      await wait(2600)
      await win.webContents.executeJavaScript(`location.hash='#/tree'`)
      await wait(4400) // let d3-force settle + auto-fit
      await shoot(`tree-${theme}-idle.png`)

      if (theme === 'light') {
        // re-trigger the entrance (nav away + back) and burst-capture to catch the animation
        await win.webContents.executeJavaScript(`location.hash='#/'`)
        await wait(500)
        await win.webContents.executeJavaScript(`location.hash='#/tree'`)
        for (let i = 0; i < 6; i++) {
          await wait(95)
          await shoot(`tree-enter-${i}.png`)
        }
      }

      // Hover the big "Задачи" hub to light its cluster (deterministic seeded layout)
      const hit = await win.webContents.executeJavaScript(`(() => {
        const c = document.querySelector('canvas'); if (!c) return null
        const b = c.getBoundingClientRect()
        // dispatch a synthetic mousemove and let the canvas hover-test handle it
        return { left: b.left, top: b.top, w: b.width, h: b.height }
      })()`)
      if (hit) {
        // sweep a few points around centre-bottom where the Задачи hub settles
        for (const [fx, fy] of [[0.42, 0.55], [0.5, 0.5], [0.46, 0.62]]) {
          win.webContents.sendInputEvent({
            type: 'mouseMove',
            x: Math.round(hit.left + hit.w * fx),
            y: Math.round(hit.top + hit.h * fy),
          })
          await wait(550)
        }
        await shoot(`tree-${theme}-focus.png`)
      }
    }
    app.exit(0)
  }, 2400)
})
