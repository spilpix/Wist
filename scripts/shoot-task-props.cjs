// Screenshot the PropertyEditor inside the TaskPeek dock. Seeds a task with mixed-type
// props + opens it via ?open=. Isolated via WIST_USER_DATA.
//   Run: npx electron scripts/shoot-task-props.cjs
const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs')

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wist-taskprops-'))
process.env.WIST_USER_DATA = tmpRoot

const { app, BrowserWindow } = require('electron')
require(path.join(__dirname, '..', 'dist-electron', 'main.js'))
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const props = {
  fields: [
    { id: 't1', name: 'Оценка усилий', type: 'number', value: 8 },
    { id: 't2', name: 'Заказчик', type: 'text', value: 'Команда роста' },
    { id: 't3', name: 'Прошло ревью', type: 'checkbox', value: false },
    { id: 't4', name: 'Спецификация', type: 'url', value: 'github.com/spilpix/wist' },
  ],
}

app.whenReady().then(() => {
  setTimeout(async () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) { console.error('no window'); app.exit(3); return }
    win.setSize(1340, 940)

    const id = await win.webContents.executeJavaScript(
      `window.wist.tasks.create({ title: 'Допилить объектную модель', note: 'Типизированные свойства + цветные типы.', priority: 'high', status: 'doing', props: ${JSON.stringify(props)} }).then(t => t.id)`
    )
    await win.webContents.executeJavaScript(`location.hash='#/tasks?open=${id}'`)
    await wait(1800)

    const img = (await win.webContents.capturePage()).resize({ width: 1180 })
    fs.writeFileSync(path.join(__dirname, 'task-props-dark.png'), img.toPNG())
    console.log('shot task-props-dark')

    // sanity: confirm the peek shows our props
    const seen = await win.webContents.executeJavaScript(`document.body.innerText.includes('Заказчик') && document.body.innerText.includes('Оценка усилий')`)
    console.log('props visible in peek:', seen)

    try { fs.rmSync(tmpRoot, { recursive: true, force: true }) } catch { /* best effort */ }
    app.exit(seen ? 0 : 4)
  }, 2400)
})
