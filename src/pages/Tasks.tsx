import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CalendarClock, CalendarDays, CheckCircle2, Columns3, Filter, Flag, Inbox, List, ListChecks, ListTodo, Plus, Trash2, X } from 'lucide-react'
import Skeleton, { SkeletonLine, SkeletonTasks } from '../components/ui/Skeleton'
import Chip from '../components/ui/Chip'
import DragHandle from '../components/ui/DragHandle'
import PageHeader from '../components/ui/PageHeader'
import Tabs from '../components/ui/Tabs'
import EmptyState from '../components/ui/EmptyState'
import TaskListRow from '../components/TaskListRow'
import TaskBoard from '../components/TaskBoard'
import TaskPeekDock from '../components/TaskPeekDock'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import { useSortable } from '../lib/useSortable'
import { useMultiSelect } from '../lib/useMultiSelect'
import { physKey } from '../lib/keyboard'
import { toast } from '../store/toastStore'
import { type Task, type TaskStatus } from '../types/models'
import { useTasks, createTask, updateTask, removeTask, reorderTasks, clearCompletedTasks } from '../data/tasks'
import { useI18n, t as tGlobal } from '../i18n'

type TaskFilter = 'all' | 'today' | 'scheduled' | 'flagged'
type View = 'list' | 'board'
type Tab = 'todo' | 'done'
type TFn = ReturnType<typeof useI18n>['t']


export default function Tasks() {
  const { t } = useI18n()
  const [searchParams, setSearchParams] = useSearchParams()
  const { data: tasks, reload: load, setData: setTasks } = useTasks()
  const [view, setView] = useState<View>(() => (localStorage.getItem('wist.tasksView') === 'board' ? 'board' : 'list'))
  const [tab, setTab] = useState<Tab>('todo')
  const [filter, setFilter] = useState<TaskFilter>('all')
  const [showFilters, setShowFilters] = useState(false)
  const [openTask, setOpenTask] = useState<Task | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [justDone, setJustDone] = useState<Set<number>>(() => new Set())
  const sel = useMultiSelect()
  const [bulkConfirm, setBulkConfirm] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // keep the open peek synced with fresh data
  useEffect(() => {
    if (openTask && tasks) {
      const fresh = tasks.find((x) => x.id === openTask.id)
      if (fresh && fresh !== openTask) setOpenTask(fresh)
    }
  }, [tasks]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (searchParams.get('focus') === '1') {
      setTab('todo')
      setTimeout(() => inputRef.current?.focus(), 0)
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams])

  const openIdParam = searchParams.get('open')
  useEffect(() => {
    if (!openIdParam || !tasks) return
    const task = tasks.find((x) => x.id === Number(openIdParam))
    if (task) { setOpenTask(task); setSearchParams({}, { replace: true }) }
  }, [openIdParam, tasks, setSearchParams])

  const setViewPersisted = (v: View) => {
    setView(v)
    try {
      localStorage.setItem('wist.tasksView', v)
    } catch {
      /* storage unavailable */
    }
  }
  const switchTab = (tb: Tab) => {
    if (tb !== 'todo') setJustDone(new Set())
    setTab(tb)
  }

  const toggle = async (task: Task) => {
    const completing = !task.done
    setJustDone((prev) => {
      const next = new Set(prev)
      if (completing) next.add(task.id)
      else next.delete(task.id)
      return next
    })
    await updateTask(task.id, { done: completing ? 1 : 0 })
    load()
  }
  const remove = async (task: Task) => {
    if (openTask?.id === task.id) setOpenTask(null)
    await removeTask(task.id)
    load()
  }
  const move = async (id: number, status: TaskStatus) => {
    const task = (tasks ?? []).find((x) => x.id === id)
    if (!task || task.status === status) return
    setTasks((prev) => (prev ?? []).map((x) => (x.id === id ? { ...x, status, done: status === 'done' ? 1 : 0 } : x)))
    await updateTask(id, { status })
    load()
  }
  const addTo = async (text: string, status: TaskStatus) => {
    const v = text.trim()
    if (!v) return
    await createTask({ title: v, status })
    load()
  }
  const quickAdd = async () => {
    const v = newTitle.trim()
    if (!v) return
    setNewTitle('')
    await createTask({ title: v, status: 'todo' })
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

  const todayMid = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d.getTime()
  }, [])
  const dleft = useCallback((due: string) => Math.round((new Date(`${due.slice(0, 10)}T00:00:00`).getTime() - todayMid) / 86_400_000), [todayMid])
  const counts = useMemo(
    () => ({
      all: open.length,
      today: open.filter((x) => x.due_date && dleft(x.due_date) <= 0).length,
      scheduled: open.filter((x) => !!x.due_date).length,
      flagged: open.filter((x) => x.priority === 'high').length,
    }),
    [open, dleft]
  )
  const todoRows = useMemo(() => {
    const base = (tasks ?? []).filter((x) => !x.done || justDone.has(x.id))
    if (filter === 'today') return base.filter((x) => x.due_date && dleft(x.due_date) <= 0)
    if (filter === 'scheduled') return [...base.filter((x) => !!x.due_date)].sort((a, b) => (a.due_date! < b.due_date! ? -1 : 1))
    if (filter === 'flagged') return base.filter((x) => x.priority === 'high')
    return base
  }, [tasks, filter, dleft, justDone])

  // drag-to-reorder (shared pointer-drag system — live ghost + insertion line), only
  // coherent on the full, unfiltered todo list where row positions map 1:1 to the DB.
  const canReorder = tab === 'todo' && filter === 'all'
  const reorder = useCallback((ids: number[]) => {
    reorderTasks(ids).then(load).catch((e) => console.error('task reorder failed', e))
  }, [load])
  const { onHandleDown, draggingId, overIndex } = useSortable(todoRows.map((r) => r.id), reorder)

  // ─── multi-select (list view): Ctrl/Cmd+A all · Del/Backspace delete · Esc clear ──
  const doBulkDelete = async () => {
    const ids = [...sel.selectedIds]
    setBulkConfirm(false)
    if (!ids.length) return
    if (openTask && sel.selectedIds.has(openTask.id)) setOpenTask(null)
    try {
      await Promise.all(ids.map((id) => removeTask(id)))
      sel.clear()
      toast(tGlobal('tasks.deletedN', { n: ids.length }))
      load()
    } catch (e) {
      console.error('bulk task delete failed', e)
    }
  }
  useEffect(() => {
    if (view !== 'list') return
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      const typing = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
      if (typing) return
      const ids = (tab === 'todo' ? todoRows : done).map((r) => r.id)
      if ((e.ctrlKey || e.metaKey) && physKey(e) === 'a') {
        if (ids.length) { e.preventDefault(); sel.selectAll(ids) }
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && sel.count > 0) {
        e.preventDefault()
        setBulkConfirm(true)
      } else if (e.key === 'Escape' && sel.count > 0) {
        sel.clear()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [view, tab, todoRows, done, sel])

  if (!tasks)
    return (
      <div className="mx-auto max-w-2xl px-8 py-8">
        <div className="mb-7 flex items-center gap-3">
          <Skeleton w={40} h={40} radius="10px" />
          <SkeletonLine w={160} />
        </div>
        <SkeletonTasks rows={6} />
      </div>
    )

  const rows = tab === 'todo' ? todoRows : done

  const viewToggle = (
    <div className="flex items-center gap-0.5 rounded-lg border border-edge bg-surface p-0.5">
      {(
        [
          ['list', List, t('tasks.viewList')],
          ['board', Columns3, t('tasks.viewBoard')],
        ] as const
      ).map(([v, Icon, label]) => (
        <button
          key={v}
          onClick={() => setViewPersisted(v)}
          className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[13px] font-medium transition-colors ${
            view === v ? 'bg-raised text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <Icon size={14} /> {label}
        </button>
      ))}
    </div>
  )

  return (
    <div className="flex h-full">
      <div className="min-w-0 flex-1 overflow-y-auto">
        <div className={`mx-auto px-8 py-8 ${view === 'list' ? 'max-w-2xl' : 'max-w-[1100px]'}`}>
          {/* shared Notion page header (neutral icon tile + 1.7rem title), view toggle on the right */}
          <PageHeader icon={ListChecks} title={t('nav.tasks')} actions={viewToggle} />

          {view === 'list' ? (
            <>
              <div className="mb-1.5 flex items-center justify-between gap-3 border-b border-edge">
                <Tabs
                  tabs={[
                    { id: 'todo', icon: ListTodo, label: t('tasks.tabTodo'), count: counts.all },
                    { id: 'done', icon: CheckCircle2, label: t('tasks.tabDone'), count: done.length },
                  ]}
                  active={tab}
                  onChange={(id) => switchTab(id as Tab)}
                />
                <button
                  onClick={() => setShowFilters((v) => !v)}
                  title={t('tasks.filterSort')}
                  className={`mb-1.5 grid h-8 w-8 place-items-center rounded-lg transition-colors ${
                    showFilters ? 'bg-highlight text-zinc-100' : 'text-zinc-500 hover:bg-highlight hover:text-zinc-200'
                  }`}
                >
                  <Filter size={15} />
                </button>
              </div>

              {showFilters && tab === 'todo' && (
                <div className="py-2.5">
                  <FilterTabs filter={filter} setFilter={setFilter} counts={counts} t={t} />
                </div>
              )}

              {sel.count > 0 && (
                <div className="mt-1.5 flex items-center gap-2 rounded-lg border border-edge bg-raised px-2.5 py-1.5 text-[12.5px]">
                  <span className="font-medium text-zinc-200">{t('notes.selectedN', { n: sel.count })}</span>
                  <button
                    onClick={() => setBulkConfirm(true)}
                    className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-danger transition-colors hover:bg-highlight"
                  >
                    <Trash2 size={13} /> {t('common.delete')}
                  </button>
                  <button
                    onClick={sel.clear}
                    title={t('notes.clearSelection')}
                    className="rounded p-0.5 text-zinc-500 transition-colors hover:bg-highlight hover:text-zinc-200"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}

              {rows.length === 0 ? (
                tab === 'todo' ? (
                  <EmptyState
                    icon={ListTodo}
                    title={t('home.noTasksTitle')}
                    subtitle={t('home.noTasksSub')}
                  />
                ) : (
                  <p className="py-14 text-center text-[13px] text-zinc-500">{t('tasks.noneDone')}</p>
                )
              ) : (
                <div className="mt-1.5" data-sortable-container>
                  {rows.map((task, i) => (
                    <Fragment key={task.id}>
                      {canReorder && overIndex === i && <div className="insert-line" />}
                      <TaskListRow
                        task={task}
                        selected={openTask?.id === task.id}
                        multiSelected={sel.isSelected(task.id)}
                        onToggle={toggle}
                        onOpen={setOpenTask}
                        onRowClick={(e) => { if (!sel.onItemClick(e, task.id, rows.map((r) => r.id))) setOpenTask(task) }}
                        onRemove={remove}
                        t={t}
                        dragging={draggingId === task.id}
                        handle={canReorder ? <DragHandle title={t('fav.reorder')} className="-ml-1" onMouseDown={(e) => onHandleDown(e, task.id)} /> : undefined}
                      />
                    </Fragment>
                  ))}
                  {canReorder && overIndex === rows.length && <div className="insert-line" />}
                </div>
              )}

              {tab === 'todo' ? (
                <div className="mt-0.5 flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-zinc-500">
                  <Plus size={15} className="shrink-0" />
                  <input
                    ref={inputRef}
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && quickAdd()}
                    placeholder={t('tasks.newTask')}
                    className="flex-1 bg-transparent text-[13.5px] text-zinc-200 outline-none placeholder:text-zinc-500"
                  />
                </div>
              ) : (
                done.length > 0 && (
                  <button
                    onClick={async () => { await clearCompletedTasks(); load() }}
                    className="mt-1 flex items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] text-zinc-500 transition-colors hover:text-danger"
                  >
                    <Trash2 size={14} /> {t('tasks.clearDone')}
                  </button>
                )
              )}
            </>
          ) : (
            <TaskBoard grouped={grouped} t={t} onMove={move} onAdd={addTo} onRemove={remove} onToggle={toggle} onOpen={setOpenTask} />
          )}
        </div>
      </div>

      {openTask && <TaskPeekDock task={openTask} onClose={() => setOpenTask(null)} onChanged={load} />}

      {bulkConfirm && (
        <ConfirmDialog
          title={t('tasks.bulkDeleteTitle')}
          message={t('tasks.bulkDeleteMessage', { n: sel.count })}
          confirmLabel={t('common.delete')}
          danger
          onConfirm={doBulkDelete}
          onCancel={() => setBulkConfirm(false)}
        />
      )}
    </div>
  )
}

/* ---------------- smart filter tabs, shown behind the funnel ---------------- */
function FilterTabs({
  filter,
  setFilter,
  counts,
  t,
}: {
  filter: TaskFilter
  setFilter: (f: TaskFilter) => void
  counts: Record<TaskFilter, number>
  t: TFn
}) {
  const tabs: Array<{ id: TaskFilter; label: string; icon: typeof Inbox }> = [
    { id: 'all', label: t('tasks.filter.all'), icon: Inbox },
    { id: 'today', label: t('tasks.filter.today'), icon: CalendarClock },
    { id: 'scheduled', label: t('tasks.filter.scheduled'), icon: CalendarDays },
    { id: 'flagged', label: t('tasks.filter.flagged'), icon: Flag },
  ]
  return (
    <div className="flex flex-wrap gap-2">
      {tabs.map(({ id, label, icon: Icon }) => {
        const on = filter === id
        return (
          <Chip key={id} active={on} onClick={() => setFilter(id)}>
            <Icon size={14} /> {label}
            {counts[id] > 0 && <span className={`text-[11px] ${on ? 'text-[#fff]/75' : 'text-zinc-500'}`}>{counts[id]}</span>}
          </Chip>
        )
      })}
    </div>
  )
}
