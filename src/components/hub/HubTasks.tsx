import { useCallback, useEffect, useRef, useState } from 'react'
import { Columns3, List as ListIcon, Plus } from 'lucide-react'
import TaskListRow from '../TaskListRow'
import TaskBoard from '../TaskBoard'
import TaskPeek from '../TaskPeek'
import { TASK_STATUSES, type Task, type TaskStatus } from '../../types/models'
import { useI18n } from '../../i18n'

type View = 'list' | 'board'

export default function HubTasks({
  projectId,
  openSignal,
  onChanged,
}: {
  projectId: number
  openSignal?: number
  onChanged?: () => void
}) {
  const { t } = useI18n()
  const [tasks, setTasks] = useState<Task[]>([])
  const [val, setVal] = useState('')
  const [view, setView] = useState<View>(() => (localStorage.getItem(`hub:tasksView:${projectId}`) === 'board' ? 'board' : 'list'))
  const [showDone, setShowDone] = useState(false)
  const [detail, setDetail] = useState<Task | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(() => {
    window.wist.tasks
      .list({ projectId })
      .then(setTasks)
      .catch(() => setTasks([]))
  }, [projectId])
  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    localStorage.setItem(`hub:tasksView:${projectId}`, view)
  }, [view, projectId])

  useEffect(() => {
    if (openSignal) inputRef.current?.focus()
  }, [openSignal])

  const refresh = () => {
    load()
    onChanged?.()
  }

  const add = async () => {
    const tt = val.trim()
    if (!tt) return
    setVal('')
    await window.wist.tasks.create({ title: tt, project_id: projectId })
    refresh()
  }
  const toggle = async (task: Task) => {
    await window.wist.tasks.update(task.id, { done: task.done ? 0 : 1 })
    refresh()
  }
  const remove = async (task: Task) => {
    await window.wist.tasks.remove(task.id)
    refresh()
  }
  const setStatus = async (task: Task, status: TaskStatus) => {
    if (task.status === status) return
    await window.wist.tasks.update(task.id, { status })
    refresh()
  }

  const active = tasks.filter((x) => !x.done)
  const done = tasks.filter((x) => x.done)

  const grouped = TASK_STATUSES.reduce(
    (acc, s) => ({ ...acc, [s]: tasks.filter((x) => x.status === s) }),
    {} as Record<TaskStatus, Task[]>
  )

  const moveTask = (id: number, status: TaskStatus) => {
    const task = tasks.find((x) => x.id === id)
    if (task) setStatus(task, status)
  }

  const addToColumn = async (text: string, status: TaskStatus) => {
    const tt = text.trim()
    if (!tt) return
    await window.wist.tasks.create({ title: tt, status, project_id: projectId })
    refresh()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-[16rem] flex-1 gap-2">
          <input
            ref={inputRef}
            className="input !py-2 text-sm"
            placeholder={t('tasks.placeholder')}
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
          />
          <button className="btn-accent shrink-0 !px-3" onClick={add}>
            <Plus size={16} />
          </button>
        </div>
        <div className="inline-flex gap-0.5 rounded-lg border border-edge bg-raised p-0.5">
          {([['list', ListIcon], ['board', Columns3]] as const).map(([id, Icon]) => (
            <button
              key={id}
              onClick={() => setView(id)}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                view === id ? 'bg-card text-white' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Icon size={14} />
            </button>
          ))}
        </div>
      </div>

      {!tasks.length ? (
        <p className="px-1 py-10 text-center text-xs text-zinc-600">{t('project.noTasks')}</p>
      ) : view === 'board' ? (
        <TaskBoard grouped={grouped} t={t} onMove={moveTask} onAdd={addToColumn} onRemove={remove} onToggle={toggle} onOpen={setDetail} />
      ) : (
        <div className="space-y-5">
          {active.length > 0 && (
            <div>
              {active.map((task) => (
                <TaskListRow key={task.id} task={task} onToggle={toggle} onOpen={setDetail} onRemove={remove} t={t} />
              ))}
            </div>
          )}
          {done.length > 0 && (
            <div>
              <button onClick={() => setShowDone((s) => !s)} className="mb-2 px-1 text-xs font-medium text-zinc-500 hover:text-zinc-300">
                {showDone ? '▾' : '▸'} {t('tasks.status.done')} · {done.length}
              </button>
              {showDone && (
                <div>
                  {done.map((task) => (
                    <TaskListRow key={task.id} task={task} onToggle={toggle} onOpen={setDetail} onRemove={remove} t={t} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Notion peek — same detail surface as /tasks (a right drawer), not a centered modal */}
      {detail && (
        <div
          className="fixed inset-y-0 right-0 z-40 w-[480px] max-w-[92vw] overflow-hidden border-l border-edge bg-card animate-slide-in-right"
          style={{ boxShadow: 'var(--float-shadow)' }}
        >
          <TaskPeek key={detail.id} task={detail} onClose={() => setDetail(null)} onChanged={refresh} />
        </div>
      )}
    </div>
  )
}
