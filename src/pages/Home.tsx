import { type RefObject, useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Plus, Tv } from 'lucide-react'
import TaskPeekDock from '../components/TaskPeekDock'
import CoverImage from '../components/CoverImage'
import Heatmap from '../components/Heatmap'
import EmptyState from '../components/ui/EmptyState'
import { SkeletonTasks, SkeletonTiles } from '../components/ui/Skeleton'
import type { ContinueItem, HeatmapDay, Note, StatsSummary, Task } from '../types/models'
import { DATE_LOCALE, useI18n, t as tGlobal, type TKey } from '../i18n'
import { toast } from '../store/toastStore'
import { useSettingsStore } from '../store/settingsStore'
import { formatHours, formatRelative } from '../utils/formatters'

function greetingKey(): TKey {
  const h = new Date().getHours()
  if (h < 5) return 'home.night'
  if (h < 12) return 'home.morning'
  if (h < 18) return 'home.afternoon'
  if (h < 23) return 'home.evening'
  return 'home.night'
}

type ViewTab = 'today' | 'media' | 'stats'

/** Stat widget — label · big number · sub-line (design-system §Главный экран). */
function Widget({ label, value, sub, up }: { label: string; value: string; sub: string; up?: boolean }) {
  return (
    <div className="card p-4">
      <div className="text-[12px] font-medium text-zinc-500">{label}</div>
      <div className="mt-0.5 text-[28px] font-bold leading-none tracking-tight text-white">{value}</div>
      <div className={`mt-1.5 text-[12px] font-medium ${up ? 'text-[color:var(--c-green-text)]' : 'text-zinc-500'}`}>{sub}</div>
    </div>
  )
}

/** Uppercase column header — "ЗАДАЧИ  4". */
function ColHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="mb-2.5 flex items-center justify-between px-0.5 text-[11.5px] font-semibold uppercase tracking-wider text-zinc-500">
      <span>{label}</span>
      <span className="text-zinc-600">{count}</span>
    </div>
  )
}

/** Dashed inline-add row — "+ Новая задача / заметка". */
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
  const [stats, setStats] = useState<StatsSummary | null>(null)
  const [cont, setCont] = useState<ContinueItem[] | null>(null)
  const [heat, setHeat] = useState<HeatmapDay[] | null>(null)
  const [tab, setTab] = useState<ViewTab>('today')
  const [openTask, setOpenTask] = useState<Task | null>(null)
  const [newTask, setNewTask] = useState('')
  const [newNote, setNewNote] = useState('')
  // a task checked just now lingers (struck) in the list until reload/tab-switch
  const [justDone, setJustDone] = useState<Set<number>>(() => new Set())
  const taskInput = useRef<HTMLInputElement>(null)

  const loadTasks = useCallback(
    () => window.wist.tasks.list().then((x: Task[]) => setTasks(x)).catch((e) => { console.error('home tasks load failed', e); toast(tGlobal('home.loadError')); setTasks([]) }),
    [],
  )
  const loadNotes = useCallback(
    () => window.wist.notes.list().then((x: Note[]) => setNotes(x)).catch((e) => { console.error('home notes load failed', e); setNotes([]) }),
    [],
  )
  const loadStats = useCallback(
    () => window.wist.stats.summary().then((x: StatsSummary) => setStats(x)).catch((e) => { console.error('home stats load failed', e); setStats(null) }),
    [],
  )

  useEffect(() => {
    loadTasks()
    loadNotes()
    loadStats()
    return window.wist.events.onDataChanged((kind) => {
      if (kind === 'tasks') loadTasks()
      if (kind === 'notes') loadNotes()
    })
  }, [loadTasks, loadNotes, loadStats])

  // lazy-load media / activity the first time their tab opens
  useEffect(() => {
    if (tab === 'media' && cont === null)
      window.wist.episodes.continueWatching().then((c: ContinueItem[]) => setCont(c)).catch(() => setCont([]))
    if (tab === 'stats' && heat === null)
      window.wist.stats.heatmap().then((h: HeatmapDay[]) => setHeat(h)).catch(() => setHeat([]))
  }, [tab, cont, heat])

  // keep the open peek synced with fresh data
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
    await window.wist.tasks.update(task.id, { done: completing ? 1 : 0 })
    loadTasks()
  }
  const addTask = async () => {
    const v = newTask.trim()
    if (!v) return
    setNewTask('')
    await window.wist.tasks.create({ title: v, status: 'todo' })
    loadTasks()
  }
  const addNote = async () => {
    const v = newNote.trim()
    if (!v) return
    setNewNote('')
    await window.wist.notes.create({ title: v, content: '' })
    loadNotes()
  }

  const allTasks = tasks ?? []
  const allNotes = notes ?? []
  const open = allTasks.filter((x) => !x.done)
  const done = allTasks.filter((x) => x.done)
  // a calm dashboard: each list scrolls inside a fixed-height box so neither column
  // runs away (one long column beside a short one is what left the awkward void) — but
  // every item stays reachable by scrolling, no "show all" detour. Totals are in the header.
  const todoTasks = allTasks.filter((x) => !x.done || justDone.has(x.id))
  const visTasks = todoTasks
  const sortedNotes = [...allNotes].sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || '') || b.id - a.id)
  const recentNotes = sortedNotes

  const readyPct = allTasks.length ? Math.round((done.length / allTasks.length) * 100) : 0
  const focusH = stats ? formatHours(stats.secondsWatched) : '0'
  const widgets = [
    { label: t('home.wTasks'), value: String(done.length), sub: t('home.wTasksSub', { n: open.length }) },
    { label: t('home.wFocus'), value: `${focusH}${lang === 'ru' ? 'ч' : 'h'}`, sub: t('home.wFocusSub') },
    { label: t('home.wStreak'), value: `${stats?.currentStreak ?? 0} 🔥`, sub: t('home.wStreakSub') },
    { label: t('home.wReady'), value: `${readyPct}%`, sub: t('home.wReadySub'), up: readyPct >= 50 },
  ]

  const dateRaw = new Date().toLocaleDateString(DATE_LOCALE[lang], { weekday: 'long', day: 'numeric', month: 'long' })
  // capitalize only the weekday — NOT every word (the old `capitalize` class
  // turned "1 задач, 25 заметок" into "1 Задач, 25 Заметок")
  const dateStr = dateRaw.charAt(0).toUpperCase() + dateRaw.slice(1)
  const subtitle = `${dateStr} · ${t('home.countTasks', { n: open.length })}, ${t('home.countNotes', { n: allNotes.length })}`

  const tabs: Array<[ViewTab, string]> = [
    ['today', t('home.today')],
    ['media', t('home.tabMedia')],
    ['stats', t('home.tabStats')],
  ]

  return (
    <div className="flex h-full">
      <div className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl px-10 py-9">
          {/* greeting + date · task / note counts */}
          <header className="mb-5">
            <h1 className="text-[2rem] font-bold leading-tight tracking-tight text-white">
              {profileName ? `${t(greetingKey())}, ${profileName}` : t(greetingKey())}
            </h1>
            <p className="mt-1.5 text-[13px] text-zinc-500">{subtitle}</p>
          </header>

          {/* view tabs */}
          <div className="mb-6 flex items-center gap-5 border-b border-edge">
            {tabs.map(([id, label]) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`-mb-px border-b-2 pb-2.5 pt-1 text-[14px] font-medium transition-colors ${
                  tab === id ? 'border-white text-white' : 'border-transparent text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* ---------- СЕГОДНЯ ---------- */}
          {tab === 'today' && (
            <div className="grid grid-cols-1 items-start gap-5 md:grid-cols-2">
              {/* left — tasks + stat widgets; the widgets fill the column so a short
                  task list still balances the (usually longer) notes column */}
              <div className="space-y-5">
                <section>
                  <ColHeader label={t('home.colTasks')} count={open.length} />
                  {tasks === null ? (
                    <SkeletonTasks rows={3} />
                  ) : (
                    <div className="space-y-2">
                      <div className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
                      {visTasks.map((task) => {
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

                {/* stat widgets — 2×2 inside the left column */}
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
                    {recentNotes.map((n) => (
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
                    {recentNotes.length === 0 && <p className="px-1 pt-1 text-[12.5px] text-zinc-500">{t('home.notesEmpty')}</p>}
                  </div>
                )}
              </section>
            </div>
          )}

          {/* ---------- МЕДИА ---------- */}
          {tab === 'media' && (
            cont === null ? (
              <SkeletonTiles count={6} />
            ) : cont.length === 0 ? (
              <EmptyState icon={Tv} title={t('cont.emptyTitle')} subtitle={t('cont.emptySubtitle')} />
            ) : (
              <>
                <div className="mb-3 text-[11.5px] font-semibold uppercase tracking-wider text-zinc-500">{t('home.continueWatching')}</div>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                  {cont.map((item) => {
                    const dur = item.duration_seconds ?? 0
                    const progress = dur > 0 ? Math.min(1, item.watch_position_seconds / dur) : 0
                    return (
                      <button key={item.id} onClick={() => navigate(`/player/${item.id}`)} className="group flex flex-col gap-2 text-left">
                        <div className="relative aspect-video overflow-hidden rounded-xl border border-edge">
                          <CoverImage coverPath={item.cover_path} title={item.title_name} type={item.title_type} className="h-full w-full" iconSize={22} />
                          <div className="absolute inset-x-0 bottom-0 h-1 bg-black/40">
                            <div className="h-full bg-accent" style={{ width: `${progress * 100}%` }} />
                          </div>
                        </div>
                        <div className="truncate text-[13px] font-medium text-zinc-200">{item.title_name}</div>
                        <div className="truncate text-[12px] text-zinc-500">{t('home.episodeN', { n: item.episode_number })}</div>
                      </button>
                    )
                  })}
                </div>
              </>
            )
          )}

          {/* ---------- СТАТИСТИКА ---------- */}
          {tab === 'stats' && (
            <>
              <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
                {widgets.map((w) => (
                  <Widget key={w.label} label={w.label} value={w.value} sub={w.sub} up={w.up} />
                ))}
              </div>
              <div className="card mt-6 p-5">
                <div className="mb-3 text-[11.5px] font-semibold uppercase tracking-wider text-zinc-500">{t('home.activity')}</div>
                {heat === null ? <div className="skel h-24 rounded-md" /> : <Heatmap data={heat} />}
              </div>
            </>
          )}
        </div>
      </div>

      {openTask && <TaskPeekDock task={openTask} onClose={() => setOpenTask(null)} onChanged={loadTasks} />}
    </div>
  )
}
