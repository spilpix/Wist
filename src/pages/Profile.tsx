import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BarChart3, Bookmark, Camera, ChevronRight, Clock, Flame, Heart, History as HistoryIcon, Pencil, Settings, Sparkles, Trash2, Tv, X } from 'lucide-react'
import Spinner from '../components/ui/Spinner'
import Avatar from '../components/ui/Avatar'
import type { StatsSummary } from '../types/models'
import { useSettingsStore } from '../store/settingsStore'
import { formatHours } from '../utils/formatters'
import { useI18n, type TKey } from '../i18n'

// spirit level thresholds mirror Home / the world page: level k needs 3·k² memories
function spiritLevel(n: number): number {
  let level = 1
  while (level < 6 && n >= 3 * (level + 1) ** 2) level++
  return level
}

type TFn = ReturnType<typeof useI18n>['t']

function StatTile({ icon: Icon, value, label, sub }: { icon: typeof Tv; value: string; label: string; sub?: string }) {
  return (
    <div className="card flex items-center gap-3 px-4 py-4">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-raised text-zinc-400">
        <Icon size={19} />
      </span>
      <div className="min-w-0">
        <div className="text-xl font-bold text-zinc-100">{value}</div>
        <div className="truncate text-xs text-zinc-500">
          {label}
          {sub && <span className="text-zinc-600"> · {sub}</span>}
        </div>
      </div>
    </div>
  )
}

function QuickLink({ to, icon: Icon, label, t }: { to: string; icon: typeof Tv; label: string; t: TFn }) {
  return (
    <Link to={to} className="tile group flex items-center gap-3 px-4 py-4 text-sm font-medium text-zinc-200">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-raised text-zinc-400 transition-colors group-hover:text-zinc-100">
        <Icon size={17} />
      </span>
      {label}
      <ChevronRight size={16} className="ml-auto text-zinc-600 transition-transform group-hover:translate-x-0.5 group-hover:text-zinc-400" />
    </Link>
  )
}

export default function Profile() {
  const { t, tn } = useI18n()
  const settings = useSettingsStore((s) => s.settings)
  const updateSettings = useSettingsStore((s) => s.update)
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState<StatsSummary | null>(null)
  const [xp, setXp] = useState(0)
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')

  const name = settings?.profileName?.trim() ?? ''
  const avatar = settings?.profileAvatar || ''
  const displayName = name || 'Bard'

  const startEditName = () => { setNameDraft(name); setEditingName(true) }
  const saveName = () => { void updateSettings({ profileName: nameDraft.trim() }); setEditingName(false) }
  const changeAvatar = async () => {
    const src = await window.wist.files.pickImage()
    if (!src) return
    const saved = await window.wist.files.saveCoverFromPath(src)
    await updateSettings({ profileAvatar: saved })
  }
  const removeAvatar = () => void updateSettings({ profileAvatar: '' })

  useEffect(() => {
    Promise.all([window.wist.stats.summary(), window.wist.stats.memories()])
      .then(([sum, mem]) => {
        setSummary(sum)
        setXp(mem.length)
      })
      .catch((e) => console.error('profile load failed', e))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <Spinner label={t('home.loading')} />

  const level = spiritLevel(xp)
  const maxed = level >= 6
  const nextAt = 3 * (level + 1) ** 2
  const progress = maxed ? 1 : Math.min(1, xp / nextAt)

  const links: Array<{ to: string; icon: typeof Tv; key: TKey }> = [
    { to: '/stats', icon: BarChart3, key: 'nav.statistics' },
    { to: '/history', icon: HistoryIcon, key: 'nav.history' },
    { to: '/favorites', icon: Heart, key: 'nav.favorites' },
    { to: '/trash', icon: Trash2, key: 'nav.trash' },
  ]

  return (
    <div className="page">
      <div className="mx-auto max-w-3xl space-y-8">
        {/* hero */}
        <header className="card overflow-hidden">
          <div className="h-24 bg-raised" />
          <div className="flex flex-wrap items-end gap-4 px-6 pb-5">
            <div className="group relative -mt-10 shrink-0">
              <button onClick={changeAvatar} title={t('profile.changeAvatar')} className="relative block rounded-full">
                <Avatar name={displayName} src={avatar} size={80} className="ring-4 ring-card" />
                <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45 opacity-0 transition-opacity group-hover:opacity-100">
                  <Camera size={20} className="text-[#fff]" />
                </span>
              </button>
              {avatar && (
                <button
                  onClick={removeAvatar}
                  title={t('profile.removeAvatar')}
                  className="absolute -right-0.5 -top-0.5 flex h-6 w-6 items-center justify-center rounded-full border border-edge bg-card text-zinc-400 shadow-[var(--card-shadow)] transition-colors hover:text-danger"
                >
                  <X size={13} />
                </button>
              )}
            </div>
            <div className="min-w-0 flex-1 pb-0.5">
              {editingName ? (
                <input
                  autoFocus
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  onBlur={saveName}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setEditingName(false) }}
                  placeholder={t('profile.namePlaceholder')}
                  maxLength={40}
                  className="input max-w-xs !text-xl !font-bold"
                />
              ) : (
                <button onClick={startEditName} title={t('profile.editName')} className="group/name inline-flex items-center gap-2">
                  <h1 className="text-2xl font-bold tracking-tight text-zinc-100">{displayName}</h1>
                  <Pencil size={14} className="text-zinc-500 opacity-0 transition-opacity group-hover/name:opacity-100" />
                </button>
              )}
              <p className="mt-0.5 text-sm text-zinc-500">{t('profile.subtitle')}</p>
            </div>
            <Link to="/settings" className="btn-ghost mb-0.5">
              <Settings size={15} /> {t('nav.settings')}
            </Link>
          </div>

          {/* spirit level progress */}
          <Link to="/tree" className="mx-4 mb-4 block rounded-xl border border-edge bg-surface px-4 py-3 transition-colors hover:bg-raised">
            <div className="flex items-center gap-2">
              <Sparkles size={15} className="text-zinc-400" />
              <span className="text-sm font-semibold text-zinc-200">{t('home.spiritLevel', { n: level })}</span>
              <span className="ml-auto text-xs tabular-nums text-zinc-500">{maxed ? `${xp}` : `${xp} / ${nextAt}`}</span>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-edge">
              <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${progress * 100}%` }} />
            </div>
          </Link>
        </header>

        {/* stats */}
        {summary && (
          <section>
            <h2 className="section-title">{t('home.myStats')}</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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

        {/* quick links */}
        <section>
          <h2 className="section-title">{t('profile.quickLinks')}</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {links.map((l) => (
              <QuickLink key={l.to} to={l.to} icon={l.icon} label={t(l.key)} t={t} />
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
