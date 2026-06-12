// Standalone harness: boots the world with mock data, reports WORLD_OK / WORLD_ERR.
import { createWorld, type WorldData } from './createWorld'
import type { MemoryEvent, MemoryKind } from '../types/models'

function mockEvents(): MemoryEvent[] {
  const kinds: MemoryKind[] = ['moment', 'title', 'book', 'note', 'journal']
  const out: MemoryEvent[] = []
  const now = new Date()
  let id = 1
  for (let m = 0; m < 12; m++) {
    const d = new Date(now)
    d.setMonth(d.getMonth() - m)
    const count = [4, 2, 6, 1, 3, 0, 5, 2, 1, 3, 2, 4][m]
    for (let i = 0; i < count; i++) {
      const day = String(1 + ((i * 7) % 27)).padStart(2, '0')
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      out.push({
        key: `e${id}`,
        kind: kinds[(m + i) % kinds.length],
        date: `${key}-${day} 12:00:00`,
        label: `Память №${id}`,
        sublabel: i % 2 ? 'тестовая заметка' : null,
        ref_id: id++,
      })
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

function months(): Array<{ key: string; label: string }> {
  const names = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек']
  const out: Array<{ key: string; label: string }> = []
  const cursor = new Date()
  cursor.setDate(1)
  cursor.setMonth(cursor.getMonth() - 11)
  for (let i = 0; i < 12; i++) {
    out.push({
      key: `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`,
      label: names[cursor.getMonth()],
    })
    cursor.setMonth(cursor.getMonth() + 1)
  }
  return out
}

const data: WorldData = {
  events: mockEvents(),
  months: months(),
  stats: { titles: 7, notes: 4, openTasks: 3, doneTasks: 5, streak: 4, moments: 8 },
  assets: {},
  zoneLabels: {
    library: 'Лес историй',
    notes: 'Сад мыслей',
    journal: 'Озеро дней',
    tasks: 'Тропа дел',
    moments: 'Светлячки',
    tasksSub: 'открыто: 3',
    journalSub: 'серия: 4',
  },
  kindNames: { moment: 'Момент', title: 'Завершено', book: 'Книга', note: 'Запись', journal: 'Дневник' },
  dateOf: (iso) => iso.slice(0, 10),
}

const host = document.getElementById('host') as HTMLDivElement

createWorld(host, data, {
  navigate: (to) => console.log('NAVIGATE', to),
  tip: () => undefined,
})
  .then(() => console.log('WORLD_OK'))
  .catch((err) => {
    console.error('WORLD_ERR', err?.stack ?? String(err))
    const pre = document.createElement('pre')
    pre.style.color = 'red'
    pre.textContent = String(err?.stack ?? err)
    document.body.appendChild(pre)
  })

window.addEventListener('error', (e) => console.error('WORLD_WINDOW_ERR', e.message, e.filename, e.lineno))
window.addEventListener('unhandledrejection', (e) => console.error('WORLD_REJECTION', String(e.reason?.stack ?? e.reason)))
