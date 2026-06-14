import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Bot, Check, ChevronDown, ChevronRight, Flag, FolderKanban, ListTodo, Plus, Trash2 } from 'lucide-react'
import EmptyState from '../components/ui/EmptyState'
import Spinner from '../components/ui/Spinner'
import PageHeader from '../components/ui/PageHeader'
import type { Task, TaskPriority } from '../types/models'
import { formatRelative } from '../utils/formatters'
import { useI18n } from '../i18n'

const PRIORITY_COLORS: Record<TaskPriority, string> = {
  none: 'text-zinc-600',
  low: 'text-sky-400',
  high: 'text-red-400',
}
const PRIORITY_ORDER: TaskPriority[] = ['none', 'low', 'high']

export default function Tasks() {
  const { t } = useI18n()
  const [searchParams, setSearchParams] = useSearchParams()
  const [tasks, setTasks] = useState<Task[] | null>(null)
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState<TaskPriority>('none')
  const [showDone, setShowDone] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(() => window.wist.tasks.list().then(setTasks), [])

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

  const { open, done } = useMemo(() => {
    const list = tasks ?? []
    return { open: list.filter((x) => !x.done), done: list.filter((x) => x.done) }
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

  return (
    <div className="page max-w-4xl">
      <PageHeader
        icon={ListTodo}
        title={t('nav.tasks')}
        actions={<span className="text-sm text-zinc-500">{t('tasks.openCount', { n: open.length })}</span>}
      />

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

      {!open.length && !done.length ? (
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
