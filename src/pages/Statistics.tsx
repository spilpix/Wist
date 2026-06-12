import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { BarChart3, CalendarDays, Clock, Flame, Library as LibraryIcon, Star, Tv } from 'lucide-react'
import Heatmap from '../components/Heatmap'
import TitleCard from '../components/TitleCard'
import EmptyState from '../components/ui/EmptyState'
import Spinner from '../components/ui/Spinner'
import CoverImage from '../components/CoverImage'
import type {
  HeatmapDay,
  MonthBar,
  StatsSummary,
  Title,
  TypeSlice,
} from '../types/models'
import { formatHours } from '../utils/formatters'
import { useI18n, MONTHS_SHORT } from '../i18n'
import { useSettingsStore } from '../store/settingsStore'

const CHART_TOOLTIP_STYLE = {
  background: 'rgb(var(--raised))',
  border: '1px solid rgb(var(--edge))',
  borderRadius: 8,
  fontSize: 12,
}
const CHART_ITEM_STYLE = { color: 'rgb(var(--ink-200))' }
const CHART_TICK = { fill: '#8a8a96', fontSize: 11 } // neutral mid-gray, readable on both themes

const PIE_COLORS = ['#a888f0', '#4ade80', '#60a5fa', '#facc15', '#f87171']

function OverviewCard({ icon: Icon, value, label }: { icon: typeof Tv; value: string; label: string }) {
  return (
    <div className="card flex items-center gap-4 px-5 py-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent-bright">
        <Icon size={18} />
      </span>
      <div>
        <div className="text-xl font-semibold text-white">{value}</div>
        <div className="text-xs text-zinc-500">{label}</div>
      </div>
    </div>
  )
}

export default function Statistics() {
  const { t, lang } = useI18n()
  const accent = useSettingsStore((s) => s.settings?.accentColor) ?? '#7c5cbf'
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState<StatsSummary | null>(null)
  const [types, setTypes] = useState<TypeSlice[]>([])
  const [months, setMonths] = useState<MonthBar[]>([])
  const [top, setTop] = useState<Title[]>([])
  const [heat, setHeat] = useState<HeatmapDay[]>([])
  const [favorites, setFavorites] = useState<Title[]>([])
  const navigate = useNavigate()

  useEffect(() => {
    Promise.all([
      window.wist.stats.summary(),
      window.wist.stats.byType(),
      window.wist.stats.monthly(),
      window.wist.stats.topRated(),
      window.wist.stats.heatmap(),
      window.wist.titles.list({ minRating: 9, sort: 'rating', sortDir: 'desc' }),
    ])
      .then(([sum, ty, mo, tp, hm, fav]) => {
        setSummary(sum)
        setTypes(ty.filter((t) => t.count > 0))
        setMonths(mo)
        setTop(tp)
        setHeat(hm)
        setFavorites(fav.slice(0, 5))
      })
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <Spinner label={t('stats.loading')} />
  if (!summary || summary.titles === 0) {
    return (
      <div className="page">
        <h1 className="page-title">{t('nav.statistics')}</h1>
        <EmptyState
          icon={BarChart3}
          title={t('stats.emptyTitle')}
          subtitle={t('stats.emptySubtitle')}
        />
      </div>
    )
  }

  const monthData = months.map((m) => ({
    name: `${MONTHS_SHORT[lang][parseInt(m.month.slice(5), 10) - 1]}`,
    hours: +(m.seconds / 3600).toFixed(1),
  }))
  const typeData = types.map((ty) => ({ name: t(`type.${ty.type}`), value: ty.count }))

  return (
    <div className="page space-y-10">
      <h1 className="page-title !mb-0">{t('nav.statistics')}</h1>

      <div className="grid grid-cols-4 gap-4">
        <OverviewCard icon={LibraryIcon} value={String(summary.titles)} label={t('stats.titlesInLibrary')} />
        <OverviewCard icon={Tv} value={String(summary.episodesWatched)} label={t('stats.episodesWatched')} />
        <OverviewCard icon={Clock} value={t('home.hoursValue', { n: formatHours(summary.secondsWatched) })} label={t('stats.hoursWatched')} />
        <OverviewCard icon={CalendarDays} value={String(summary.daysWithActivity)} label={t('stats.daysWithActivity')} />
      </div>

      <div className="grid grid-cols-2 gap-6">
        <section className="card p-5">
          <h2 className="section-title">{t('stats.byType')}</h2>
          {typeData.length ? (
            <div className="flex items-center">
              <ResponsiveContainer width="55%" height={200}>
                <PieChart>
                  <Pie data={typeData} dataKey="value" innerRadius={48} outerRadius={80} paddingAngle={3} stroke="none">
                    {typeData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} itemStyle={CHART_ITEM_STYLE} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2">
                {typeData.map((ty, i) => {
                  const pct = Math.round((ty.value / summary.titles) * 100)
                  return (
                    <div key={ty.name} className="flex items-center gap-2 text-sm">
                      <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                      <span className="text-zinc-300">{ty.name}</span>
                      <span className="text-zinc-600">{pct}%</span>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="py-10 text-center text-sm text-zinc-600">{t('stats.noTitles')}</div>
          )}
        </section>

        <section className="card p-5">
          <h2 className="section-title">{t('stats.byMonth')}</h2>
          {monthData.length ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={monthData}>
                <XAxis dataKey="name" tick={CHART_TICK} axisLine={false} tickLine={false} />
                <YAxis tick={CHART_TICK} axisLine={false} tickLine={false} width={32} />
                <Tooltip
                  cursor={{ fill: 'rgba(138,138,150,0.08)' }}
                  contentStyle={CHART_TOOLTIP_STYLE}
                  itemStyle={CHART_ITEM_STYLE}
                  formatter={(v: number) => [t('stats.hoursShort', { n: v }), t('stats.watchedTooltip')]}
                />
                <Bar dataKey="hours" fill={accent} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="py-10 text-center text-sm text-zinc-600">{t('stats.noSessions')}</div>
          )}
        </section>
      </div>

      <section className="card p-5">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="section-title !mb-0">{t('stats.activityYear')}</h2>
          <div className="flex items-center gap-4 text-sm">
            <span className="flex items-center gap-1.5 text-zinc-400">
              <Flame size={15} className="text-amber-500" />
              {t('stats.current')} <span className="font-semibold text-white">{summary.currentStreak}</span>
            </span>
            <span className="text-zinc-400">
              {t('stats.longest')} <span className="font-semibold text-white">{summary.longestStreak}</span>
            </span>
          </div>
        </div>
        <Heatmap data={heat} />
      </section>

      {top.length > 0 && (
        <section>
          <h2 className="section-title">{t('stats.topRated')}</h2>
          <div className="card divide-y divide-edge/50">
            {top.map((title, i) => (
              <button
                key={title.id}
                onClick={() => navigate(`/title/${title.id}`)}
                className="flex w-full items-center gap-4 px-4 py-2.5 text-left transition-colors hover:bg-raised"
              >
                <span className="w-6 text-center text-sm font-semibold text-zinc-600">{i + 1}</span>
                <CoverImage coverPath={title.cover_path} title={title.title} type={title.type} className="h-12 w-9 rounded" iconSize={14} />
                <span className="min-w-0 flex-1 truncate text-sm text-zinc-200">{title.title}</span>
                <span className="text-xs uppercase tracking-wide text-zinc-600">{t(`type.${title.type}`)}</span>
                <span className="flex items-center gap-1 text-sm font-semibold text-amber-500">
                  <Star size={13} className="fill-amber-500" /> {title.rating}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {favorites.length > 0 && (
        <section>
          <h2 className="section-title">{t('stats.favorites')}</h2>
          <div className="grid grid-cols-5 gap-5">
            {favorites.map((title) => (
              <TitleCard key={title.id} title={title} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
