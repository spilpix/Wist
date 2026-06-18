import { useRef, useState, type CSSProperties } from 'react'
import { Bot, CalendarClock, FolderKanban, Plus, Trash2 } from 'lucide-react'
import { TaskCheck, taskCircleColor, dueInfo } from './TaskRow'
import DragHandle from './ui/DragHandle'
import { liftDragSource } from '../lib/mediaDrag'
import { TASK_STATUSES, type Task, type TaskStatus } from '../types/models'
import { useI18n } from '../i18n'

type TFn = ReturnType<typeof useI18n>['t']

const COLUMN_HUE: Record<TaskStatus, { ct: string; cb: string }> = {
  todo: { ct: 'var(--c-gray-text)', cb: 'var(--c-gray-bg)' },
  doing: { ct: 'var(--c-orange-text)', cb: 'var(--c-orange-bg)' },
  done: { ct: 'var(--c-green-text)', cb: 'var(--c-green-bg)' },
}

/**
 * The shared task kanban — three status columns (Notion block-card styling) with
 * drag-to-move, inline add, and the same row chrome as the list view. Used by the
 * global Tasks page and the hub Tasks tab so boards look identical everywhere.
 */
export default function TaskBoard({
  grouped,
  t,
  onMove,
  onAdd,
  onRemove,
  onToggle,
  onOpen,
}: {
  grouped: Record<TaskStatus, Task[]>
  t: TFn
  onMove: (id: number, status: TaskStatus) => void
  onAdd: (text: string, status: TaskStatus) => void
  onRemove: (task: Task) => void
  onToggle: (task: Task) => void
  onOpen: (task: Task) => void
}) {
  const [over, setOver] = useState<TaskStatus | null>(null)

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {TASK_STATUSES.map((status) => {
        const list = grouped[status]
        const isOver = over === status
        const hue = COLUMN_HUE[status]
        return (
          <section
            key={status}
            onDragOver={(e) => {
              e.preventDefault()
              if (over !== status) setOver(status)
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver((s) => (s === status ? null : s))
            }}
            onDrop={(e) => {
              e.preventDefault()
              setOver(null)
              const id = Number(e.dataTransfer.getData('text/plain'))
              if (id) onMove(id, status)
            }}
            className={`block-col flex min-h-[16rem] flex-col rounded-xl border p-1.5 transition-colors ${
              isOver ? 'border-accent bg-accent/5' : 'border-transparent'
            }`}
            style={{ '--ct': hue.ct, '--cb': hue.cb } as CSSProperties}
          >
            <header className="flex items-center gap-2 px-2 pb-2.5 pt-1.5">
              <span className="block-pill rounded-full px-2.5 py-0.5 text-[12px] font-semibold">
                {t(`tasks.status.${status}` as 'tasks.status.todo')}
              </span>
              <span className="text-xs text-zinc-500">{list.length}</span>
            </header>

            <div className="flex-1 space-y-2 px-1 pb-1">
              {list.map((task) => (
                <BoardCard key={task.id} task={task} t={t} onRemove={onRemove} onToggle={onToggle} onOpen={onOpen} />
              ))}
            </div>

            <AddCard status={status} t={t} onAdd={onAdd} />
          </section>
        )
      })}
    </div>
  )
}

function BoardCard({
  task,
  t,
  onRemove,
  onToggle,
  onOpen,
}: {
  task: Task
  t: TFn
  onRemove: (task: Task) => void
  onToggle: (task: Task) => void
  onOpen: (task: Task) => void
}) {
  const due = dueInfo(task.due_date, t)
  const dragged = useRef(false)
  return (
    <div
      draggable
      onMouseDown={() => (dragged.current = false)}
      onDragStart={(e) => {
        dragged.current = true
        e.dataTransfer.setData('text/plain', String(task.id))
        e.dataTransfer.effectAllowed = 'move'
        liftDragSource(e, e.currentTarget)
      }}
      onClick={() => {
        if (dragged.current) return
        onOpen(task)
      }}
      className="block-card group cursor-grab rounded-lg p-2.5 active:cursor-grabbing"
    >
      <div className="flex items-start gap-2.5">
        <DragHandle className="-ml-1 mt-px" />
        <span className="mt-px">
          <TaskCheck done={!!task.done} color={taskCircleColor(task)} onToggle={() => onToggle(task)} size={18} />
        </span>
        <div className={`min-w-0 flex-1 text-[13.5px] leading-snug ${task.done ? 'text-zinc-500 line-through' : 'text-zinc-200'}`}>
          {task.title}
        </div>
        <button
          className="-mr-1 -mt-0.5 shrink-0 rounded-lg p-1 text-zinc-600 opacity-0 transition-all hover:bg-highlight hover:text-danger group-hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation()
            onRemove(task)
          }}
          title={t('common.delete')}
        >
          <Trash2 size={13} />
        </button>
      </div>
      {(task.note || task.project_name || due || task.source !== 'user') && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-[30px]">
          {due && !task.done && (
            <span className={`flex items-center gap-1 text-[10.5px] font-medium ${due.color}`}>
              <CalendarClock size={10} /> {due.label}
            </span>
          )}
          {task.source !== 'user' && (
            <span className="flex items-center gap-1 rounded-full bg-raised px-1.5 py-0.5 text-[10px] font-semibold text-zinc-400" title={t('tasks.bySource', { source: task.source })}>
              <Bot size={10} /> {task.source}
            </span>
          )}
          {task.project_name && (
            <span className="flex items-center gap-1 rounded-full bg-raised px-1.5 py-0.5 text-[10px] font-medium text-zinc-400">
              <FolderKanban size={10} /> {task.project_name}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

function AddCard({ status, t, onAdd }: { status: TaskStatus; t: TFn; onAdd: (text: string, status: TaskStatus) => void }) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  const busy = useRef(false)

  const submit = () => {
    const v = value.trim()
    if (!v || busy.current) return
    busy.current = true
    setValue('')
    Promise.resolve(onAdd(v, status)).finally(() => {
      busy.current = false
    })
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="block-add m-1.5 mt-1 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors"
      >
        <Plus size={14} /> {t('common.add')}
      </button>
    )
  }

  return (
    <div className="p-1.5 pt-1">
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={t('tasks.newInColumn')}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit()
          if (e.key === 'Escape') {
            setValue('')
            setOpen(false)
          }
        }}
        onBlur={() => {
          submit()
          setOpen(false)
        }}
        className="block-input w-full rounded-lg border border-edge bg-card px-2.5 py-1.5 text-[13px] text-zinc-200 outline-none placeholder:text-zinc-600"
      />
    </div>
  )
}
