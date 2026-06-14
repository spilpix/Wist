import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Bot, Check, ChevronDown, ChevronRight, Columns3, Flag, FolderKanban, List, ListTodo, Plus, Trash2 } from 'lucide-react'
import EmptyState from '../components/ui/EmptyState'
import Spinner from '../components/ui/Spinner'
import PageHeader from '../components/ui/PageHeader'
import { TASK_STATUSES, TASK_STATUS_COLORS, type Task, type TaskPriority, type TaskStatus } from '../types/models'
import { formatRelative } from '../utils/formatters'
import { useI18n } from '../i18n'

const PRIORITY_COLORS: Record<TaskPriority, string> = {
  none: 'text-zinc-600',
  low: 'text-sky-400',
  high: 'text-red-400',
}
const PRIORITY_ORDER: TaskPriority[] = ['none', 'low', 'high']

type View = 'list' | 'board'

export default function Tasks() {
  const { t } = useI18n()
  const [searchParams, setSearchParams] = useSearchParams()
  const [tasks, setTasks] = useState<Task[] | null>(null)
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState<TaskPriority>('none')
  const [showDone, setShowDone] = useState(false)
  const [view, setView] = useState<View>(() => (localStorage.getItem('wist.tasksView') === 'board' ? 'board' : 'list'))
  const inputRef = useRef<HTMLInputElement>(null)
  const loadSeq = useRef(0)

  // ignore a resolved list() if a newer load() has since started — prevents the
  // optimistic board move + the onDataChanged refresh from clobbering each other
  const load = useCallback(() => {
    const seq = ++loadSeq.current
    return window.wist.tasks.list().then((ts) => {
      if (seq === loadSeq.current) setTasks(ts)
    })
  }, [])

  useEffect(() => {
    load()
    // live refresh when an AI agent writes through the local API
    return window.wist.events.onDataChanged((kind) => {
      if (kind === 'tasks') load()
    })
  }, [load])

  // command palette deep link: /tasks?focus=1
  useEffect(() => {
    if (searchParams.get('focus') === '1') {
      inputRef.current?.focus()
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams])

  const setViewPersisted = (v: View) => {
    setView(v)
    try {
      localStorage.setItem('wist.tasksView', v)
    } catch {
      /* storage unavailable */
    }
  }

  const add = async () => {
    const text = title.trim()
    if (!text) return
    setTitle('')
    await window.wist.tasks.create({ title: text, priority })
    load()
  }

  const toggle = async (task: Task) => {
    await window.wist.tasks.update(task.id, { done: task.done ? 0 : 1 })
    load()
  }

  const remove = async (task: Task) => {
    await window.wist.tasks.remove(task.id)
    load()
  }

  // optimistic column move for the board — snappy, then reconcile from the db
  const move = async (id: number, status: TaskStatus) => {
    const task = (tasks ?? []).find((x) => x.id === id)
    if (!task || task.status === status) return
    setTasks((prev) => (prev ?? []).map((x) => (x.id === id ? { ...x, status, done: status === 'done' ? 1 : 0 } : x)))
    await window.wist.tasks.update(id, { status })
    load()
  }

  const addTo = async (text: string, status: TaskStatus) => {
    const v = text.trim()
    if (!v) return
    await window.wist.tasks.create({ title: v, status })
    load()
  }

  const { open, done } = useMemo(() => {
    const list = tasks ?? []
    return { open: list.filter((x) => !x.done), done: list.filter((x) => x.done) }
  }, [tasks])

  const grouped = useMemo(() => {
    const g: Record<TaskStatus, Task[]> = { todo: [], doing: [], done: [] }
    for (const task of tasks ?? []) (g[task.status] ?? g.todo).push(task)
    return g
  }, [tasks])

  if (!tasks) return <Spinner />

  const Row = ({ task }: { task: Task }) => (
    <div className="group flex items-center gap-3 px-4 py-2.5">
      <button
        onClick={() => toggle(task)}
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
          task.done ? 'border-accent bg-accent text-[#fff]' : 'border-edge text-transparent hover:border-accent'
        }`}
      >
        <Check size={12} />
      </button>
      {task.priority !== 'none' && !task.done && (
        <Flag size={13} className={`shrink-0 ${PRIORITY_COLORS[task.priority]} fill-current`} />
      )}
      <div className="min-w-0 flex-1">
        <div className={`truncate text-sm ${task.done ? 'text-zinc-600 line-through decoration-zinc-700' : 'text-zinc-200'}`}>
          {task.title}
        </div>
        {task.note && <div className="mt-0.5 line-clamp-2 text-xs text-zinc-500">{task.note}</div>}
      </div>
      {task.source !== 'user' && (
        <span className="flex shrink-0 items-center gap-1 rounded-md bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold text-accent-bright" title={t('tasks.bySource', { source: task.source })}>
          <Bot size={11} /> {task.source}
        </span>
      )}
      {task.project_name && (
        <span className="flex shrink-0 items-center gap-1 rounded-md bg-raised px-1.5 py-0.5 text-[10px] font-medium text-zinc-400" title={t('project.badge')}>
          <FolderKanban size={10} /> {task.project_name}
        </span>
      )}
      {task.due_date && !task.done && (
        <span className="shrink-0 rounded-md bg-raised px-1.5 py-0.5 text-[11px] text-zinc-500">{task.due_date}</span>
      )}
      <span className="w-20 shrink-0 text-right text-[11px] text-zinc-600">
        {formatRelative(task.done ? task.completed_at : task.created_at)}
      </span>
      <button
        className="shrink-0 rounded-lg p-1.5 text-zinc-600 opacity-0 transition-all hover:text-red-400 group-hover:opacity-100"
        onClick={() => remove(task)}
      >
        <Trash2 size={14} />
      </button>
    </div>
  )

  const viewToggle = (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-0.5 rounded-lg border border-edge/60 bg-surface p-0.5">
        {(
          [
            ['list', List, t('tasks.viewList')],
            ['board', Columns3, t('tasks.viewBoard')],
          ] as const
        ).map(([v, Icon, label]) => (
          <button
            key={v}
            onClick={() => setViewPersisted(v)}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[13px] font-medium transition-colors ${
              view === v ? 'bg-raised text-zinc-100 shadow-sm' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>
      <span className="text-sm text-zinc-500">{t('tasks.openCount', { n: open.length })}</span>
    </div>
  )

  return (
    <div className={`page ${view === 'list' ? 'max-w-4xl' : ''}`}>
      <PageHeader icon={ListTodo} title={t('nav.tasks')} actions={viewToggle} />

      {/* quick capture */}
      <div className="mb-6 flex gap-2">
        <input
          ref={inputRef}
          className="input !py-2.5 text-[15px]"
          placeholder={t('tasks.placeholder')}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <button
          className="btn-ghost shrink-0 !px-3"
          title={t('tasks.priority')}
          onClick={() => setPriority(PRIORITY_ORDER[(PRIORITY_ORDER.indexOf(priority) + 1) % 3])}
        >
          <Flag size={15} className={`${PRIORITY_COLORS[priority]} ${priority !== 'none' ? 'fill-current' : ''}`} />
        </button>
        <button className="btn-accent shrink-0" onClick={add}>
          <Plus size={16} /> {t('common.add')}
        </button>
      </div>

      {view === 'board' ? (
        <Board grouped={grouped} t={t} onMove={move} onAdd={addTo} onRemove={remove} />
      ) : !open.length && !done.length ? (
        <EmptyState icon={ListTodo} title={t('tasks.emptyTitle')} subtitle={t('tasks.emptySubtitle')} />
      ) : (
        <>
          {open.length > 0 && <div className="card divide-y divide-edge/40">{open.map((task) => <Row key={task.id} task={task} />)}</div>}

          {done.length > 0 && (
            <div className="mt-6">
              <div className="mb-2 flex items-center justify-between">
                <button
                  className="flex items-center gap-1 text-sm font-medium text-zinc-500 hover:text-zinc-300"
                  onClick={() => setShowDone((v) => !v)}
                >
                  {showDone ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                  {t('tasks.doneCount', { n: done.length })}
                </button>
                <button
                  className="text-xs text-zinc-600 hover:text-red-400"
                  onClick={async () => {
                    await window.wist.tasks.clearCompleted()
                    load()
                  }}
                >
                  {t('tasks.clearDone')}
                </button>
              </div>
              {showDone && <div className="card divide-y divide-edge/40 opacity-70">{done.map((task) => <Row key={task.id} task={task} />)}</div>}
            </div>
          )}
        </>
      )}
    </div>
  )
}

type TFn = ReturnType<typeof useI18n>['t']

/* ---------------- kanban board ---------------- */
function Board({
  grouped,
  t,
  onMove,
  onAdd,
  onRemove,
}: {
  grouped: Record<TaskStatus, Task[]>
  t: TFn
  onMove: (id: number, status: TaskStatus) => void
  onAdd: (text: string, status: TaskStatus) => void
  onRemove: (task: Task) => void
}) {
  const [over, setOver] = useState<TaskStatus | null>(null)

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {TASK_STATUSES.map((status) => {
        const list = grouped[status]
        const isOver = over === status
        return (
          <section
            key={status}
            onDragOver={(e) => {
              e.preventDefault()
              if (over !== status) setOver(status)
            }}
            onDragLeave={(e) => {
              // only clear when the pointer truly leaves the column
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver((s) => (s === status ? null : s))
            }}
            onDrop={(e) => {
              e.preventDefault()
              setOver(null)
              const id = Number(e.dataTransfer.getData('text/plain'))
              if (id) onMove(id, status)
            }}
            className={`flex min-h-[60vh] flex-col rounded-xl border transition-colors ${
              isOver ? 'border-accent/50 bg-accent/[0.04]' : 'border-edge/50 bg-surface/40'
            }`}
          >
            <header className="flex items-center gap-2 px-3.5 pb-2 pt-3">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: TASK_STATUS_COLORS[status] }} />
              <h3 className="text-[13px] font-semibold text-zinc-300">{t(`tasks.status.${status}` as 'tasks.status.todo')}</h3>
              <span className="text-xs text-zinc-600">{list.length}</span>
            </header>

            <div className="flex-1 space-y-2 px-2.5 pb-1">
              {list.map((task) => (
                <BoardCard key={task.id} task={task} t={t} onRemove={onRemove} />
              ))}
            </div>

            <AddCard status={status} t={t} onAdd={onAdd} />
          </section>
        )
      })}
    </div>
  )
}

function BoardCard({ task, t, onRemove }: { task: Task; t: TFn; onRemove: (task: Task) => void }) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', String(task.id))
        e.dataTransfer.effectAllowed = 'move'
      }}
      className="group cursor-grab rounded-lg border border-edge/60 bg-card p-3 shadow-sm transition-colors hover:border-edge active:cursor-grabbing"
    >
      <div className="flex items-start gap-2">
        {task.priority !== 'none' && (
          <Flag size={12} className={`mt-0.5 shrink-0 ${PRIORITY_COLORS[task.priority]} fill-current`} />
        )}
        <div className={`min-w-0 flex-1 text-[13px] leading-snug ${task.done ? 'text-zinc-500 line-through decoration-zinc-700' : 'text-zinc-200'}`}>
          {task.title}
        </div>
        <button
          className="-mr-1 -mt-1 shrink-0 rounded p-1 text-zinc-600 opacity-0 transition-all hover:text-red-400 group-hover:opacity-100"
          onClick={() => onRemove(task)}
          title={t('common.delete')}
        >
          <Trash2 size={13} />
        </button>
      </div>
      {(task.note || task.project_name || task.due_date || task.source !== 'user') && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {task.source !== 'user' && (
            <span className="flex items-center gap-1 rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold text-accent-bright" title={t('tasks.bySource', { source: task.source })}>
              <Bot size={10} /> {task.source}
            </span>
          )}
          {task.project_name && (
            <span className="flex items-center gap-1 rounded bg-raised px-1.5 py-0.5 text-[10px] font-medium text-zinc-400">
              <FolderKanban size={10} /> {task.project_name}
            </span>
          )}
          {task.due_date && (
            <span className="rounded bg-raised px-1.5 py-0.5 text-[10px] text-zinc-500">{task.due_date}</span>
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

  // guard against double-create from Enter+blur firing together or repeat-Enter:
  // clear the field synchronously and block re-entry until the create settles
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
        className="m-2 mt-1 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[13px] text-zinc-500 transition-colors hover:bg-zinc-500/[0.12] hover:text-zinc-300"
      >
        <Plus size={14} /> {t('common.add')}
      </button>
    )
  }

  return (
    <div className="p-2 pt-1">
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
        className="w-full rounded-lg border border-edge bg-card px-2.5 py-1.5 text-[13px] text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-accent"
      />
    </div>
  )
}
