import { useEffect, useRef, useState } from 'react'
import { Check, Bot, CalendarClock, Film, FolderKanban, Trash2 } from 'lucide-react'
import DatePicker from './ui/DatePicker'
import { type Task } from '../types/models'
import { formatRelative } from '../utils/formatters'
import { useI18n } from '../i18n'

type TFn = ReturnType<typeof useI18n>['t']

// iOS-Reminders-style circle colour: red for high priority, otherwise the list/hub
// accent (defaults to Notion blue). The circle is an outlined ring until completed.
export function taskCircleColor(task: Task, accent?: string): string {
  if (task.priority === 'high') return 'var(--c-red-text)'
  return accent || 'var(--accent)'
}

/** Square Notion-style completion checkbox: a hollow box that fills + checks when done. */
export function TaskCheck({
  done,
  color,
  onToggle,
  size = 18,
  animating = false,
}: {
  done: boolean
  color: string
  onToggle: () => void
  size?: number
  animating?: boolean
}) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        onToggle()
      }}
      aria-label={done ? 'uncomplete' : 'complete'}
      // square Notion checkbox: neutral hollow box → fills with the colour + a white
      // check when done (the spec's .tck). It never removes the row, only strikes it.
      className={`grid shrink-0 place-items-center rounded-[5px] border-2 transition-colors duration-200 ${done ? '' : 'border-zinc-600 hover:border-zinc-400'} ${animating ? 'animate-check-pop' : ''}`}
      style={done ? { width: size, height: size, backgroundColor: color, borderColor: color } : { width: size, height: size }}
    >
      <Check
        size={Math.round(size * 0.62)}
        strokeWidth={3.5}
        // literal #fff — the `white` token theme-flips to dark ink in light mode
        className={`text-[#fff] transition-transform duration-200 ${done ? 'scale-100' : 'scale-0'}`}
      />
    </button>
  )
}

// human, coloured due-date label (overdue → red, today → accent, soon → amber)
export function dueInfo(due: string | null | undefined, t: TFn): { label: string; color: string } | null {
  if (!due) return null
  // due may carry a time: 'YYYY-MM-DD' or 'YYYY-MM-DD HH:MM'
  const datePart = due.slice(0, 10)
  const timePart = due.length > 10 ? due.slice(11, 16) : ''
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const d = new Date(`${datePart}T00:00:00`)
  if (isNaN(d.getTime())) return null
  const days = Math.round((d.getTime() - today.getTime()) / 86_400_000)
  // overdue → danger, today → accent (the "now" signal), soon → yellow content hue, later → muted
  const color = days < 0 ? 'text-danger' : days === 0 ? 'text-accent-bright' : days <= 2 ? 'text-[var(--c-yellow-text)]' : 'text-zinc-500'
  const dayLabel =
    days === 0
      ? t('tasks.today')
      : days === 1
        ? t('tasks.tomorrow')
        : days === -1
          ? t('tasks.yesterday')
          : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
  return { label: timePart ? `${dayLabel}, ${timePart}` : dayLabel, color }
}

/**
 * A single task rendered in the Apple Reminders style: a round tappable circle, the
 * title, an optional note line, and meta chips (due date, project, source). Clicking
 * the body opens the detail editor. Shared by the global Tasks page and the hub.
 */
export default function TaskRow({
  task,
  accent,
  onToggle,
  onRemove,
  onOpen,
  onSetDue,
  onOpenLink,
  showMeta = false,
  selected = false,
  t,
}: {
  task: Task
  accent?: string
  onToggle: (task: Task) => void
  onRemove?: (task: Task) => void
  onOpen?: (task: Task) => void
  onSetDue?: (task: Task, due: string | null) => void
  onOpenLink?: (task: Task) => void
  showMeta?: boolean
  selected?: boolean
  t: TFn
}) {
  const c = taskCircleColor(task, accent)
  const done = !!task.done
  const due = dueInfo(task.due_date, t)
  const [pop, setPop] = useState(false)
  const timer = useRef<number>()
  useEffect(() => () => window.clearTimeout(timer.current), [])

  // checking a task strikes it through IN PLACE with a brief pop on the box — it is
  // never removed or hidden; the list keeps it visible (struck) until it reloads.
  const handleToggle = () => {
    if (!done) {
      setPop(true)
      timer.current = window.setTimeout(() => setPop(false), 450)
    }
    onToggle(task)
  }

  return (
    <div className={`group flex items-center gap-3 px-4 py-2.5 transition-colors ${selected ? 'bg-accent-subtle' : 'hover:bg-highlight'}`}>
      <TaskCheck done={done} color={c} onToggle={handleToggle} animating={pop} />

      <button
        type="button"
        onClick={() => onOpen?.(task)}
        className={`min-w-0 flex-1 text-left ${onOpen ? 'cursor-pointer' : 'cursor-default'}`}
      >
        <div className={`truncate text-[15px] leading-snug transition-colors ${done ? 'text-zinc-500 line-through' : 'text-zinc-100'}`}>
          {task.title}
        </div>
        {task.note && <div className="mt-0.5 line-clamp-1 text-[13px] text-zinc-500">{task.note}</div>}
      </button>

      {/* context badges fill the right space (due · project · linked source) */}
      <div className="flex shrink-0 items-center gap-1.5">
        {due && !done && (
          <span className={`flex items-center gap-1 text-[11px] font-medium ${due.color}`}>
            <CalendarClock size={11} /> {due.label}
          </span>
        )}
        {task.linked_title_name && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onOpenLink?.(task)
            }}
            title={task.linked_title_name}
            className="flex max-w-[10rem] items-center gap-1 rounded-full bg-raised px-2 py-0.5 text-[10px] font-medium text-zinc-300 transition-colors hover:bg-highlight hover:text-zinc-100"
          >
            <Film size={10} className="shrink-0" /> <span className="truncate">{task.linked_title_name}</span>
          </button>
        )}
        {task.project_name && (
          <span className="flex max-w-[9rem] items-center gap-1 rounded-full border border-edge bg-raised px-2 py-0.5 text-[10px] font-medium text-zinc-300">
            <FolderKanban size={10} className="shrink-0" /> <span className="truncate">{task.project_name}</span>
          </span>
        )}
        {showMeta && task.source !== 'user' && (
          <span className="flex items-center gap-1 rounded-full bg-raised px-2 py-0.5 text-[10px] font-semibold text-zinc-400">
            <Bot size={10} /> {task.source}
          </span>
        )}
        {showMeta && (
          <span className="hidden w-16 text-right text-[11px] text-zinc-600 group-hover:hidden sm:block">
            {formatRelative(done ? task.completed_at : task.created_at)}
          </span>
        )}
      </div>

      {/* hover quick-actions: change date · delete (edit = click the row) */}
      <div className="pointer-events-none flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
        {onSetDue && (
          <DatePicker
            variant="icon"
            value={task.due_date ?? ''}
            onChange={(v) => onSetDue(task, v || null)}
            title={t('tasks.changeDue')}
          />
        )}
        {onRemove && (
          <button
            className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-highlight hover:text-danger"
            onClick={() => onRemove(task)}
            title={t('common.delete')}
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </div>
  )
}
