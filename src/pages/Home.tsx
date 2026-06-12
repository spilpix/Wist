import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Bookmark, Clock, Flame, Library as LibraryIcon, Play, Tv } from 'lucide-react'
import Heatmap from '../components/Heatmap'
import CoverImage from '../components/CoverImage'
import TitleCard from '../components/TitleCard'
import EmptyState from '../components/ui/EmptyState'
import Spinner from '../components/ui/Spinner'
import type { ContinueItem, HeatmapDay, StatsSummary, Title } from '../types/models'
import { formatDurationHuman, formatHours, formatTimestamp } from '../utils/formatters'
import { useI18n, DATE_LOCALE, type TKey } from '../i18n'

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
  const [continueItems, setContinueItems] = useState<ContinueItem[]>([])
  const [recent, setRecent] = useState<Title[]>([])
  const [summary, setSummary] = useState<StatsSummary | null>(null)
  const [heat, setHeat] = useState<HeatmapDay[]>([])

  useEffect(() => {
    Promise.all([
      window.wist.episodes.continueWatching(),
      window.wist.stats.recentlyAdded(),
      window.wist.stats.summary(),
      window.wist.stats.heatmap(),
    ])
      .then(([cw, rec, sum, hm]) => {
        setContinueItems(cw)
        setRecent(rec)
        setSummary(sum)
        setHeat(hm)
      })
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <Spinner label={t('home.loading')} />

  const empty = !continueItems.length && !recent.length
  const [heroItem, ...restItems] = continueItems
  const dateStr = new Date().toLocaleDateString(DATE_LOCALE[lang], {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  return (
    <div className="page space-y-10">
      <header className="relative">
        <div className="pointer-events-none absolute -top-28 left-1/4 h-64 w-[460px] rounded-full bg-accent/10 blur-3xl" />
        <h1 className="relative text-3xl font-bold tracking-tight text-white">{t(greetingKey())}</h1>
        <p className="relative mt-1 text-sm capitalize text-zinc-500">{dateStr}</p>
      </header>

      {heroItem && <HeroCard item={heroItem} />}

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
  )
}
