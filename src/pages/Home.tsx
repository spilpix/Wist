import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Bookmark,
  CalendarDays,
  Check,
  Clock,
  Flame,
  FolderKanban,
  Library as LibraryIcon,
  ListTodo,
  PenLine,
  Play,
  Plus,
  Sparkles,
  Tv,
} from 'lucide-react'
import Heatmap from '../components/Heatmap'
import CoverImage from '../components/CoverImage'
import TitleCard from '../components/TitleCard'
import EmptyState from '../components/ui/EmptyState'
import Spinner from '../components/ui/Spinner'
import type { ContinueItem, HeatmapDay, JournalEntry, Note, Project, StatsSummary, Task, Title } from '../types/models'
import { PROJECT_STATUS_COLORS } from '../types/models'
import { daysUntil } from './Projects'
import { formatDurationHuman, formatHours, formatRelative, formatTimestamp } from '../utils/formatters'
import { useI18n, DATE_LOCALE, type TKey } from '../i18n'

const MOODS = ['😞', '😐', '🙂', '😄', '🤩']

function todayKey(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// spirit level thresholds mirror the world page: level k needs 3·k² memories
function spiritLevel(n: number): number {
  let level = 1
  while (level < 6 && n >= 3 * (level + 1) ** 2) level++
  return level
}

function greetingKey(): TKey {
  const h = new Date().getHours()
  if (h < 5) return 'home.night'
  if (h < 12) return 'home.morning'
  if (h < 18) return 'home.afternoon'
  if (h < 23) return 'home.evening'
  return 'home.night'
}

/** Wide hero card for the most recent in-progress episode. */
function HeroCard({ item }: { item: ContinueItem }) {
  const navigate = useNavigate()
  const { t } = useI18n()
  const duration = item.duration_seconds ?? 0
  const progress = duration > 0 ? Math.min(1, item.watch_position_seconds / duration) : 0
  const remaining = duration > 0 ? duration - item.watch_position_seconds : null

  return (
    <button
      onClick={() => navigate(`/player/${item.id}`)}
      className="force-dark group relative block h-52 w-full overflow-hidden rounded-2xl text-left"
    >
      <CoverImage
        coverPath={item.cover_path}
        title={item.title_name}
        type={item.title_type}
        className="absolute inset-0 h-full w-full transition-transform duration-300 group-hover:scale-[1.02]"
        iconSize={56}
      />
      <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/50 to-black/15" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />

      <div className="absolute inset-0 flex max-w-2xl flex-col justify-end p-6">
        <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-accent-bright">
          {t('home.continueWatching')}
        </span>
        <h2 className="mt-1 truncate text-2xl font-bold text-white">{item.title_name}</h2>
        <p className="mt-0.5 text-sm text-zinc-300">
          {t('home.episodeN', { n: item.episode_number })}
          {remaining != null && <span className="text-zinc-400"> · {t('home.timeLeft', { time: formatTimestamp(remaining) })}</span>}
        </p>
        <div className="mt-3 h-1 w-full max-w-md overflow-hidden rounded-full bg-white/15">
          <div className="h-full rounded-full bg-accent" style={{ width: `${progress * 100}%` }} />
        </div>
      </div>

      <span className="absolute right-6 top-1/2 flex h-14 w-14 -translate-y-1/2 items-center justify-center rounded-full bg-accent opacity-0 shadow-none transition-all duration-200 group-hover:opacity-100">
        <Play size={22} className="ml-1 fill-[#fff] text-[#fff]" />
      </span>
    </button>
  )
}

function ContinueCard({ item }: { item: ContinueItem }) {
  const navigate = useNavigate()
  const { t } = useI18n()
  const duration = item.duration_seconds ?? 0
  const progress = duration > 0 ? Math.min(1, item.watch_position_seconds / duration) : 0
  const remaining = duration > 0 ? duration - item.watch_position_seconds : null

  return (
    <button
      onClick={() => navigate(`/player/${item.id}`)}
      className="group w-60 shrink-0 overflow-hidden rounded-xl bg-surface text-left transition-transform duration-150 hover:-translate-y-0.5"
    >
      <div className="relative h-32 overflow-hidden bg-raised">
        <CoverImage
          coverPath={item.cover_path}
          title={item.title_name}
          type={item.title_type}
          className="h-full w-full transition-transform duration-200 group-hover:scale-[1.03]"
          iconSize={28}
        />
        <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-opacity group-hover:bg-black/40 group-hover:opacity-100">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent">
            <Play size={18} className="ml-0.5 fill-[#fff] text-[#fff]" />
          </span>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/60">
          <div className="h-full bg-accent" style={{ width: `${progress * 100}%` }} />
        </div>
      </div>
      <div className="px-3.5 py-3">
        <div className="truncate text-[13px] font-medium text-zinc-200">{item.title_name}</div>
        <div className="mt-0.5 flex items-center justify-between text-xs text-zinc-500">
          <span>{t('home.episodeN', { n: item.episode_number })}</span>
          {remaining != null && <span>{t('home.timeLeft', { time: formatTimestamp(remaining) })}</span>}
        </div>
      </div>
    </button>
  )
}

function StatTile({ icon: Icon, value, label, sub }: { icon: typeof Tv; value: string; label: string; sub?: string }) {
  return (
    <div className="card flex items-center gap-4 px-5 py-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent-bright">
        <Icon size={18} />
      </span>
      <div className="min-w-0">
        <div className="text-xl font-semibold text-white">{value}</div>
        <div className="truncate text-xs text-zinc-500">
          {label}
          {sub && <span className="text-zinc-600"> · {sub}</span>}
        </div>
      </div>
    </div>
  )
}

export default function Home() {
  const { t, tn, lang } = useI18n()
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()
  const [continueItems, setContinueItems] = useState<ContinueItem[]>([])
  const [recent, setRecent] = useState<Title[]>([])
  const [summary, setSummary] = useState<StatsSummary | null>(null)
  const [heat, setHeat] = useState<HeatmapDay[]>([])
  const [openTasks, setOpenTasks] = useState<Task[]>([])
  const [recentNotes, setRecentNotes] = useState<Note[]>([])
  const [todayEntry, setTodayEntry] = useState<JournalEntry | null>(null)
  const [streak, setStreak] = useState(0)
  const [spiritXp, setSpiritXp] = useState(0)
  const [activeProjects, setActiveProjects] = useState<Project[]>([])

  const loadTasks = useCallback(() => window.wist.tasks.list({ done: false }).then(setOpenTasks), [])

  useEffect(() => {
    Promise.all([
      window.wist.episodes.continueWatching(),
      window.wist.stats.recentlyAdded(),
      window.wist.stats.summary(),
      window.wist.stats.heatmap(),
      window.wist.tasks.list({ done: false }),
      window.wist.notes.list({}),
      window.wist.journal.get(todayKey()),
      window.wist.journal.streak(),
      window.wist.stats.memories(),
      window.wist.projects.list(),
    ])
      .then(([cw, rec, sum, hm, tasks, notes, entry, st, mem, projects]) => {
        setContinueItems(cw)
        setRecent(rec)
        setSummary(sum)
        setHeat(hm)
        setOpenTasks(tasks)
        setRecentNotes(notes.slice(0, 3))
        setTodayEntry(entry)
        setStreak(st)
        setSpiritXp(mem.length)
        setActiveProjects(projects.filter((p) => p.status === 'active' || p.status === 'review'))
      })
      .finally(() => setLoading(false))
    // agents can add tasks while the app is open
    return window.wist.events.onDataChanged((kind) => {
      if (kind === 'tasks') loadTasks()
    })
  }, [loadTasks])

  const toggleTask = async (task: Task) => {
    await window.wist.tasks.update(task.id, { done: 1 })
    loadTasks()
  }

  const quickMood = async (value: number) => {
    await window.wist.journal.upsert(todayKey(), { mood: value })
    navigate('/journal')
  }

  if (loading) return <Spinner label={t('home.loading')} />

  const empty = !continueItems.length && !recent.length
  const [heroItem, ...restItems] = continueItems
  const dateStr = new Date().toLocaleDateString(DATE_LOCALE[lang], {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  return (
    <div className="page">
      <div className="mx-auto max-w-5xl space-y-9">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">{t(greetingKey())}</h1>
          <p className="mt-1 text-sm capitalize text-zinc-500">{dateStr}</p>
        </div>
        <Link
          to="/tree"
          className="flex items-center gap-2 rounded-xl border border-edge/70 bg-surface px-3 py-2 text-sm text-accent-bright transition-colors hover:border-edge hover:bg-raised"
        >
          <Sparkles size={15} />
          <span className="font-semibold">{t('home.spiritLevel', { n: spiritLevel(spiritXp) })}</span>
          <span className="text-xs text-zinc-500">· {spiritXp}</span>
        </Link>
      </header>

      {/* quick actions */}
      <div className="-mt-4 flex flex-wrap gap-2">
        {[
          { icon: FolderKanban, label: t('cmdk.newProject'), to: '/projects?new=1' },
          { icon: Plus, label: t('cmdk.addTitle'), to: '/library?add=1' },
          { icon: ListTodo, label: t('cmdk.newTask'), to: '/tasks?focus=1' },
          { icon: PenLine, label: t('cmdk.newNote'), to: '/notes?new=1' },
        ].map(({ icon: Icon, label, to }) => (
          <button
            key={to}
            onClick={() => navigate(to)}
            className="flex items-center gap-2 rounded-xl border border-edge/60 bg-surface px-3.5 py-2 text-sm font-medium text-zinc-300 shadow-sm transition-all hover:-translate-y-0.5 hover:border-edge hover:text-white"
          >
            <Icon size={15} className="text-accent-bright" /> {label}
          </button>
        ))}
      </div>

      {/* today — the assistant strip */}
      <section>
        <h2 className="section-title">{t('home.today')}</h2>
        <div className="grid grid-cols-3 gap-4">
          {/* journal */}
          <div role="button" tabIndex={0} onClick={() => navigate('/journal')} className="card flex cursor-pointer flex-col px-5 py-4 text-left transition-transform hover:-translate-y-0.5">
            <div className="mb-2 flex items-center justify-between">
              <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                <CalendarDays size={13} className="text-[#f472b6]" /> {t('nav.journal')}
              </span>
              {streak > 0 && (
                <span className="flex items-center gap-1 text-xs text-zinc-500">
                  <Flame size={12} className="text-amber-500" /> {streak}
                </span>
              )}
            </div>
            {todayEntry?.content ? (
              <>
                <div className="text-sm text-zinc-300">
                  {todayEntry.mood ? `${MOODS[todayEntry.mood - 1]} ` : ''}
                  {t('home.journalDone')}
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-zinc-500">{todayEntry.content}</p>
              </>
            ) : (
              <>
                <div className="text-sm text-zinc-300">{t('journal.placeholder')}</div>
                <div className="mt-2 flex gap-1" onClick={(e) => e.stopPropagation()}>
                  {MOODS.map((emoji, i) => (
                    <button
                      key={i}
                      onClick={() => quickMood(i + 1)}
                      className="rounded-lg px-1 py-0.5 text-lg opacity-60 grayscale transition-all hover:scale-125 hover:opacity-100 hover:grayscale-0"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* tasks */}
          <div className="card flex flex-col px-5 py-4">
            <button onClick={() => navigate('/tasks')} className="mb-2 flex items-center justify-between text-left">
              <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-500 hover:text-zinc-300">
                <ListTodo size={13} className="text-[#ffd27d]" /> {t('nav.tasks')}
              </span>
              {openTasks.length > 0 && <span className="text-xs text-zinc-500">{openTasks.length}</span>}
            </button>
            {openTasks.length === 0 ? (
              <div className="text-sm text-zinc-500">{t('home.tasksEmpty')}</div>
            ) : (
              <div className="space-y-1.5">
                {openTasks.slice(0, 3).map((task) => (
                  <div key={task.id} className="flex items-center gap-2">
                    <button
                      onClick={() => toggleTask(task)}
                      className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-edge text-transparent transition-colors hover:border-accent hover:text-accent"
                    >
                      <Check size={10} />
                    </button>
                    <span className="min-w-0 truncate text-sm text-zinc-300">{task.title}</span>
                  </div>
                ))}
                {openTasks.length > 3 && (
                  <button onClick={() => navigate('/tasks')} className="text-xs text-zinc-600 hover:text-zinc-400">
                    {t('home.moreTasks', { n: openTasks.length - 3 })}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* notes */}
          <div className="card flex flex-col px-5 py-4">
            <button onClick={() => navigate('/notes')} className="mb-2 flex items-center justify-between text-left">
              <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-500 hover:text-zinc-300">
                <PenLine size={13} className="text-[#60a5fa]" /> {t('nav.notes')}
              </span>
            </button>
            {recentNotes.length === 0 ? (
              <button onClick={() => navigate('/notes?new=1')} className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300">
                <Plus size={14} /> {t('cmdk.newNote')}
              </button>
            ) : (
              <div className="space-y-1.5">
                {recentNotes.map((n) => (
                  <button key={n.id} onClick={() => navigate(`/notes?open=${n.id}`)} className="block w-full truncate text-left text-sm text-zinc-300 hover:text-white">
                    {n.title || n.content.slice(0, 40)}
                    <span className="ml-2 text-[11px] text-zinc-600">{formatRelative(n.updated_at)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {heroItem && <HeroCard item={heroItem} />}

      {activeProjects.length > 0 && (
        <section>
          <h2 className="section-title">{t('home.activeProjects')}</h2>
          <div className="no-scrollbar flex gap-4 overflow-x-auto pb-1">
            {activeProjects.map((p) => {
              const accent = p.color || PROJECT_STATUS_COLORS[p.status]
              const left = p.deadline ? daysUntil(p.deadline) : null
              const dueColor = left === null ? 'text-zinc-500' : left < 0 ? 'text-red-400' : left <= 3 ? 'text-amber-400' : 'text-zinc-500'
              return (
                <button
                  key={p.id}
                  onClick={() => navigate(`/project/${p.id}`)}
                  className="group w-56 shrink-0 overflow-hidden rounded-xl border border-edge/60 bg-surface text-left transition-colors hover:border-edge"
                >
                  <div className="h-1.5 w-full" style={{ backgroundColor: accent }} />
                  <div className="p-3.5">
                    <div className="mb-1 flex items-center gap-2">
                      <FolderKanban size={14} className="shrink-0 text-accent-bright" />
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-zinc-100">{p.name}</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-zinc-500">
                      <span className="truncate">{p.client || t(`project.status.${p.status}` as 'project.status.active')}</span>
                      {p.deadline && <span className={`shrink-0 ${dueColor}`}>{p.deadline}</span>}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </section>
      )}

      {empty && (
        <EmptyState
          icon={LibraryIcon}
          title={t('home.emptyTitle')}
          subtitle={t('home.emptySubtitle')}
          action={
            <div className="flex gap-2">
              <Link to="/library" className="btn-accent">{t('home.openLibrary')}</Link>
              <Link to="/local" className="btn-ghost">{t('home.importFiles')}</Link>
            </div>
          }
        />
      )}

      {restItems.length > 0 && (
        <section>
          <h2 className="section-title">{t('home.continueWatching')}</h2>
          <div className="no-scrollbar flex gap-4 overflow-x-auto pb-1">
            {restItems.map((item) => (
              <ContinueCard key={item.id} item={item} />
            ))}
          </div>
        </section>
      )}

      {recent.length > 0 && (
        <section>
          <h2 className="section-title">{t('home.recentlyAdded')}</h2>
          <div className="no-scrollbar flex gap-4 overflow-x-auto pb-1">
            {recent.map((t) => (
              <div key={t.id} className="w-36 shrink-0">
                <TitleCard title={t} />
              </div>
            ))}
          </div>
        </section>
      )}

      {summary && (
        <section>
          <h2 className="section-title">{t('home.myStats')}</h2>
          <div className="grid grid-cols-4 gap-4">
            <StatTile icon={Tv} value={String(summary.episodesWatched)} label={t('home.episodesWatched')} />
            <StatTile
              icon={Clock}
              value={t('home.hoursValue', { n: formatHours(summary.secondsWatched) })}
              label={t('home.hoursSpent')}
              sub={t('home.equalsDays', { n: (summary.secondsWatched / 86400).toFixed(1) })}
            />
            <StatTile icon={Bookmark} value={String(summary.moments)} label={t('home.savedMoments')} />
            <StatTile
              icon={Flame}
              value={tn('count.days', summary.currentStreak)}
              label={t('home.currentStreak')}
              sub={summary.longestStreak ? t('home.best', { n: summary.longestStreak }) : undefined}
            />
          </div>
        </section>
      )}

      {!empty && (
        <section>
          <h2 className="section-title">{t('home.activity')}</h2>
          <div className="card px-5 py-4">
            <Heatmap data={heat} />
          </div>
        </section>
      )}

      {summary && summary.secondsWatched > 0 && (
        <div className="pb-2 text-center text-xs text-zinc-700">
          {t('home.wellSpent', { duration: formatDurationHuman(summary.secondsWatched) })}
        </div>
      )}
      </div>
    </div>
  )
}
