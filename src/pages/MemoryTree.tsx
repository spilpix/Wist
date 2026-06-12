import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Award, BookOpen, Bookmark, CalendarDays, ListTodo, PenLine, Sparkles, TreePine } from 'lucide-react'
import EmptyState from '../components/ui/EmptyState'
import Spinner from '../components/ui/Spinner'
import { createWorld, type WorldTip } from '../world/createWorld'
import type { MemoryEvent, MemoryKind } from '../types/models'
import { formatDate } from '../utils/formatters'
import { useI18n, MONTHS_SHORT, type TKey } from '../i18n'

const KIND_HEX: Record<MemoryKind, string> = {
  moment: '#a888f0',
  title: '#4ade80',
  book: '#f59e0b',
  note: '#60a5fa',
  journal: '#f472b6',
}

// spirit levels: memories needed for level k = 3·k²
const LEVEL_KEYS: TKey[] = ['tree.lvl1', 'tree.lvl2', 'tree.lvl3', 'tree.lvl4', 'tree.lvl5', 'tree.lvl6']
function levelFor(n: number): { level: number; nameKey: TKey; have: number; need: number } {
  let level = 1
  while (level < 6 && n >= 3 * (level + 1) ** 2) level++
  const base = level === 1 ? 0 : 3 * level ** 2
  const next = 3 * (level + 1) ** 2
  return { level, nameKey: LEVEL_KEYS[level - 1], have: n - base, need: next - base }
}

function achievements(events: MemoryEvent[]) {
  const by = (k: MemoryKind) => events.filter((e) => e.kind === k).length
  return [
    { key: 'tree.ach.first' as TKey, unlocked: events.length >= 1 },
    { key: 'tree.ach.ten' as TKey, unlocked: events.length >= 10 },
    { key: 'tree.ach.fifty' as TKey, unlocked: events.length >= 50 },
    { key: 'tree.ach.cinephile' as TKey, unlocked: by('title') >= 10 },
    { key: 'tree.ach.bookworm' as TKey, unlocked: by('book') >= 3 },
    { key: 'tree.ach.chronicler' as TKey, unlocked: by('note') + by('journal') >= 15 },
    { key: 'tree.ach.collector' as TKey, unlocked: by('moment') >= 25 },
  ]
}

interface WorldStats {
  titles: number
  notes: number
  openTasks: number
  doneTasks: number
  streak: number
  moments: number
}

export default function MemoryTree() {
  const { t, lang } = useI18n()
  const navigate = useNavigate()
  const containerRef = useRef<HTMLDivElement>(null)
  const hostRef = useRef<HTMLDivElement>(null)

  const [events, setEvents] = useState<MemoryEvent[] | null>(null)
  const [stats, setStats] = useState<WorldStats | null>(null)
  const [assets, setAssets] = useState<Record<string, string> | null>(null)
  const [tip, setTip] = useState<(WorldTip & { x: number; y: number }) | null>(null)
  const [worldError, setWorldError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      window.wist.stats.memories(),
      window.wist.titles.list({}),
      window.wist.notes.list({}),
      window.wist.tasks.list(),
      window.wist.journal.streak(),
      window.wist.files.worldAssets(),
    ]).then(([ev, titles, notes, tasks, streak, art]) => {
      setEvents(ev)
      setStats({
        titles: titles.length,
        notes: notes.length,
        openTasks: tasks.filter((x) => !x.done).length,
        doneTasks: tasks.filter((x) => x.done).length,
        streak,
        moments: ev.filter((x) => x.kind === 'moment').length,
      })
      setAssets(art)
    })
  }, [])

  const months = useMemo(() => {
    const out: Array<{ key: string; label: string }> = []
    const cursor = new Date()
    cursor.setDate(1)
    cursor.setMonth(cursor.getMonth() - 11)
    for (let i = 0; i < 12; i++) {
      const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`
      const name = MONTHS_SHORT[lang][cursor.getMonth()]
      out.push({ key, label: cursor.getMonth() === 0 ? `${name} ${cursor.getFullYear()}` : name })
      cursor.setMonth(cursor.getMonth() + 1)
    }
    return out
  }, [lang])

  // boot the WebGL world
  useEffect(() => {
    if (!events || !stats || !assets || !hostRef.current) return
    const host = hostRef.current
    let destroy: (() => void) | null = null
    let cancelled = false

    const artUrls: Record<string, string> = {}
    for (const key of ['sky', 'hillsFar', 'hillsNear', 'tree', 'foreground'] as const) {
      if (assets[key]) artUrls[key] = window.wist.media.fileUrl(assets[key])
    }

    createWorld(
      host,
      {
        events,
        months,
        stats,
        assets: artUrls,
        zoneLabels: {
          library: t('world.zone.library'),
          notes: t('world.zone.notes'),
          journal: t('world.zone.journal'),
          tasks: t('world.zone.tasks'),
          moments: t('world.zone.moments'),
          tasksSub: t('world.zone.openTasks', { n: stats.openTasks }),
          journalSub: t('world.zone.streak', { n: stats.streak }),
        },
        kindNames: {
          moment: t('tree.kind.moment'),
          title: t('tree.kind.title'),
          book: t('tree.kind.book'),
          note: t('tree.kind.note'),
          journal: t('tree.kind.journal'),
        },
        dateOf: formatDate,
      },
      {
        navigate,
        tip: (wt) => {
          if (!wt) {
            setTip(null)
            return
          }
          const rect = containerRef.current?.getBoundingClientRect()
          if (rect) setTip({ ...wt, x: wt.clientX - rect.left, y: wt.clientY - rect.top })
        },
      }
    )
      .then((d) => {
        if (cancelled) d()
        else destroy = d
      })
      .catch((err) => {
        console.error('WORLD_BOOT_ERR', err)
        setWorldError(String(err?.message ?? err))
      })

    return () => {
      cancelled = true
      destroy?.()
      host.innerHTML = ''
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, stats, assets, months])

  if (!events || !stats) return <Spinner />

  const total = events.length
  const lvl = levelFor(total)
  const ach = achievements(events)
  const empty = total === 0 && stats.titles === 0 && stats.notes === 0

  return (
    <div className="page">
      <div className="mb-1 flex items-baseline justify-between">
        <h1 className="page-title !mb-0">{t('nav.tree')}</h1>
        {total > 0 && (
          <span className="flex items-center gap-1.5 text-sm text-zinc-500">
            <Sparkles size={14} className="text-accent-bright" />
            {t('world.light')}: <span className="font-semibold text-zinc-300">{total}</span>
          </span>
        )}
      </div>
      <p className="mb-4 max-w-3xl text-sm text-zinc-500">{t('tree.subtitle')}</p>

      {total > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-accent bg-accent/15 text-lg font-bold text-accent-bright">
              {lvl.level}
            </span>
            <div>
              <div className="text-sm font-semibold text-zinc-200">{t(lvl.nameKey)}</div>
              <div className="mt-1 flex items-center gap-2">
                <div className="h-2 w-36 overflow-hidden rounded-full bg-raised">
                  <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${Math.min(100, Math.round((lvl.have / lvl.need) * 100))}%` }} />
                </div>
                <span className="text-[10px] text-zinc-600">{lvl.level >= 6 ? 'MAX' : `${lvl.have}/${lvl.need}`}</span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {ach.map((a) => (
              <span
                key={a.key}
                title={t(a.key)}
                className={`flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] transition-colors ${
                  a.unlocked ? 'border-accent/40 bg-accent/10 text-accent-bright' : 'border-edge bg-raised text-zinc-600 opacity-50'
                }`}
              >
                <Award size={10} /> {t(a.key)}
              </span>
            ))}
          </div>
        </div>
      )}

      {empty ? (
        <EmptyState icon={TreePine} title={t('tree.emptyTitle')} subtitle={t('tree.emptySubtitle')} />
      ) : (
        <>
          <div ref={containerRef} className="relative overflow-hidden rounded-2xl border border-edge/50 bg-black">
            <div ref={hostRef} />
            {worldError && (
              <div className="p-6 text-sm text-red-400">
                {worldError}
              </div>
            )}
            {tip && (
              <div
                className="pointer-events-none absolute z-10 max-w-xs rounded-lg border border-edge bg-raised px-3 py-2"
                style={{ left: Math.min(tip.x + 14, (containerRef.current?.clientWidth ?? 600) - 240), top: tip.y - 8 }}
              >
                <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: tip.color }}>
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: tip.color }} />
                  {tip.head}
                </div>
                <div className="mt-0.5 truncate text-sm text-zinc-200">{tip.label}</div>
                {tip.sub && <div className="truncate text-xs text-zinc-500">{tip.sub}</div>}
              </div>
            )}
          </div>

          <p className="mt-3 text-xs text-zinc-600">{t('world.hint')}</p>
          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-5">
            {[
              { icon: BookOpen, key: 'world.zone.library' as TKey, stat: String(stats.titles), to: '/library', color: KIND_HEX.title },
              { icon: PenLine, key: 'world.zone.notes' as TKey, stat: String(stats.notes), to: '/notes', color: KIND_HEX.note },
              { icon: CalendarDays, key: 'world.zone.journal' as TKey, stat: t('world.zone.streak', { n: stats.streak }), to: '/journal', color: KIND_HEX.journal },
              { icon: ListTodo, key: 'world.zone.tasks' as TKey, stat: t('world.zone.openTasks', { n: stats.openTasks }), to: '/tasks', color: '#ffd27d' },
              { icon: Bookmark, key: 'world.zone.moments' as TKey, stat: String(stats.moments), to: '/moments', color: KIND_HEX.moment },
            ].map(({ icon: Icon, key, stat, to, color }) => (
              <button
                key={key}
                onClick={() => navigate(to)}
                className="card flex items-center gap-3 px-4 py-3 text-left transition-transform hover:-translate-y-0.5"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: `${color}22`, color }}>
                  <Icon size={15} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium text-zinc-200">{t(key)}</span>
                  <span className="block text-xs text-zinc-500">{stat}</span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
