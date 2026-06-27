// Isolated screenshots of the redesigned Hubs screen (empty state, populated dark,
// create modal) so I can review the redesign visually. Boots the BUILT app against a
// THROWAWAY userData dir (WIST_USER_DATA — honoured by main.ts) so the live DB is never
// touched, seeds a handful of PKM-style hubs with notes/tasks (for the card "pulse" +
// the Continue rail), then captures the page.
//   Run:  npx electron scripts/shoot-hubs.cjs
const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wist-hubs-'))
process.env.WIST_USER_DATA = tmp

require(path.join(__dirname, '..', 'dist-electron', 'main.js'))

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const errors = []

async function shoot(win, name) {
  const img = await win.webContents.capturePage()
  fs.writeFileSync(path.join(__dirname, `hubs-${name}.png`), img.toPNG())
  console.log('shot', name)
}

app.whenReady().then(() => {
  setTimeout(async () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) { console.log('RESULT: NO_WINDOW'); app.exit(3); return }
    win.setSize(1360, 900)
    win.webContents.on('console-message', (_e, level, message) => {
      if (level >= 3) errors.push(message.slice(0, 300))
    })

    // 1) empty state — DB is fresh, so /projects shows the inviting template empty state
    await win.webContents.executeJavaScript(`location.hash = '#/projects'`)
    await wait(2000)
    await shoot(win, 'empty')

    // seed PKM-style hubs with notes + tasks so the pulse + Continue rail have content
    await win.webContents.executeJavaScript(`(async () => {
      const hubs = [
        { name: 'Bard', kind: 'Личный проект', icon: '🔭', color: '#c4622d',
          notes: ['Редизайн экрана хабов', 'Починить зависание лоадера', 'Аудит v0.73'], tasks: ['Свести отчёт', 'Собрать exe'] },
        { name: 'Здоровье', kind: 'Область жизни', icon: '🏋️', color: '#8a9a5b',
          notes: ['Утренняя рутина', 'Результаты анализов'], tasks: ['Записаться к врачу'] },
        { name: 'Чтение', kind: 'Ресурс', icon: '📚', color: '#c89a3c',
          notes: ['Атомные привычки — конспект', 'Список книг на 2026', 'Thinking, Fast and Slow'], tasks: [] },
        { name: 'Идеи', kind: 'Область', icon: '💡', color: '#9a7aa0',
          notes: ['Приложение: трекер привычек', 'Питч для стартапа', 'Случайные мысли'], tasks: ['Накидать вайрфреймы'] },
        { name: 'Финансы', kind: 'Область жизни', icon: '💼', color: '#5f8a82',
          notes: ['Бюджет на месяц', 'Подписки — ревизия'], tasks: ['Закрыть лишние подписки', 'Свести траты'] },
      ]
      for (const h of hubs) {
        const p = await window.wist.projects.create({ name: h.name, kind: h.kind, icon: h.icon, color: h.color, status: 'active' })
        for (const title of h.notes) await window.wist.notes.create({ title, content: '', project_id: p.id })
        for (const title of h.tasks) await window.wist.tasks.create({ title, status: 'todo', project_id: p.id })
      }
      return 'seeded'
    })()`).catch((e) => errors.push('seed: ' + e.message))

    // remount the page so the store re-reads the freshly seeded data
    await win.webContents.executeJavaScript(`location.hash = '#/'`)
    await wait(700)
    await win.webContents.executeJavaScript(`location.hash = '#/projects'`)
    await wait(1800)
    await shoot(win, 'dark')

    // 3) create modal (the lightened, PKM-first flow)
    await win.webContents.executeJavaScript(`location.hash = '#/projects?new=1'`)
    await wait(1200)
    await shoot(win, 'create')

    console.log('CONSOLE_ERRORS:', errors.length ? JSON.stringify(errors.slice(0, 8), null, 2) : 'none')
    app.exit(0)
  }, 2600)
})
