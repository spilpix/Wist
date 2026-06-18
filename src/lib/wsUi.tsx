// Shared UI helpers for the collaborative Workspace (avatars, time, palettes).

export const PROJECT_COLORS = [
  '#2383e2', '#e67d22', '#6fb06f', '#c47a7a',
  '#7aa8c4', '#c9a96b', '#a87dc4', '#5b8def',
]

// kanban columns
export const COLUMNS = [
  { id: 'todo', label: 'Сделать' },
  { id: 'doing', label: 'В работе' },
  { id: 'done', label: 'Готово' },
] as const

// task priority levels (cycled with a click)
export const PRIORITIES = ['none', 'low', 'med', 'high'] as const
export const PRIORITY_META: Record<string, { color: string; label: string }> = {
  none: { color: '#6b7280', label: 'Без приоритета' },
  low: { color: '#6fb06f', label: 'Низкий' },
  med: { color: '#e0a23b', label: 'Средний' },
  high: { color: '#e0574b', label: 'Высокий' },
}

// sticky-note palette for the shared canvas
export const STICKY_PALETTE = ['#f5d76e', '#7ec8e3', '#8fd99f', '#f3a5b1', '#c8a2e0', '#f0b884', '#d8dde3']

// deterministic avatar colour from a name
export function avatarColor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360
  return `hsl(${h} 45% 45%)`
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return (parts[0]?.[0] ?? '?').toUpperCase() + (parts[1]?.[0]?.toUpperCase() ?? '')
}

export function Avatar({ name, size = 22 }: { name: string; size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, fontSize: size * 0.42, backgroundColor: avatarColor(name) }}
      title={name}
    >
      {initials(name)}
    </span>
  )
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 2) return 'только что'
  if (m < 60) return `${m} мин назад`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} ч назад`
  return `${Math.floor(h / 24)} дн назад`
}

export function dueLabel(due: string): { text: string; overdue: boolean } {
  const d = new Date(due.slice(0, 10) + 'T00:00:00')
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const days = Math.round((d.getTime() - today.getTime()) / 86_400_000)
  if (days < 0) return { text: `${-days} дн назад`, overdue: true }
  if (days === 0) return { text: 'сегодня', overdue: false }
  if (days === 1) return { text: 'завтра', overdue: false }
  return { text: `${days} дн`, overdue: false }
}

export function formatSize(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} Б`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`
}
