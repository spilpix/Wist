import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Bot, Trash2 } from 'lucide-react'
import { TaskCheck, taskCircleColor, dueInfo } from './TaskRow'
import type { Task } from '../types/models'
import { useI18n } from '../i18n'

type TFn = ReturnType<typeof useI18n>['t']

/**
 * A clean Notion list row: square checkbox + title + due. Checking strikes it through
 * IN PLACE (a brief pop, never removed). Clicking the row opens the detail peek.
 * For drag-to-reorder pass `handle` (a <DragHandle> wired to useSortable) + `dragging`.
 */
export default function TaskListRow({
  task,
  selected = false,
  multiSelected = false,
  onToggle,
  onOpen,
  onRowClick,
  onRemove,
  t,
  dragging = false,
  handle,
}: {
  task: Task
  selected?: boolean
  /** part of a multi-selection (Ctrl/Shift-click) — stronger highlight than `selected` */
  multiSelected?: boolean
  onToggle: (task: Task) => void
  onOpen: (task: Task) => void
  /** modifier-aware row click; when provided it replaces the default open-on-click */
  onRowClick?: (e: React.MouseEvent) => void
  onRemove?: (task: Task) => void
  t: TFn
  dragging?: boolean
  handle?: ReactNode
}) {
  const done = !!task.done
  const due = dueInfo(task.due_date, t)
  const [pop, setPop] = useState(false)
  const timer = useRef<number>()
  useEffect(() => () => window.clearTimeout(timer.current), [])
  const handleToggle = () => {
    if (!done) {
      setPop(true)
      timer.current = window.setTimeout(() => setPop(false), 450)
    }
    onToggle(task)
  }
  return (
    <div
      data-sortable-item
      onClick={(e) => (onRowClick ? onRowClick(e) : onOpen(task))}
      className={`group flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 transition-colors ${
        dragging ? 'drag-taken ' : ''
      }${
        multiSelected
          ? 'bg-[rgb(var(--accent-rgb)/0.16)] shadow-[inset_0_0_0_1px_rgb(var(--accent-rgb)/0.5)]'
          : selected
            ? 'bg-[rgb(var(--accent-rgb)/0.08)] shadow-[inset_0_0_0_1px_rgb(var(--accent-rgb)/0.5)]'
            : 'hover:bg-highlight'
      }`}
    >
      {handle}
      <TaskCheck done={done} color={taskCircleColor(task)} onToggle={handleToggle} animating={pop} />
      <span className={`min-w-0 flex-1 truncate text-[14px] font-medium ${done ? 'text-zinc-500 line-through' : 'text-zinc-100'}`}>
        {task.title || t('tasks.untitled')}
      </span>
      {task.source !== 'user' && <Bot size={12} className="shrink-0 text-zinc-600" />}
      {due && <span className={`shrink-0 text-[12.5px] tabular-nums ${done ? 'text-zinc-600' : due.color}`}>{due.label}</span>}
      {onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onRemove(task)
          }}
          className="-mr-1 shrink-0 rounded p-1 text-zinc-600 opacity-0 transition-all hover:text-danger group-hover:opacity-100"
          title={t('common.delete')}
        >
          <Trash2 size={13} />
        </button>
      )}
    </div>
  )
}
