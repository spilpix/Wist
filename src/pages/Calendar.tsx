import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { CheckSquare, ChevronLeft, ChevronRight, FileText, Square } from 'lucide-react'
import { DATE_LOCALE, useI18n } from '../i18n'
import PlainEditor from '../components/notes/PlainEditor'
import { useTabTitle } from '../store/tabStore'
import { listTasks } from '../data/tasks'
import { listNotes } from '../data/notes'
import { getJournal, rangeJournal, saveJournal } from '../data/journal'
import {
  addDays,
  addMonths,
  isoDay,
  isoWeek,
  isToday,
  monthGrid,
  parseDay,
  sameDay,
  startOfMonth,
  today,
  weekDays,
} from '../lib/dates'
import type { JournalEntry, Note, Task } from '../types/models'

type TFn = ReturnType<typeof useI18n>['t']

type View = 'month' | 'week' | 'day'
const VIEWS: View[] = ['month', 'week', 'day']

// ─── daily note (owns its textarea + debounced autosave) ──────────────────────
// Keyed by `day` in the parent, so switching days remounts it with a fresh initial
// value. Only writes when the text actually changed → navigating past empty days
// never creates blank journal rows.
function DailyNote({ day, initial, placeholder, savingLabel, savedLabel, t, noteTitles, onOpenLink }: {
  day: string
  initial: string
  placeholder: string
  savingLabel: string
  savedLabel: string
  t: TFn
  noteTitles: { id: number; title: string }[]
  onOpenLink: (title: string) => void
}) {
  const [text, setText] = useState(initial)
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latest = useRef(initial)
  const dirty = useRef(false)
  latest.current = text

  const flush = () => {
    if (!dirty.current) return
    dirty.current = false
    setState('saving')
    saveJournal(day, { content: latest.current })
      .then(() => setState('saved'))
      .catch(() => setState('idle'))
  }

  const onChange = (v: string) => {
    setText(v)
    dirty.current = v !== initial
    setState('idle')
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(flush, 700)
  }

  // flush a pending edit when leaving the day / unmounting
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
      flush()
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  return (
    <div className="card p-4">
      <PlainEditor
        noteKey={day}
        value={text}
        onChange={onChange}
        placeholder={placeholder}
        t={t}
        noteTitles={noteTitles}
        onOpenLink={onOpenLink}
        minHeight="180px"
      />
      <div className="mt-1 h-4 text-right text-[11px] text-zinc-600">
        {state === 'saving' ? savingLabel : state === 'saved' ? savedLabel : ''}
      </div>
    </div>
  )
}

export default function Calendar() {
  const { t, lang } = useI18n()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()

  const view: View = VIEWS.includes(params.get('v') as View) ? (params.get('v') as View) : 'month'
  const anchor = parseDay(params.get('d'))
  const anchorIso = isoDay(anchor)

  const setQuery = (v: View, d: Date) => {
    const n = new URLSearchParams()
    n.set('v', v)
    n.set('d', isoDay(d))
    setParams(n, { replace: true })
  }

  // ─── data ───────────────────────────────────────────────────────────────────
  const [tasks, setTasks] = useState<Task[]>([])
  const [notes, setNotes] = useState<Note[]>([])
  const [journal, setJournal] = useState<Record<string, JournalEntry>>({})
  const [dayContent, setDayContent] = useState<string | null>(null) // null = loading

  useEffect(() => {
    const load = () => {
      listTasks().then(setTasks).catch(() => setTasks([]))
      listNotes({}).then(setNotes).catch(() => setNotes([]))
    }
    load()
    return window.wist.events.onDataChanged((kind) => {
      if (kind === 'tasks') listTasks().then(setTasks).catch(() => undefined)
      if (kind === 'notes') listNotes({}).then(setNotes).catch(() => undefined)
    })
  }, [])

  // visible date range → load journal entries for the dot indicators
  const rangeDays = useMemo(() => {
    if (view === 'month') return monthGrid(anchor)
    if (view === 'week') return weekDays(anchor)
    return [anchor]
  }, [view, anchorIso]) // eslint-disable-line react-hooks/exhaustive-deps

  const reloadJournal = () => {
    const from = isoDay(rangeDays[0])
    const to = isoDay(rangeDays[rangeDays.length - 1])
    rangeJournal(from, to)
      .then((entries) => setJournal(Object.fromEntries(entries.map((e) => [e.day, e]))))
      .catch(() => setJournal({}))
  }
  useEffect(() => {
    reloadJournal()
    return window.wist.events.onDataChanged((kind) => {
      if (kind === 'journal') reloadJournal()
    })
  }, [view, anchorIso]) // eslint-disable-line react-hooks/exhaustive-deps

  // day view: load the editable note for the focused day
  useEffect(() => {
    if (view !== 'day') return
    setDayContent(null)
    getJournal(anchorIso)
      .then((e) => setDayContent(e?.content ?? ''))
      .catch(() => setDayContent(''))
  }, [view, anchorIso])

  // ─── per-day lookups for references / dots ────────────────────────────────────
  const tasksByDay = useMemo(() => {
    const m: Record<string, Task[]> = {}
    for (const tk of tasks) {
      if (tk.deleted_at || !tk.due_date) continue
      const d = tk.due_date.slice(0, 10)
      ;(m[d] ??= []).push(tk)
    }
    return m
  }, [tasks])

  const notesByDay = useMemo(() => {
    const m: Record<string, Note[]> = {}
    for (const n of notes) {
      const created = n.created_at?.slice(0, 10)
      const updated = n.updated_at?.slice(0, 10)
      if (created) (m[created] ??= []).push(n)
      if (updated && updated !== created) (m[updated] ??= []).push(n)
    }
    return m
  }, [notes])

  // ─── formatting ───────────────────────────────────────────────────────────────
  const locale = DATE_LOCALE[lang]
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
  const fmt = (d: Date, opts: Intl.DateTimeFormatOptions) => d.toLocaleDateString(locale, opts)

  // Monday-first short weekday headers (1 Jan 2024 is a Monday)
  const weekdayHeads = useMemo(
    () => Array.from({ length: 7 }, (_, i) => cap(fmt(new Date(2024, 0, 1 + i), { weekday: 'short' }))),
    [locale]
  )

  // header label + tab title (the tab "picks up the date", Capacities-style)
  const periodLabel = useMemo(() => {
    if (view === 'day') return cap(fmt(anchor, { day: 'numeric', month: 'long', year: 'numeric' }))
    if (view === 'week') {
      const wd = weekDays(anchor)
      const a = wd[0]
      const b = wd[6]
      return a.getMonth() === b.getMonth()
        ? `${a.getDate()}–${cap(fmt(b, { day: 'numeric', month: 'long' }))}`
        : `${cap(fmt(a, { day: 'numeric', month: 'short' }))} – ${cap(fmt(b, { day: 'numeric', month: 'short' }))}`
    }
    return cap(fmt(anchor, { month: 'long', year: 'numeric' }))
  }, [view, anchorIso]) // eslint-disable-line react-hooks/exhaustive-deps
  useTabTitle(periodLabel)

  // ─── navigation ───────────────────────────────────────────────────────────────
  const step = (dir: -1 | 1) => {
    if (view === 'day') setQuery(view, addDays(anchor, dir))
    else if (view === 'week') setQuery(view, addDays(anchor, dir * 7))
    else setQuery(view, addMonths(anchor, dir))
  }
  const openDay = (d: Date) => setQuery('day', d)

  // ─── small renderers ──────────────────────────────────────────────────────────
  const DayBadges = ({ iso }: { iso: string }) => {
    const hasNote = !!journal[iso]
    const taskN = tasksByDay[iso]?.length ?? 0
    if (!hasNote && !taskN) return null
    return (
      <div className="mt-auto flex items-center gap-1 pt-1">
        {hasNote && <span className="h-1.5 w-1.5 rounded-full bg-accent" title={t('calendar.dailyNote')} />}
        {taskN > 0 && <span className="text-[10px] font-medium text-zinc-500">{taskN}</span>}
      </div>
    )
  }

  // ─── views ────────────────────────────────────────────────────────────────────
  const monthView = (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid grid-cols-7 border-b border-edge">
        {weekdayHeads.map((w) => (
          <div key={w} className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-600">
            {w}
          </div>
        ))}
      </div>
      <div className="grid flex-1 grid-cols-7 grid-rows-6">
        {monthGrid(anchor).map((d) => {
          const iso = isoDay(d)
          const inMonth = d.getMonth() === anchor.getMonth()
          const todayCell = isToday(d)
          return (
            <button
              key={iso}
              onClick={() => openDay(d)}
              className={`flex flex-col items-start border-b border-r border-edge p-1.5 text-left transition-colors hover:bg-highlight ${
                inMonth ? '' : 'opacity-40'
              }`}
            >
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-[12px] ${
                  todayCell ? 'bg-accent font-semibold text-white' : 'text-zinc-300'
                }`}
              >
                {d.getDate()}
              </span>
              <DayBadges iso={iso} />
            </button>
          )
        })}
      </div>
    </div>
  )

  const weekView = (
    <div className="grid flex-1 grid-cols-7 gap-2 overflow-y-auto p-3">
      {weekDays(anchor).map((d) => {
        const iso = isoDay(d)
        const dayTasks = tasksByDay[iso] ?? []
        const hasNote = !!journal[iso]
        return (
          <div key={iso} className="flex min-h-0 flex-col rounded-xl border border-edge bg-card">
            <button
              onClick={() => openDay(d)}
              className={`flex items-center justify-between rounded-t-xl border-b border-edge px-2.5 py-2 text-left transition-colors hover:bg-highlight ${
                isToday(d) ? 'text-accent-bright' : 'text-zinc-300'
              }`}
            >
              <span className="text-[12px] font-semibold uppercase tracking-wide">{cap(fmt(d, { weekday: 'short' }))}</span>
              <span className="text-[15px] font-bold">{d.getDate()}</span>
            </button>
            <div className="flex-1 space-y-1 overflow-y-auto p-1.5">
              {hasNote && (
                <button
                  onClick={() => openDay(d)}
                  className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-[11px] text-accent-bright transition-colors hover:bg-highlight"
                >
                  <FileText size={11} className="shrink-0" /> {t('calendar.dailyNote')}
                </button>
              )}
              {dayTasks.map((tk) => (
                <button
                  key={tk.id}
                  onClick={() => navigate(`/tasks?open=${tk.id}`)}
                  className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-[11.5px] text-zinc-300 transition-colors hover:bg-highlight"
                >
                  {tk.done ? <CheckSquare size={11} className="shrink-0 text-zinc-500" /> : <Square size={11} className="shrink-0 text-zinc-500" />}
                  <span className="min-w-0 flex-1 truncate">{tk.title}</span>
                </button>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )

  const dayTasks = tasksByDay[anchorIso] ?? []
  const dayNotes = notesByDay[anchorIso] ?? []
  const dayView = (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-[760px] px-8 py-8">
        <header className="mb-6">
          <div className="text-[13px] font-medium text-accent-bright">{cap(fmt(anchor, { weekday: 'long' }))}</div>
          <div className="flex items-baseline gap-3">
            <h1 className="text-[2rem] font-bold leading-tight tracking-tight text-white">
              {cap(fmt(anchor, { day: 'numeric', month: 'long', year: 'numeric' }))}
            </h1>
            <span className="text-[13px] text-zinc-600">{t('calendar.weekN', { n: isoWeek(anchor) })}</span>
          </div>
        </header>

        <section className="mb-7">
          <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-zinc-500">{t('calendar.dailyNote')}</h2>
          {dayContent === null ? (
            <div className="card h-[232px] animate-pulse p-4" />
          ) : (
            <DailyNote
              key={anchorIso}
              day={anchorIso}
              initial={dayContent}
              placeholder={t('calendar.dailyNotePh')}
              savingLabel={t('notes.saving')}
              savedLabel={t('notes.savedNow')}
              t={t}
              noteTitles={notes.filter((n) => n.title?.trim()).map((n) => ({ id: n.id, title: n.title }))}
              onOpenLink={(title) => {
                const n = notes.find((x) => (x.title || '').trim().toLowerCase() === title.trim().toLowerCase())
                if (n) navigate(`/notes?open=${n.id}`)
              }}
            />
          )}
        </section>

        <section>
          <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-zinc-500">{t('calendar.references')}</h2>
          {dayTasks.length === 0 && dayNotes.length === 0 ? (
            <p className="px-1 text-[13px] text-zinc-600">{t('calendar.noReferences')}</p>
          ) : (
            <div className="space-y-1.5">
              {dayTasks.map((tk) => (
                <button
                  key={`t${tk.id}`}
                  onClick={() => navigate(`/tasks?open=${tk.id}`)}
                  className="flex w-full items-center gap-2.5 rounded-lg border border-edge bg-card px-3 py-2 text-left text-[13px] shadow-[var(--card-shadow)] transition-colors hover:border-zinc-700"
                >
                  {tk.done ? <CheckSquare size={14} className="shrink-0 text-zinc-500" /> : <Square size={14} className="shrink-0 text-zinc-500" />}
                  <span className={`min-w-0 flex-1 truncate ${tk.done ? 'text-zinc-500 line-through' : 'text-zinc-100'}`}>{tk.title}</span>
                  <span className="shrink-0 text-[11px] uppercase tracking-wide text-zinc-600">{t('calendar.refTask')}</span>
                </button>
              ))}
              {dayNotes.map((n) => (
                <button
                  key={`n${n.id}`}
                  onClick={() => navigate(`/notes?open=${n.id}`)}
                  className="flex w-full items-center gap-2.5 rounded-lg border border-edge bg-card px-3 py-2 text-left text-[13px] shadow-[var(--card-shadow)] transition-colors hover:border-zinc-700"
                >
                  <FileText size={14} className="shrink-0 text-zinc-500" />
                  <span className="min-w-0 flex-1 truncate text-zinc-100">{n.title || n.content.slice(0, 40) || t('notes.untitled')}</span>
                  <span className="shrink-0 text-[11px] uppercase tracking-wide text-zinc-600">{t('calendar.refNote')}</span>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )

  // ─── shell ────────────────────────────────────────────────────────────────────
  const toolBtn = 'app-no-drag flex h-7 w-7 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-highlight hover:text-zinc-200'
  return (
    <div className="flex h-full flex-col">
      {/* toolbar: view toggle · prev / today / next · period label */}
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-edge px-3">
        <div className="flex items-center gap-0.5 rounded-lg border border-edge bg-field p-0.5">
          {VIEWS.map((v) => (
            <button
              key={v}
              onClick={() => setQuery(v, anchor)}
              className={`rounded-md px-2.5 py-1 text-[12.5px] font-medium transition-colors ${
                view === v ? 'bg-card text-zinc-100 shadow-[var(--card-shadow)]' : 'text-zinc-500 hover:text-zinc-200'
              }`}
            >
              {t(`calendar.${v}` as 'calendar.month')}
            </button>
          ))}
        </div>

        <div className="ml-2 flex items-center gap-0.5">
          <button onClick={() => step(-1)} className={toolBtn} title={t('app.back')}>
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={() => setQuery(view, today())}
            className="app-no-drag rounded-lg px-2.5 py-1 text-[12.5px] font-medium text-zinc-300 transition-colors hover:bg-highlight"
          >
            {t('calendar.today')}
          </button>
          <button onClick={() => step(1)} className={toolBtn} title={t('app.forward')}>
            <ChevronRight size={16} />
          </button>
        </div>

        <div className="ml-1 min-w-0 truncate text-[14px] font-semibold text-zinc-200">{periodLabel}</div>
      </div>

      {view === 'month' ? monthView : view === 'week' ? weekView : dayView}
    </div>
  )
}
