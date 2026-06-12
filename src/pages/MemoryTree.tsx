import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Award, BookOpen, Bookmark, CalendarDays, ListTodo, PenLine, Sparkles, TreePine } from 'lucide-react'
import EmptyState from '../components/ui/EmptyState'
import Spinner from '../components/ui/Spinner'
import { useSettingsStore, resolvedTheme } from '../store/settingsStore'
import type { MemoryEvent, MemoryKind } from '../types/models'
import { formatDate } from '../utils/formatters'
import { useI18n, MONTHS_SHORT, type TKey } from '../i18n'

const KIND_COLORS: Record<MemoryKind, string> = {
  moment: '#a888f0',
  title: '#4ade80',
  book: '#f59e0b',
  note: '#60a5fa',
  journal: '#f472b6',
}

type Pt = { x: number; y: number }

const bez = (p0: Pt, p1: Pt, p2: Pt, t: number): Pt => ({
  x: (1 - t) ** 2 * p0.x + 2 * (1 - t) * t * p1.x + t ** 2 * p2.x,
  y: (1 - t) ** 2 * p0.y + 2 * (1 - t) * t * p1.y + t ** 2 * p2.y,
})

const bezNormal = (p0: Pt, p1: Pt, p2: Pt, t: number): Pt => {
  const dx = 2 * (1 - t) * (p1.x - p0.x) + 2 * t * (p2.x - p1.x)
  const dy = 2 * (1 - t) * (p1.y - p0.y) + 2 * t * (p2.y - p1.y)
  const len = Math.hypot(dx, dy) || 1
  return { x: -dy / len, y: dx / len }
}

function seed(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return ((h >>> 0) % 10000) / 10000
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

interface Orb {
  ev: MemoryEvent
  x: number
  y: number
  r: number
}

interface Branch {
  key: string
  label: string
  start: Pt
  ctrl: Pt
  tip: Pt
  side: 1 | -1
  orbs: Orb[]
}

interface Tip {
  x: number
  y: number
  color: string
  head: string
  label: string
  sub?: string | null
}

interface WorldStats {
  titles: number
  notes: number
  openTasks: number
  doneTasks: number
  streak: number
}

export default function MemoryTree() {
  const { t, lang } = useI18n()
  const navigate = useNavigate()
  const containerRef = useRef<HTMLDivElement>(null)
  const themeSetting = useSettingsStore((s) => s.settings?.theme)
  const dark = (themeSetting === 'system' ? resolvedTheme() : themeSetting ?? 'dark') === 'dark'

  const [events, setEvents] = useState<MemoryEvent[] | null>(null)
  const [stats, setStats] = useState<WorldStats>({ titles: 0, notes: 0, openTasks: 0, doneTasks: 0, streak: 0 })
  const [tip, setTip] = useState<Tip | null>(null)

  useEffect(() => {
    Promise.all([
      window.wist.stats.memories(),
      window.wist.titles.list({}),
      window.wist.notes.list({}),
      window.wist.tasks.list(),
      window.wist.journal.streak(),
    ]).then(([ev, titles, notes, tasks, streak]) => {
      setEvents(ev)
      setStats({
        titles: titles.length,
        notes: notes.length,
        openTasks: tasks.filter((x) => !x.done).length,
        doneTasks: tasks.filter((x) => x.done).length,
        streak,
      })
    })
  }, [])

  // ---- year branches with memory orbs ----
  const branches = useMemo<Branch[]>(() => {
    if (!events) return []
    const byMonth = new Map<string, MemoryEvent[]>()
    for (const ev of events) {
      const key = ev.date.slice(0, 7)
      if (!byMonth.has(key)) byMonth.set(key, [])
      byMonth.get(key)!.push(ev)
    }
    const months: Array<{ key: string; label: string }> = []
    const cursor = new Date()
    cursor.setDate(1)
    cursor.setMonth(cursor.getMonth() - 11)
    for (let i = 0; i < 12; i++) {
      const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`
      const name = MONTHS_SHORT[lang][cursor.getMonth()]
      months.push({ key, label: cursor.getMonth() === 0 ? `${name} ${cursor.getFullYear()}` : name })
      cursor.setMonth(cursor.getMonth() + 1)
    }
    return months.map(({ key, label }, i) => {
      const evs = byMonth.get(key) ?? []
      const attach: Pt = { x: 600 + Math.sin(i * 0.95) * 7, y: 600 - i * 33 }
      const side: 1 | -1 = i % 2 === 0 ? -1 : 1
      const len = evs.length ? 120 + Math.min(evs.length, 14) * 13 : 70
      const lift = len * (0.4 + 0.16 * seed(key))
      const tipPt: Pt = { x: attach.x + side * len, y: attach.y - lift }
      const ctrl: Pt = { x: attach.x + side * len * 0.42, y: attach.y - lift * 0.08 }
      const orbs: Orb[] = evs.map((ev, j) => {
        const ft = 0.3 + 0.68 * (evs.length === 1 ? 0.85 : j / (evs.length - 1))
        const p = bez(attach, ctrl, tipPt, ft)
        const n = bezNormal(attach, ctrl, tipPt, ft)
        const off = (seed(ev.key) - 0.5) * 2 * (10 + 15 * seed(ev.key + 'o'))
        return { ev, x: p.x + n.x * off, y: p.y + n.y * off, r: 3.5 + 2.5 * seed(ev.key + 'r') }
      })
      return { key, label, start: attach, ctrl, tip: tipPt, side, orbs }
    })
  }, [events, lang])

  const stars = useMemo(
    () =>
      Array.from({ length: 70 }, (_, i) => ({
        x: 30 + seed(`s${i}`) * 1140,
        y: 16 + seed(`sy${i}`) * 330,
        r: seed(`sr${i}`) > 0.85 ? 1.8 : 1,
        d: seed(`sd${i}`) * 4,
      })),
    []
  )

  if (!events) return <Spinner />

  const total = events.length
  const lvl = levelFor(total)
  const ach = achievements(events)
  const fireflyCount = Math.min(14, Math.max(4, events.filter((e) => e.kind === 'moment').length))
  const lanterns = 4
  const lit = stats.doneTasks + stats.openTasks > 0 ? Math.round((stats.doneTasks / (stats.doneTasks + stats.openTasks)) * lanterns) : 0

  // ---- palette: Ori night / Ghibli dawn ----
  const P = dark
    ? {
        skyTop: '#070617', skyMid: '#141034', horizon: '#3b2a6e',
        hillFar: '#241b4e', hillMid: '#1a1340', ground: '#120d30', groundFront: '#0c081f',
        trunk: '#e9efff', trunkShade: '#b9c4f2', vein: '#d4ecff',
        branch: '#dde3ff', branchDim: '#7d83b8',
        lake: '#27306e', lakeDeep: '#1b2152', shine: '#bcd0ff',
        forest: '#221a52', forestLight: '#372a78',
        grass: '#231c4d', flowerStem: '#36406e',
        labelOn: '#a8aed6', labelOff: '#565b85',
        pathStroke: '#3c3168', lanternLit: '#ffd27d', lanternOff: '#4a4376',
        mist: '#8d9bff',
      }
    : {
        skyTop: '#9fd7ee', skyMid: '#fbe7bd', horizon: '#f6bf8a',
        hillFar: '#cdb9da', hillMid: '#a795c4', ground: '#7cab77', groundFront: '#5d9460',
        trunk: '#5d4937', trunkShade: '#43342a', vein: '#ffe9b8',
        branch: '#4a3a2c', branchDim: '#8a7a64',
        lake: '#86bcd9', lakeDeep: '#6aa6c8', shine: '#fff3c4',
        forest: '#4d7d54', forestLight: '#699e6c',
        grass: '#4f8a55', flowerStem: '#5d8f60',
        labelOn: '#5a5f70', labelOff: '#9aa0ad',
        pathStroke: '#c9b08a', lanternLit: '#ff9d3d', lanternOff: '#a78f6e',
        mist: '#ffffff',
      }

  const showTip = (e: React.MouseEvent, data: Omit<Tip, 'x' | 'y'>) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (rect) setTip({ x: e.clientX - rect.left, y: e.clientY - rect.top, ...data })
  }

  const zone = (e: React.MouseEvent, nameKey: TKey, sub: string, color: string) =>
    showTip(e, { color, head: t(nameKey), label: sub })

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

      {total === 0 && stats.titles === 0 && stats.notes === 0 ? (
        <EmptyState icon={TreePine} title={t('tree.emptyTitle')} subtitle={t('tree.emptySubtitle')} />
      ) : (
        <>
          <div ref={containerRef} className="relative overflow-hidden rounded-2xl border border-edge/50">
            <svg viewBox="0 0 1200 760" className="block w-full" onMouseLeave={() => setTip(null)}>
              <defs>
                <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={P.skyTop} />
                  <stop offset="62%" stopColor={P.skyMid} />
                  <stop offset="100%" stopColor={P.horizon} />
                </linearGradient>
                <radialGradient id="crownGlow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor={dark ? '#cfe0ff' : '#fff3c4'} stopOpacity={dark ? 0.38 : 0.5} />
                  <stop offset="100%" stopColor={dark ? '#cfe0ff' : '#fff3c4'} stopOpacity="0" />
                </radialGradient>
                <radialGradient id="moonGlow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor={dark ? '#e8efff' : '#fff6d8'} stopOpacity="0.9" />
                  <stop offset="40%" stopColor={dark ? '#cdd8ff' : '#ffe9ae'} stopOpacity="0.35" />
                  <stop offset="100%" stopColor={dark ? '#cdd8ff' : '#ffe9ae'} stopOpacity="0" />
                </radialGradient>
                <linearGradient id="auroraGrad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#46e3c0" stopOpacity="0" />
                  <stop offset="35%" stopColor="#46e3c0" stopOpacity="0.55" />
                  <stop offset="70%" stopColor="#8a6ff0" stopOpacity="0.5" />
                  <stop offset="100%" stopColor="#8a6ff0" stopOpacity="0" />
                </linearGradient>
                <linearGradient id="lakeGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={P.lake} />
                  <stop offset="100%" stopColor={P.lakeDeep} />
                </linearGradient>
                {(Object.keys(KIND_COLORS) as MemoryKind[]).map((k) => (
                  <radialGradient key={k} id={`halo-${k}`} cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor={KIND_COLORS[k]} stopOpacity="0.55" />
                    <stop offset="100%" stopColor={KIND_COLORS[k]} stopOpacity="0" />
                  </radialGradient>
                ))}
                <filter id="soft" x="-60%" y="-60%" width="220%" height="220%">
                  <feGaussianBlur stdDeviation="14" />
                </filter>
              </defs>

              {/* sky */}
              <rect width="1200" height="760" fill="url(#sky)" />

              {/* stars (night) */}
              {dark &&
                stars.map((s, i) => (
                  <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#dfe6ff" className="tree-star" style={{ animationDelay: `${s.d}s` }} />
                ))}

              {/* aurora (night) */}
              {dark && (
                <g filter="url(#soft)" className="world-aurora">
                  <path d="M 80 150 Q 360 60 640 130 T 1160 90" stroke="url(#auroraGrad)" strokeWidth="34" fill="none" />
                  <path d="M 140 220 Q 420 140 720 200 T 1180 160" stroke="url(#auroraGrad)" strokeWidth="22" fill="none" opacity="0.6" />
                </g>
              )}

              {/* clouds (day) */}
              {!dark && (
                <>
                  <g className="world-cloud" opacity="0.85">
                    <ellipse cx="240" cy="120" rx="95" ry="26" fill="#ffffff" />
                    <ellipse cx="310" cy="105" rx="60" ry="20" fill="#ffffff" />
                  </g>
                  <g className="world-cloud" style={{ animationDelay: '-14s' }} opacity="0.7">
                    <ellipse cx="880" cy="80" rx="110" ry="24" fill="#fff7ea" />
                    <ellipse cx="960" cy="95" rx="70" ry="18" fill="#fff7ea" />
                  </g>
                </>
              )}

              {/* moon / sun */}
              <circle cx={dark ? 950 : 250} cy={dark ? 130 : 150} r="90" fill="url(#moonGlow)" />
              <circle cx={dark ? 950 : 250} cy={dark ? 130 : 150} r="30" fill={dark ? '#eef2ff' : '#fff3c4'} />

              {/* far hills */}
              <path d="M 0 460 Q 180 380 360 440 T 720 430 T 1200 420 L 1200 760 L 0 760 Z" fill={P.hillFar} opacity="0.8" />
              <path d="M 0 520 Q 240 440 480 500 T 900 490 T 1200 500 L 1200 760 L 0 760 Z" fill={P.hillMid} opacity="0.9" />

              {/* mist */}
              <ellipse cx="600" cy="560" rx="430" ry="60" fill={P.mist} opacity={dark ? 0.07 : 0.3} filter="url(#soft)" />

              {/* ground */}
              <path d="M 0 600 Q 300 555 600 580 T 1200 575 L 1200 760 L 0 760 Z" fill={P.ground} />
              <path d="M 0 680 Q 350 640 700 665 T 1200 660 L 1200 760 L 0 760 Z" fill={P.groundFront} />

              {/* ---- Lake of Days (journal) ---- */}
              <g className="cursor-pointer" onClick={() => navigate('/journal')}
                 onMouseMove={(e) => zone(e, 'world.zone.journal', t('world.zone.streak', { n: stats.streak }), KIND_COLORS.journal)}
                 onMouseLeave={() => setTip(null)}>
                <ellipse cx="1010" cy="688" rx="160" ry="30" fill="url(#lakeGrad)" />
                <ellipse cx="1010" cy="688" rx="160" ry="30" fill="none" stroke={P.shine} strokeOpacity="0.25" strokeWidth="1.5" />
                <ellipse cx={dark ? 1052 : 968} cy="684" rx="34" ry="5" fill={P.shine} opacity="0.7" className="world-shine" />
                <ellipse cx={dark ? 1010 : 1030} cy="694" rx="56" ry="3.5" fill={P.shine} opacity="0.3" className="world-shine" style={{ animationDelay: '1.6s' }} />
              </g>

              {/* ---- Story Forest (library) ---- */}
              <g className="cursor-pointer" onClick={() => navigate('/library')}
                 onMouseMove={(e) => zone(e, 'world.zone.library', String(stats.titles), KIND_COLORS.title)}
                 onMouseLeave={() => setTip(null)}>
                {Array.from({ length: 6 }, (_, i) => {
                  const fx = 96 + i * 44 + seed(`f${i}`) * 18
                  const fy = 612 - seed(`fh${i}`) * 14
                  const h = 52 + seed(`fhh${i}`) * 36
                  return (
                    <g key={i}>
                      <line x1={fx} y1={fy} x2={fx} y2={fy - h * 0.45} stroke={P.trunkShade} strokeWidth="4" />
                      <ellipse cx={fx} cy={fy - h * 0.62} rx={16 + seed(`fr${i}`) * 8} ry={h * 0.38} fill={i % 2 ? P.forest : P.forestLight} />
                      {i % 2 === 0 && <circle cx={fx + 6} cy={fy - h * 0.6} r="2.2" fill="#4ade80" opacity="0.9" className="tree-star" style={{ animationDelay: `${i * 0.7}s` }} />}
                    </g>
                  )
                })}
              </g>

              {/* ---- Garden of Thoughts (notes) ---- */}
              <g className="cursor-pointer" onClick={() => navigate('/notes')}
                 onMouseMove={(e) => zone(e, 'world.zone.notes', String(stats.notes), KIND_COLORS.note)}
                 onMouseLeave={() => setTip(null)}>
                {Array.from({ length: 8 }, (_, i) => {
                  const gx = 760 + i * 16 + seed(`g${i}`) * 10
                  const gy = 640 - seed(`gy${i}`) * 10
                  const h = 18 + seed(`gh${i}`) * 16
                  return (
                    <g key={i} className="tree-leaf" style={{ animationDelay: `${seed(`gd${i}`) * 4}s` }}>
                      <line x1={gx} y1={gy} x2={gx + 2} y2={gy - h} stroke={P.flowerStem} strokeWidth="1.8" />
                      <circle cx={gx + 2} cy={gy - h - 2} r="7" fill="url(#halo-note)" />
                      <circle cx={gx + 2} cy={gy - h - 2} r="2.6" fill={KIND_COLORS.note} />
                    </g>
                  )
                })}
              </g>

              {/* ---- Path of Deeds (tasks) ---- */}
              <g className="cursor-pointer" onClick={() => navigate('/tasks')}
                 onMouseMove={(e) => zone(e, 'world.zone.tasks', t('world.zone.openTasks', { n: stats.openTasks }), '#ffd27d')}
                 onMouseLeave={() => setTip(null)}>
                <path d="M 410 758 Q 470 700 560 672 Q 600 660 612 652" stroke={P.pathStroke} strokeWidth="7" strokeDasharray="1 15" strokeLinecap="round" fill="none" />
                {Array.from({ length: lanterns }, (_, i) => {
                  const lt = 0.18 + i * 0.24
                  const lp = bez({ x: 410, y: 758 }, { x: 500, y: 690 }, { x: 612, y: 652 }, lt)
                  const isLit = i < lit
                  return (
                    <g key={i}>
                      <line x1={lp.x} y1={lp.y} x2={lp.x} y2={lp.y - 26} stroke={P.trunkShade} strokeWidth="2.5" />
                      {isLit && <circle cx={lp.x} cy={lp.y - 31} r="12" fill="url(#halo-book)" className="world-lantern" style={{ animationDelay: `${i * 0.9}s` }} />}
                      <circle cx={lp.x} cy={lp.y - 31} r="4" fill={isLit ? P.lanternLit : P.lanternOff} />
                    </g>
                  )
                })}
              </g>

              {/* grass blades */}
              {Array.from({ length: 40 }, (_, i) => {
                const gx = 30 + i * 29 + seed(`gr${i}`) * 16
                const gy = 700 + seed(`gry${i}`) * 40
                const gh = 8 + seed(`grh${i}`) * 14
                return <line key={i} x1={gx} y1={gy} x2={gx + (seed(`grd${i}`) - 0.5) * 8} y2={gy - gh} stroke={P.grass} strokeWidth="2" strokeLinecap="round" />
              })}

              {/* ---- Spirit Tree ---- */}
              <circle cx="600" cy="240" r="190" fill="url(#crownGlow)" />
              {/* roots */}
              <path d="M 562 664 C 540 672 506 678 470 675 L 470 680 L 600 680 Z" fill={P.trunkShade} opacity="0.9" />
              <path d="M 646 664 C 668 673 702 678 736 675 L 736 680 L 610 680 Z" fill={P.trunkShade} opacity="0.9" />
              {/* trunk */}
              <path
                d="M 560 666 C 574 596 582 530 586 462 C 590 396 584 322 596 248 C 598 226 600 210 601 196 C 603 212 606 234 609 256 C 620 336 615 412 621 482 C 627 556 638 614 650 666 Z"
                fill={P.trunk}
              />
              <path d="M 560 666 C 574 596 582 530 586 462 C 590 396 586 330 596 252 C 590 330 588 420 592 500 C 595 570 588 630 581 666 Z" fill={P.trunkShade} opacity="0.55" />
              {/* light veins (night) */}
              {dark && (
                <>
                  <path d="M 592 650 C 596 560 592 470 599 300" stroke={P.vein} strokeWidth="2" fill="none" className="world-vein" />
                  <path d="M 614 650 C 610 560 614 470 604 320" stroke={P.vein} strokeWidth="1.4" fill="none" className="world-vein" style={{ animationDelay: '1.4s' }} />
                </>
              )}
              {/* crown twigs */}
              <path d="M 601 200 C 592 178 576 166 552 158" stroke={P.branch} strokeWidth="4" fill="none" strokeLinecap="round" />
              <path d="M 601 200 C 610 176 628 164 654 158" stroke={P.branch} strokeWidth="4" fill="none" strokeLinecap="round" />
              <path d="M 601 198 C 600 182 602 170 606 156" stroke={P.branch} strokeWidth="3" fill="none" strokeLinecap="round" />
              <circle cx="601" cy="196" r="5" fill={dark ? '#eef2ff' : '#ffe9b8'} className="tree-star" />

              {/* year branches + memory orbs */}
              {branches.map((b) => (
                <g key={b.key}>
                  <path
                    d={`M ${b.start.x} ${b.start.y} Q ${b.ctrl.x} ${b.ctrl.y} ${b.tip.x} ${b.tip.y}`}
                    stroke={b.orbs.length ? P.branch : P.branchDim}
                    strokeWidth={b.orbs.length ? 4.5 : 2.5}
                    fill="none"
                    strokeLinecap="round"
                  />
                  <text
                    x={b.tip.x + b.side * 13}
                    y={b.tip.y + 4}
                    textAnchor={b.side === 1 ? 'start' : 'end'}
                    fontSize="12"
                    fill={b.orbs.length ? P.labelOn : P.labelOff}
                  >
                    {b.label}
                  </text>
                  {b.orbs.map((orb) => (
                    <g
                      key={orb.ev.key}
                      className="world-orb cursor-pointer"
                      style={{ animationDelay: `${(seed(orb.ev.key) * 5).toFixed(2)}s` }}
                      onClick={() => {
                        if (orb.ev.kind === 'note') navigate(`/notes?open=${orb.ev.ref_id}`)
                        else if (orb.ev.kind === 'journal') navigate('/journal')
                        else navigate(`/title/${orb.ev.ref_id}`)
                      }}
                      onMouseMove={(e) =>
                        showTip(e, {
                          color: KIND_COLORS[orb.ev.kind],
                          head: `${t(`tree.kind.${orb.ev.kind}`)} · ${formatDate(orb.ev.date)}`,
                          label: orb.ev.label,
                          sub: orb.ev.sublabel,
                        })
                      }
                      onMouseLeave={() => setTip(null)}
                    >
                      <circle cx={orb.x} cy={orb.y} r={orb.r * 3.1} fill={`url(#halo-${orb.ev.kind})`} />
                      <circle cx={orb.x} cy={orb.y} r={orb.r} fill={KIND_COLORS[orb.ev.kind]} />
                      <circle cx={orb.x - orb.r * 0.3} cy={orb.y - orb.r * 0.3} r={orb.r * 0.35} fill="#ffffff" opacity="0.8" />
                    </g>
                  ))}
                </g>
              ))}

              {/* fireflies of moments */}
              <g className="cursor-pointer" onClick={() => navigate('/moments')}
                 onMouseMove={(e) => zone(e, 'world.zone.moments', String(events.filter((x) => x.kind === 'moment').length), KIND_COLORS.moment)}
                 onMouseLeave={() => setTip(null)}>
                {Array.from({ length: fireflyCount }, (_, i) => (
                  <circle
                    key={i}
                    cx={170 + seed(`ff${i}`) * 860}
                    cy={420 + seed(`ffy${i}`) * 220}
                    r="2.2"
                    fill={dark ? '#ffe9a3' : '#fff0b8'}
                    className="tree-firefly"
                    style={{ animationDelay: `${seed(`ffd${i}`) * 8}s` }}
                  />
                ))}
              </g>
            </svg>

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

          {/* world zones */}
          <p className="mt-3 text-xs text-zinc-600">{t('world.hint')}</p>
          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-5">
            {[
              { icon: BookOpen, key: 'world.zone.library' as TKey, stat: String(stats.titles), to: '/library', color: KIND_COLORS.title },
              { icon: PenLine, key: 'world.zone.notes' as TKey, stat: String(stats.notes), to: '/notes', color: KIND_COLORS.note },
              { icon: CalendarDays, key: 'world.zone.journal' as TKey, stat: t('world.zone.streak', { n: stats.streak }), to: '/journal', color: KIND_COLORS.journal },
              { icon: ListTodo, key: 'world.zone.tasks' as TKey, stat: t('world.zone.openTasks', { n: stats.openTasks }), to: '/tasks', color: '#ffd27d' },
              { icon: Bookmark, key: 'world.zone.moments' as TKey, stat: String(events.filter((x) => x.kind === 'moment').length), to: '/moments', color: KIND_COLORS.moment },
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
