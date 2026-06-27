// Screenshots the notes editor to verify the live highlight overlay ([[links]] +
// #tags tinted while editing) aligns with the textarea, and the [[ autocomplete popup.
// Runs on a THROWAWAY userData dir so live data is never touched.
//   Run: npx electron scripts/shoot-notes-links.cjs
const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs')

// isolate via main.ts's WIST_USER_DATA hook (APPDATA override doesn't work on Windows)
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wist-shootnl-'))
process.env.WIST_USER_DATA = tmpRoot

const { app, BrowserWindow } = require('electron')
require(path.join(__dirname, '..', 'dist-electron', 'main.js'))
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

app.whenReady().then(() => {
  setTimeout(async () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) { console.error('no window'); app.exit(3); return }
    win.setSize(1340, 940)

    const shoot = async (name) => {
      const img = (await win.webContents.capturePage()).resize({ width: 1100 })
      fs.writeFileSync(path.join(__dirname, `notes-${name}.png`), img.toPNG())
      console.log('shot', name)
    }

    // seed a target + a content-rich source note
    const sourceId = await win.webContents.executeJavaScript(`(async () => {
      await window.wist.notes.create({ title: 'Target Note', content: 'I am the target.' })
      const body = [
        '# My note',
        '',
        'This links to [[Target Note]] and carries a #idea tag.',
        'Second line referencing [[Target Note|alias]] too, plus #research.',
        '- a bullet item',
        '- [ ] a todo item',
        '',
        'Long wrapping paragraph to check overlay alignment: lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
      ].join('\\n')
      const s = await window.wist.notes.create({ title: 'Source Note', content: body })
      return s.id
    })()`)

    await win.webContents.executeJavaScript(`location.hash='#/notes?open=${sourceId}'`)
    await wait(1600)
    await shoot('edit-dark')

    // light theme
    await win.webContents.executeJavaScript(`window.wist.settings.set({ theme: 'light' })`)
    win.webContents.reload()
    await wait(2400)
    await win.webContents.executeJavaScript(`location.hash='#/notes?open=${sourceId}'`)
    await wait(1600)
    await shoot('edit-light')

    // back to dark, trigger the [[ autocomplete popup by typing into the textarea
    await win.webContents.executeJavaScript(`window.wist.settings.set({ theme: 'dark' })`)
    win.webContents.reload()
    await wait(2400)
    await win.webContents.executeJavaScript(`location.hash='#/notes?open=${sourceId}'`)
    await wait(1600)
    await win.webContents.executeJavaScript(`(() => {
      const ta = document.querySelector('textarea'); if (!ta) return
      ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length)
    })()`)
    for (const ch of ['\r', '[', '[', 'T']) {
      win.webContents.sendInputEvent({ type: 'char', keyCode: ch })
      await wait(140)
    }
    await wait(500)
    await shoot('popup-dark')

    // slash command menu: fresh line + "/"
    await win.webContents.executeJavaScript(`(() => {
      const ta = document.querySelector('textarea'); if (!ta) return
      ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length)
    })()`)
    for (const ch of ['\r', '/']) {
      win.webContents.sendInputEvent({ type: 'char', keyCode: ch })
      await wait(150)
    }
    await wait(450)
    await shoot('slash-dark')

    // floating selection toolbar: select a phrase + fire mouseup so refreshUi shows it
    await win.webContents.executeJavaScript(`(() => {
      const ta = document.querySelector('textarea'); if (!ta) return
      const needle = 'wrapping paragraph'
      const i = ta.value.indexOf(needle)
      if (i < 0) return
      ta.focus(); ta.setSelectionRange(i, i + needle.length)
      ta.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
    })()`)
    await wait(450)
    await shoot('toolbar-dark')

    try { fs.rmSync(tmpRoot, { recursive: true, force: true }) } catch { /* best effort */ }
    app.exit(0)
  }, 2400)
})
