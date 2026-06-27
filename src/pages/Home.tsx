import { type RefObject, useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Plus } from 'lucide-react'
import TaskPeekDock from '../components/TaskPeekDock'
import TypeBadge from '../components/TypeBadge'
import { SkeletonTasks } from '../components/ui/Skeleton'
import type { Note, Task } from '../types/models'
import { DATE_LOCALE, useI18n, t as tGlobal, type TKey } from '../i18n'
import { toast } from '../store/toastStore'
import { useSettingsStore } from '../store/settingsStore'
import { formatRelative } from '../utils/formatters'
import { listTasks, createTask, updateTask } from '../data/tasks'
import { listNotes, createNote } from '../data/notes'

function greetingKey(): TKey {
  const h = new Date().getHours()
  if (h < 5) return 'home.night'
  if (h < 12) return 'home.morning'
  if (h < 18) return 'home.afternoon'
  if (h < 23) return 'home.evening'
  return 'home.night'
}

function Widget({ label, value, sub, up }: { label: string; value: string; sub: string; up?: boolean }) {
  return (
    <div className="card p-4">
      <div className="text-[12px] font-medium text-zinc-500">{label}</div>
      <div className="mt-0.5 text-[28px] font-bold leading-none tracking-tight text-white">{value}</div>
      <div className={`mt-1.5 text-[12px] font-medium ${up ? 'text-[color:var(--c-green-text)]' : 'text-zinc-500'}`}>{sub}</div>
    </div>
  )
}

function ColHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="mb-2.5 flex items-center justify-between px-0.5 text-[11.5px] font-semibold uppercase tracking-wider text-zinc-500">
      <span>{label}</span>
      <span className="text-zinc-600">{count}</span>
    </div>
  )
}

function InlineAdd({ value, onChange, onSubmit, placeholder, inputRef }: {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  placeholder: string
  inputRef?: RefObject<HTMLInputElement>
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-dashed border-edge px-3 py-2.5 text-zinc-500 transition-colors focus-within:border-zinc-600 hover:border-zinc-700">
      <Plus size={14} className="shrink-0" />
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
        placeholder={placeholder}
        className="w-full bg-transparent text-[13px] text-zinc-200 outline-none placeholder:text-zinc-500"
      />
    </div>
  )
}

export default function Home() {
  const { t, lang } = useI18n()
  const navigate = useNavigate()
  const profileName = useSettingsStore((s) => s.settings?.profileName)?.trim()
  const [tasks, setTasks] = useState<Task[] | null>(null)
  const [notes, setNotes] = useState<Note[] | null>(null)
  const [openTask, setOpenTask] = useState<Task | null>(null)
  const [newTask, setNewTask] = useState('')
  const [newNote, setNewNote] = useState('')
  const [justDone, setJustDone] = useState<Set<number>>(() => new Set())
  const taskInput = useRef<HTMLInputElement>(null)

  const loadTasks = useCallback(
    () => listTasks().then((x: Task[]) => setTasks(x)).catch((e) => { console.error('home tasks load failed', e); toast(tGlobal('home.loadError')); setTasks([]) }),
    [],
  )
  const loadNotes = useCallback(
    () => listNotes().then((x: Note[]) => setNotes(x)).catch((e) => { console.error('home notes load failed', e); setNotes([]) }),
    [],
  )

  useEffect(() => {
    loadTasks()
    loadNotes()
    return window.wist.events.onDataChanged((kind) => {
      if (kind === 'tasks') loadTasks()
      if (kind === 'notes') loadNotes()
    })
  }, [loadTasks, loadNotes])

  useEffect(() => {
    if (openTask && tasks) {
      const fresh = tasks.find((x) => x.id === openTask.id)
      if (fresh && fresh !== openTask) setOpenTask(fresh)
    }
  }, [tasks]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = async (task: Task) => {
    const completing = !task.done
    setJustDone((prev) => {
      const next = new Set(prev)
      if (completing) next.add(task.id)
      else next.delete(task.id)
      return next
    })
    await updateTask(task.id, { done: completing ? 1 : 0 })
    loadTasks()
  }
  const addTask = async () => {
    const v = newTask.trim()
    if (!v) return
    setNewTask('')
    await createTask({ title: v, status: 'todo' })
    loadTasks()
  }
  const addNote = async () => {
    const v = newNote.trim()
    if (!v) return
    setNewNote('')
    await createNote({ title: v, content: '' })
    loadNotes()
  }

  const allTasks = tasks ?? []
  const allNotes = notes ?? []
  const open = allTasks.filter((x) => !x.done)
  const done = allTasks.filter((x) => x.done)
  const todoTasks = allTasks.filter((x) => !x.done || justDone.has(x.id))
  const sortedNotes = [...allNotes].sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || '') || b.id - a.id)

  const readyPct = allTasks.length ? Math.round((done.length / allTasks.length) * 100) : 0
  const widgets = [
    { label: t('home.wTasks'), value: String(done.length), sub: t('home.wTasksSub', { n: open.length }) },
    { label: t('home.wReady'), value: `${readyPct}%`, sub: t('home.wReadySub'), up: readyPct >= 50 },
  ]

  const dateRaw = new Date().toLocaleDateString(DATE_LOCALE[lang], { weekday: 'long', day: 'numeric', month: 'long' })
  const dateStr = dateRaw.charAt(0).toUpperCase() + dateRaw.slice(1)
  const subtitle = `${dateStr} · ${t('home.countTasks', { n: open.length })}, ${t('home.countNotes', { n: allNotes.length })}`

  return (
    <div className="flex h-full">
      <div className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl px-10 py-9">
          <header className="mb-8">
            <h1 className="text-[2rem] font-bold leading-tight tracking-tight text-white">
              {profileName ? `${t(greetingKey())}, ${profileName}` : t(greetingKey())}
            </h1>
            <p className="mt-1.5 text-[13px] text-zinc-500">{subtitle}</p>
          </header>

          <div className="grid grid-cols-1 items-start gap-5 md:grid-cols-2">
            {/* left — tasks + stat widgets */}
            <div className="space-y-5">
              <section>
                <ColHeader label={t('home.colTasks')} count={open.length} />
                {tasks === null ? (
                  <SkeletonTasks rows={3} />
                ) : (
                  <div className="space-y-2">
                    <div className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
                      {todoTasks.map((task) => {
                        const isDone = !!task.done
                        return (
                          <div
                            key={task.id}
                            onClick={() => setOpenTask(task)}
                            className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-edge bg-card px-3 py-[11px] shadow-[var(--card-shadow)] transition-colors hover:border-zinc-700"
                          >
                            <button
                              onClick={(e) => { e.stopPropagation(); toggle(task) }}
                              className={`grid h-4 w-4 shrink-0 place-items-center rounded-[4px] border-[1.5px] transition-colors ${
                                isDone ? 'border-accent bg-accent text-white' : 'border-zinc-600 text-transparent hover:border-zinc-400'
                              }`}
                            >
                              <Check size={11} strokeWidth={3.5} />
                            </button>
                            <TypeBadge typeId={task.props?.type} size={13} />
                            <span className={`min-w-0 flex-1 truncate text-[13px] ${isDone ? 'text-zinc-500 line-through' : 'text-zinc-100'}`}>
                              {task.title}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                    <InlineAdd value={newTask} onChange={setNewTask} onSubmit={addTask} placeholder={t('tasks.newTask')} inputRef={taskInput} />
                  </div>
                )}
              </section>

              <div className="grid grid-cols-2 gap-3.5">
                {widgets.map((w) => (
                  <Widget key={w.label} label={w.label} value={w.value} sub={w.sub} up={w.up} />
                ))}
              </div>
            </div>

            {/* right — notes */}
            <section>
              <ColHeader label={t('home.colNotes')} count={allNotes.length} />
              {notes === null ? (
                <SkeletonTasks rows={4} />
              ) : (
                <div className="space-y-2">
                  <div className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
                    {sortedNotes.map((n) => (
                      <button
                        key={n.id}
                        onClick={() => navigate(`/notes?open=${n.id}`)}
                        className="flex w-full flex-col items-start gap-0.5 rounded-lg border border-edge bg-card px-3 py-[11px] text-left shadow-[var(--card-shadow)] transition-colors hover:border-zinc-700"
                      >
                        <b className="max-w-full truncate text-[13px] font-medium text-white">{n.title || '—'}</b>
                        <span className="text-[12px] text-zinc-500">{formatRelative(n.updated_at)}</span>
                      </button>
                    ))}
                  </div>
                  <InlineAdd value={newNote} onChange={setNewNote} onSubmit={addNote} placeholder={t('home.newNoteInline')} />
                  {sortedNotes.length === 0 && <p className="px-1 pt-1 text-[12.5px] text-zinc-500">{t('home.notesEmpty')}</p>}
                </div>
              )}
            </section>
          </div>
        </div>
      </div>

      {openTask && <TaskPeekDock task={openTask} onClose={() => setOpenTask(null)} onChanged={loadTasks} />}
    </div>
  )
}
