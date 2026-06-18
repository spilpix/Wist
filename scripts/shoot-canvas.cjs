// Boots the real app, creates a throwaway canvas full of objects, opens the
// board, screenshots it and prints any console warnings/errors, then deletes
// the test canvas so the real DB stays clean.
const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

require(path.join(__dirname, '..', 'dist-electron', 'main.js'))

const errs = []
const LEVELS = ['log', 'info', 'WARN', 'ERROR']

const sample = {
  viewport: { x: 70, y: 80, k: 0.92 },
  nodes: [
    { id: 'fr1', type: 'frame', x: 16, y: 16, w: 460, h: 230, text: 'Идеи' },
    { id: 'a1', type: 'sticky', x: 40, y: 56, w: 170, h: 170, fill: '#FCE8A6', text: 'Идея №1', frameId: 'fr1' },
    { id: 'a2', type: 'sticky', x: 280, y: 56, w: 170, h: 170, fill: '#A7D3F2', text: 'Синий стикер с длинным текстом который должен ужаться и перенестись', frameId: 'fr1' },
    { id: 't1', type: 'text', x: 510, y: 40, w: 280, h: 90, text: 'Заголовок борда', bold: true, align: 'center' },
    { id: 's1', type: 'shape', x: 40, y: 300, w: 170, h: 130, shape: 'ellipse', fill: '#3A8A8A', stroke: '#E0DAD0', strokeWidth: 2, text: 'Эллипс' },
    { id: 's2', type: 'shape', x: 250, y: 300, w: 150, h: 130, shape: 'diamond', fill: '#E67D2222', stroke: '#E67D22', strokeWidth: 2, text: 'Ромб' },
    { id: 's4', type: 'shape', x: 620, y: 300, w: 150, h: 130, shape: 'cylinder', fill: '#A87DC4', stroke: '#2C2418', strokeWidth: 2, text: 'БД' },
    { id: 'pen1', type: 'pen', x: 470, y: 470, w: 180, h: 90, strokeWidth: 4, stroke: '#E67D22', points: [
      { x: 0, y: 70 }, { x: 25, y: 10 }, { x: 60, y: 85 }, { x: 95, y: 15 }, { x: 130, y: 80 }, { x: 180, y: 30 },
    ] },
    { id: 'cm1', type: 'comment', x: 800, y: 150, w: 32, h: 32, thread: [{ text: 'Проверить цвет' }] },
    { id: 'es', type: 'sticky', x: 470, y: 470, w: 150, h: 150, fill: '#FF8A8A' },
    { id: 'cloud', type: 'shape', x: 250, y: 480, w: 170, h: 110, shape: 'cloud' },
    { id: 'img1', type: 'image', x: 800, y: 320, w: 220, h: 150, path: path.join(__dirname, 'ui-home.png'), crop: { x: 0.28, y: 0.08, w: 0.45, h: 0.5 } },
  ],
  edges: [
    { id: 'e1', from: 'a1', to: 's1', type: 'straight', arrow: 'end' },
    { id: 'e2', from: 'a2', to: 's2', type: 'elbow', arrow: 'end', color: '#7AA8C4' },
    { id: 'e3', from: 's2', to: 's4', type: 'curve', arrow: 'both', dash: true, label: 'связь' },
  ],
}

app.whenReady().then(() => {
  setTimeout(async () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) {
      console.error('no window')
      app.exit(3)
      return
    }
    win.setSize(1320, 860)
    win.webContents.on('console-message', (_e, level, message, line, sourceId) => {
      if (level >= 2) errs.push(`[${LEVELS[level] || level}] ${String(message).slice(0, 300)} (${(sourceId || '').split('/').pop()}:${line})`)
    })
    win.webContents.on('render-process-gone', (_e, d) => errs.push('RENDER GONE: ' + JSON.stringify(d)))

    let id
    try {
      id = await win.webContents.executeJavaScript(`window.wist.canvas.create('__board_test__').then(c => c.id)`)
      await win.webContents.executeJavaScript(
        `window.wist.canvas.update(${id}, { data: ${JSON.stringify(sample)} }).then(() => true)`
      )
    } catch (e) {
      console.error('setup failed', e.message)
      app.exit(4)
      return
    }

    await win.webContents.executeJavaScript(`location.hash = '#/canvas/${id}'`)
    await new Promise((r) => setTimeout(r, 1600))
    await win.webContents.executeJavaScript(`document.documentElement.setAttribute('data-theme','light')`)
    await new Promise((r) => setTimeout(r, 500))

    try {
      const img = await win.webContents.capturePage()
      fs.writeFileSync(path.join(__dirname, 'ui-canvas.png'), img.toPNG())
      console.log('shot ui-canvas.png')
    } catch (e) {
      console.log('screenshot failed', e.message)
    }

    // verify the export capture IPC returns bytes + real pixel dims (PDF correctness)
    try {
      const cap = await win.webContents.executeJavaScript(
        `window.wist.canvas.capture({ x: 360, y: 60, width: 600, height: 400 }, 'jpeg').then(c => c ? { w: c.width, h: c.height, len: c.bytes.length } : null)`
      )
      console.log('capture jpeg:', JSON.stringify(cap))
    } catch (e) {
      console.log('capture check failed', e.message)
    }

    // REAL double-click → edit test (tool is 'select' on load): double-clicking a
    // sticky must open its textarea (pointer-capture steals the native dblclick).
    try {
      win.show()
      win.focus()
      win.moveTop()
      await new Promise((r) => setTimeout(r, 250))
      const rect = await win.webContents.executeJavaScript(`(() => {
        const el = [...document.querySelectorAll('div')].find(e => e.children.length === 0 && e.textContent === 'Идея №1')
        if (!el) return null
        const r = el.getBoundingClientRect()
        return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
      })()`)
      if (!rect) {
        console.log('sticky not found for dblclick')
      } else {
        win.webContents.sendInputEvent({ type: 'mouseDown', x: rect.x, y: rect.y, button: 'left', clickCount: 1 })
        win.webContents.sendInputEvent({ type: 'mouseUp', x: rect.x, y: rect.y, button: 'left', clickCount: 1 })
        await new Promise((r) => setTimeout(r, 120))
        win.webContents.sendInputEvent({ type: 'mouseDown', x: rect.x, y: rect.y, button: 'left', clickCount: 1 })
        win.webContents.sendInputEvent({ type: 'mouseUp', x: rect.x, y: rect.y, button: 'left', clickCount: 1 })
        await new Promise((r) => setTimeout(r, 450))
        const editing = await win.webContents.executeJavaScript(`document.querySelectorAll('textarea').length > 0`)
        console.log('sticky editing after double-click:', editing, '(expected true)')
        win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' })
        await new Promise((r) => setTimeout(r, 150))
      }
    } catch (e) {
      console.log('dblclick edit test failed', e.message)
    }

    // REAL click test (OS-level input → exercises pointer-capture): clicking the
    // Frame tool in the bottom toolbar must activate it (would fail if pointerdown
    // bubbled to the board and stole the click).
    try {
      const rect = await win.webContents.executeJavaScript(`(() => {
        const b = [...document.querySelectorAll('button')].find(x => x.title && x.title.indexOf('Фрейм') === 0)
        if (!b) return null
        const r = b.getBoundingClientRect()
        return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
      })()`)
      if (!rect) {
        console.log('frame-tool button not found')
      } else {
        win.webContents.sendInputEvent({ type: 'mouseDown', x: rect.x, y: rect.y, button: 'left', clickCount: 1 })
        win.webContents.sendInputEvent({ type: 'mouseUp', x: rect.x, y: rect.y, button: 'left', clickCount: 1 })
        await new Promise((r) => setTimeout(r, 400))
        const active = await win.webContents.executeJavaScript(`(() => {
          const b = [...document.querySelectorAll('button')].find(x => x.title && x.title.indexOf('Фрейм') === 0)
          return b ? b.className.indexOf('2383E1') >= 0 : null
        })()`)
        console.log('frame-tool active after real click:', active, '(expected true)')
      }
    } catch (e) {
      console.log('button click check failed', e.message)
    }

    // clean up the throwaway canvas
    try {
      await win.webContents.executeJavaScript(`location.hash = '#/canvas'`)
      await new Promise((r) => setTimeout(r, 400))
      await win.webContents.executeJavaScript(`window.wist.canvas.remove(${id}).then(() => true)`)
    } catch (e) {
      console.log('cleanup failed', e.message)
    }

    console.log('\n===== CONSOLE (warn+error) =====')
    console.log(errs.length ? errs.join('\n') : '(clean)')
    app.exit(0)
  }, 2200)
})
