// Screenshots the redesigned task peek (Связи + compact props) in dark AND light.
// Run: npx electron scripts/shoot-relations.cjs
const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

require(path.join(__dirname, '..', 'dist-electron', 'main.js'))

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
async function shoot(win, name, width = 1040) {
  const img = (await win.webContents.capturePage()).resize({ width })
  fs.writeFileSync(path.join(__dirname, `relations-${name}.png`), img.toPNG())
  console.log('shot', name)
}
const toLight = (win) => win.webContents.executeJavaScript(`(() => {
  const r = document.documentElement
  r.dataset.theme = 'light'
  ;['--accent','--accent-rgb','--accent-hover-rgb','--accent-bright-rgb'].forEach(p => r.style.removeProperty(p))
})()`)
const toDark = (win) => win.webContents.executeJavaScript(`document.documentElement.dataset.theme = 'dark'`)

app.whenReady().then(() => {
  setTimeout(async () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) { console.error('no window'); app.exit(3); return }
    win.setSize(1360, 920)

    const id = await win.webContents.executeJavaScript(
      `window.wist.tasks.list({}).then(ts => ts[0] ? ts[0].id : null)`
    )
    if (!id) { console.error('no tasks'); app.exit(2); return }

    await win.webContents.executeJavaScript(`location.hash='#/tasks?open=${id}'`)
    await wait(1800)
    await toDark(win); await wait(300)
    await shoot(win, 'dark')

    await toLight(win); await wait(500)
    await shoot(win, 'light')

    // open link picker (light) to verify the colored chips in the picker
    await win.webContents.executeJavaScript(`(() => {
      const b = [...document.querySelectorAll('button')].find(x => /Связать объект|Link an object/.test(x.textContent||''))
      if (b) b.click()
    })()`)
    await wait(900)
    await shoot(win, 'picker')

    app.exit(0)
  }, 2600)
})
