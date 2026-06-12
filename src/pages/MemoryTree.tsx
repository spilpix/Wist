import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Award, TreePine } from 'lucide-react'
import EmptyState from '../components/ui/EmptyState'
import Spinner from '../components/ui/Spinner'
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

/** deterministic 0..1 from a string — keeps the tree stable between renders */
function seed(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return ((h >>> 0) % 10000) / 10000
}

// trunk: hand-drawn S-curve, base → crown
const TRUNK_P0: Pt = { x: 500, y: 612 }
const TRUNK_P1: Pt = { x: 520, y: 390 }
const TRUNK_P2: Pt = { x: 492, y: 150 }

// growth levels: memories needed for level k = 3·k²
const LEVEL_KEYS: TKey[] = ['tree.lvl1', 'tree.lvl2', 'tree.lvl3', 'tree.lvl4', 'tree.lvl5', 'tree.lvl6']
function levelFor(n: number): { level: number; nameKey: TKey; have: number; need: number } {
  let level = 1
  while (level < 6 && n >= 3 * (level + 1) ** 2) level++
  const base = level === 1 ? 0 : 3 * level ** 2
  const next = 3 * (level + 1) ** 2
  return { level, nameKey: LEVEL_KEYS[level - 1], have: n - base, need: next - base }
}

interface Achievement {
  key: TKey
  unlocked: boolean
}

function achievements(events: MemoryEvent[]): Achievement[] {
  const by = (k: MemoryKind) => events.filter((e) => e.kind === k).length
  return [
    { key: 'tree.ach.first', unlocked: events.length >= 1 },
    { key: 'tree.ach.ten', unlocked: events.length >= 10 },
    { key: 'tree.ach.fifty', unlocked: events.length >= 50 },
    { key: 'tree.ach.cinephile', unlocked: by('title') >= 10 },
    { key: 'tree.ach.bookworm', unlocked: by('book') >= 3 },
    { key: 'tree.ach.chronicler', unlocked: by('note') + by('journal') >= 15 },
    { key: 'tree.ach.collector', unlocked: by('moment') >= 25 },
  ]
}

interface Leaf {
  ev: MemoryEvent
  x: number
  y: number
  px: number // pixel size
}

interface Branch {
  key: string
  label: string
  start: Pt
  ctrl: Pt
  tip: Pt
  side: 1 | -1
  leaves: Leaf[]
}

export default function MemoryTree() {
  const { t, lang } = useI18n()
  const navigate = useNavigate()
  const containerRef = useRef<HTMLDivElement>(null)
  const [events, setEvents] = useState<MemoryEvent[] | null>(null)
  const [tip, setTip] = useState<{ x: number; y: number; ev: MemoryEvent } | null>(null)

  useEffect(() => {
    window.wist.stats.memories().then(setEvents)
  }, [])

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
      const label = cursor.getMonth() === 0 ? `${name} ${cursor.getFullYear()}` : name
      months.push({ key, label })
      cursor.setMonth(cursor.getMonth() + 1)
    }

    return months.map(({ key, label }, i) => {
      const evs = byMonth.get(key) ?? []
      const tFrac = i / 11
      const attach = bez(TRUNK_P0, TRUNK_P1, TRUNK_P2, 0.08 + tFrac * 0.86)
      const side: 1 | -1 = i % 2 === 0 ? -1 : 1
      const len = evs.length ? 120 + Math.min(evs.length, 14) * 13 : 75
      const lift = len * (0.42 + 0.14 * seed(key))
      const tipPt: Pt = { x: attach.x + side * len, y: attach.y - lift }
      const ctrl: Pt = { x: attach.x + side * len * 0.45, y: attach.y - lift * 0.1 }

      const leaves: Leaf[] = evs.map((ev, j) => {
        const ft = 0.3 + 0.68 * (evs.length === 1 ? 0.85 : j / (evs.length - 1))
        const p = bez(attach, ctrl, tipPt, ft)
        const n = bezNormal(attach, ctrl, tipPt, ft)
        const off = (seed(ev.key) - 0.5) * 2 * (10 + 14 * seed(ev.key + 'o'))
        const px = 7 + Math.round(3 * seed(ev.key + 'r'))
        return { ev, x: Math.round(p.x + n.x * off), y: Math.round(p.y + n.y * off), px }
      })

      return { key, label, start: attach, ctrl, tip: tipPt, side, leaves }
    })
  }, [events, lang])

  // fixed pixel-stars and fireflies, deterministic
  const stars = useMemo(
    () =>
      Array.from({ length: 26 }, (_, i) => ({
        x: Math.round(40 + seed(`s${i}`) * 920),
        y: Math.round(20 + seed(`sy${i}`) * 360),
        d: seed(`sd${i}`) * 4,
      })),
    []
  )
  const fireflies = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => ({
        x: 180 + seed(`f${i}`) * 640,
        y: 280 + seed(`fy${i}`) * 280,
        d: seed(`fd${i}`) * 6,
      })),
    []
  )

  if (!events) return <Spinner />

  const total = events.length
  const lvl = levelFor(total)
  const ach = achievements(events)

  const onLeafClick = (ev: MemoryEvent) => {
    if (ev.kind === 'note') navigate(`/notes?open=${ev.ref_id}`)
    else if (ev.kind === 'journal') navigate('/journal')
    else navigate(`/title/${ev.ref_id}`)
  }

  return (
    <div className="page">
      <div className="mb-1 flex items-baseline justify-between">
        <h1 className="page-title !mb-0">{t('nav.tree')}</h1>
        {total > 0 && <span className="font-mono text-sm text-zinc-500">{t('tree.memories', { n: total })}</span>}
      </div>
      <p className="mb-5 max-w-2xl text-sm text-zinc-500">{t('tree.subtitle')}</p>

      {total > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-x-6 gap-y-3">
          {/* level + xp, lo-fi mono */}
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg border-2 border-accent bg-accent/15 font-mono text-lg font-bold text-accent-bright" style={{ imageRendering: 'pixelated' }}>
              {lvl.level}
            </span>
            <div>
              <div className="font-mono text-sm font-semibold text-zinc-200">{t(lvl.nameKey)}</div>
              <div className="mt-1 flex items-center gap-2">
                <div className="h-2 w-36 overflow-hidden rounded-sm bg-raised" style={{ imageRendering: 'pixelated' }}>
                  <div
                    className="h-full bg-accent transition-all"
                    style={{ width: `${Math.min(100, Math.round((lvl.have / lvl.need) * 100))}%` }}
                  />
                </div>
                <span className="font-mono text-[10px] text-zinc-600">
                  {lvl.level >= 6 ? 'MAX' : `${lvl.have}/${lvl.need} XP`}
                </span>
              </div>
            </div>
          </div>

          {/* achievements */}
          <div className="flex flex-wrap items-center gap-1.5">
            {ach.map((a) => (
              <span
                key={a.key}
                title={t(a.key)}
                className={`flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[10px] transition-colors ${
                  a.unlocked
                    ? 'border-accent/40 bg-accent/10 text-accent-bright'
                    : 'border-edge bg-raised text-zinc-600 opacity-50'
                }`}
              >
                <Award size={10} /> {t(a.key)}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-4 font-mono text-xs text-zinc-400">
        {(Object.keys(KIND_COLORS) as MemoryKind[]).map((kind) => (
          <span key={kind} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5" style={{ backgroundColor: KIND_COLORS[kind], imageRendering: 'pixelated' }} />
            {t(`tree.kind.${kind}`)}
          </span>
        ))}
      </div>

      {total === 0 ? (
        <EmptyState icon={TreePine} title={t('tree.emptyTitle')} subtitle={t('tree.emptySubtitle')} />
      ) : (
        <div ref={containerRef} className="relative card overflow-hidden">
          <svg viewBox="0 0 1000 700" className="block w-full" onMouseLeave={() => setTip(null)} shapeRendering="crispEdges">
            <defs>
              {/* ink wobble: makes every stroke look hand-drawn */}
              <filter id="ink" x="-20%" y="-20%" width="140%" height="140%">
                <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="7" result="noise" />
                <feDisplacementMap in="SourceGraphic" in2="noise" scale="6" />
              </filter>
              {/* paper grain */}
              <filter id="grain">
                <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3" stitchTiles="stitch" />
                <feColorMatrix type="saturate" values="0" />
                <feComponentTransfer>
                  <feFuncA type="linear" slope="0.06" />
                </feComponentTransfer>
                <feComposite operator="over" in2="SourceGraphic" />
              </filter>
              <radialGradient id="crown" cx="50%" cy="40%" r="58%">
                <stop offset="0%" style={{ stopColor: 'var(--accent)', stopOpacity: 0.12 }} />
                <stop offset="100%" style={{ stopColor: 'var(--accent)', stopOpacity: 0 }} />
              </radialGradient>
            </defs>

            {/* paper background with grain */}
            <rect width="1000" height="700" style={{ fill: 'rgb(var(--surface))' }} />
            <rect width="1000" height="700" filter="url(#grain)" opacity="0.5" style={{ fill: 'rgb(var(--raised))' }} />
            <rect width="1000" height="700" fill="url(#crown)" />

            {/* pixel stars (twinkle) */}
            {stars.map((s, i) => (
              <rect
                key={i}
                x={s.x}
                y={s.y}
                width={i % 5 === 0 ? 3 : 2}
                height={i % 5 === 0 ? 3 : 2}
                className="tree-star"
                style={{ animationDelay: `${s.d}s`, fill: 'rgb(var(--ink-600))' }}
              />
            ))}

            {/* ground: ink line + grass strokes */}
            <g filter="url(#ink)">
              <line x1="110" y1="618" x2="890" y2="618" style={{ stroke: 'rgb(var(--ink-700))' }} strokeWidth="3" />
              {Array.from({ length: 24 }, (_, i) => {
                const gx = 140 + i * 31 + seed(`g${i}`) * 14
                const gh = 6 + seed(`gh${i}`) * 12
                return (
                  <line
                    key={i}
                    x1={gx}
                    y1={618}
                    x2={gx + (seed(`gd${i}`) - 0.5) * 8}
                    y2={618 - gh}
                    style={{ stroke: 'rgb(var(--ink-700))' }}
                    strokeWidth="1.5"
                  />
                )
              })}
            </g>

            {/* trunk + roots, double-stroked ink */}
            <g filter="url(#ink)">
              <path d="M 500 612 Q 462 632 408 628" style={{ stroke: 'rgb(var(--ink-700))' }} strokeWidth="6" fill="none" strokeLinecap="round" />
              <path d="M 500 612 Q 540 634 596 629" style={{ stroke: 'rgb(var(--ink-700))' }} strokeWidth="6" fill="none" strokeLinecap="round" />
              <path
                d={`M ${TRUNK_P0.x} ${TRUNK_P0.y} Q ${TRUNK_P1.x} ${TRUNK_P1.y} ${TRUNK_P2.x} ${TRUNK_P2.y}`}
                style={{ stroke: 'rgb(var(--ink-500))' }}
                strokeWidth="14"
                fill="none"
                strokeLinecap="round"
              />
              <path
                d={`M ${TRUNK_P0.x + 4} ${TRUNK_P0.y} Q ${TRUNK_P1.x + 6} ${TRUNK_P1.y} ${TRUNK_P2.x + 3} ${TRUNK_P2.y + 10}`}
                style={{ stroke: 'rgb(var(--ink-700))' }}
                strokeWidth="4"
                fill="none"
                strokeLinecap="round"
              />
            </g>

            {/* crown bud — the tree keeps growing */}
            <rect x={TRUNK_P2.x - 4} y={TRUNK_P2.y - 8} width="8" height="8" fill="#a888f0" className="tree-star" />

            {branches.map((b) => (
              <g key={b.key}>
                <path
                  d={`M ${b.start.x} ${b.start.y} Q ${b.ctrl.x} ${b.ctrl.y} ${b.tip.x} ${b.tip.y}`}
                  style={{ stroke: b.leaves.length ? 'rgb(var(--ink-500))' : 'rgb(var(--ink-700))' }}
                  strokeWidth={b.leaves.length ? 4 : 2.5}
                  fill="none"
                  strokeLinecap="round"
                  filter="url(#ink)"
                />
                <text
                  x={b.tip.x + b.side * 14}
                  y={b.tip.y + 4}
                  textAnchor={b.side === 1 ? 'start' : 'end'}
                  fontSize="12"
                  fontFamily="ui-monospace, monospace"
                  style={{ fill: b.leaves.length ? 'rgb(var(--ink-500))' : 'rgb(var(--ink-700))' }}
                >
                  {b.label}
                </text>
                {b.leaves.map((leaf, li) => (
                  <g
                    key={leaf.ev.key}
                    className="tree-leaf cursor-pointer"
                    style={{ animationDelay: `${(seed(leaf.ev.key) * 5).toFixed(2)}s` }}
                    onClick={() => onLeafClick(leaf.ev)}
                    onMouseMove={(e) => {
                      const rect = containerRef.current?.getBoundingClientRect()
                      if (rect) setTip({ x: e.clientX - rect.left, y: e.clientY - rect.top, ev: leaf.ev })
                    }}
                    onMouseLeave={() => setTip(null)}
                  >
                    {/* main pixel + dither satellites */}
                    <rect x={leaf.x} y={leaf.y} width={leaf.px} height={leaf.px} fill={KIND_COLORS[leaf.ev.kind]} />
                    <rect
                      x={leaf.x + leaf.px + 1}
                      y={leaf.y - 3}
                      width="3"
                      height="3"
                      fill={KIND_COLORS[leaf.ev.kind]}
                      opacity="0.7"
                    />
                    <rect
                      x={leaf.x - 4}
                      y={leaf.y + leaf.px - 2}
                      width="2"
                      height="2"
                      fill={KIND_COLORS[leaf.ev.kind]}
                      opacity="0.5"
                    />
                    {li % 3 === 0 && (
                      <rect x={leaf.x + 2} y={leaf.y + leaf.px + 3} width="2" height="2" fill={KIND_COLORS[leaf.ev.kind]} opacity="0.35" />
                    )}
                  </g>
                ))}
              </g>
            ))}

            {/* fireflies */}
            {fireflies.map((f, i) => (
              <rect
                key={i}
                x={f.x}
                y={f.y}
                width="3"
                height="3"
                fill="#ffe9a3"
                className="tree-firefly"
                style={{ animationDelay: `${f.d}s` }}
              />
            ))}
          </svg>

          {tip && (
            <div
              className="pointer-events-none absolute z-10 max-w-xs rounded-lg border border-edge bg-raised px-3 py-2"
              style={{
                left: Math.min(tip.x + 14, (containerRef.current?.clientWidth ?? 600) - 240),
                top: tip.y - 8,
              }}
            >
              <div className="flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-wide" style={{ color: KIND_COLORS[tip.ev.kind] }}>
                <span className="h-1.5 w-1.5" style={{ backgroundColor: KIND_COLORS[tip.ev.kind] }} />
                {t(`tree.kind.${tip.ev.kind}`)} · {formatDate(tip.ev.date)}
              </div>
              <div className="mt-0.5 truncate text-sm text-zinc-200">{tip.ev.label}</div>
              {tip.ev.sublabel && <div className="truncate text-xs text-zinc-500">{tip.ev.sublabel}</div>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
