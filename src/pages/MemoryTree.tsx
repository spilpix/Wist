import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TreePine } from 'lucide-react'
import EmptyState from '../components/ui/EmptyState'
import Spinner from '../components/ui/Spinner'
import type { MemoryEvent, MemoryKind } from '../types/models'
import { formatDate } from '../utils/formatters'
import { useI18n, MONTHS_SHORT } from '../i18n'

const KIND_COLORS: Record<MemoryKind, string> = {
  moment: '#a888f0',
  title: '#4ade80',
  book: '#f59e0b',
  note: '#60a5fa',
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

// trunk: gentle S-curve, base → crown
const TRUNK_P0: Pt = { x: 500, y: 640 }
const TRUNK_P1: Pt = { x: 518, y: 400 }
const TRUNK_P2: Pt = { x: 494, y: 158 }

interface Leaf {
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
      const len = evs.length ? 120 + Math.min(evs.length, 14) * 13 : 80
      const lift = len * (0.42 + 0.12 * seed(key))
      const tipPt: Pt = { x: attach.x + side * len, y: attach.y - lift }
      const ctrl: Pt = { x: attach.x + side * len * 0.45, y: attach.y - lift * 0.12 }

      const leaves: Leaf[] = evs.map((ev, j) => {
        const ft = 0.3 + 0.68 * (evs.length === 1 ? 0.85 : j / (evs.length - 1))
        const p = bez(attach, ctrl, tipPt, ft)
        const n = bezNormal(attach, ctrl, tipPt, ft)
        const off = (seed(ev.key) - 0.5) * 2 * (10 + 14 * seed(ev.key + 'o'))
        return { ev, x: p.x + n.x * off, y: p.y + n.y * off, r: 4 + 2 * seed(ev.key + 'r') }
      })

      return { key, label, start: attach, ctrl, tip: tipPt, side, leaves }
    })
  }, [events, lang])

  if (!events) return <Spinner />

  const total = events.length

  const onLeafClick = (ev: MemoryEvent) => {
    if (ev.kind === 'note') navigate(`/notes?open=${ev.ref_id}`)
    else navigate(`/title/${ev.ref_id}`)
  }

  return (
    <div className="page">
      <div className="mb-1 flex items-baseline justify-between">
        <h1 className="page-title !mb-0">{t('nav.tree')}</h1>
        {total > 0 && <span className="text-sm text-zinc-500">{t('tree.memories', { n: total })}</span>}
      </div>
      <p className="mb-5 max-w-2xl text-sm text-zinc-500">{t('tree.subtitle')}</p>

      <div className="mb-4 flex flex-wrap items-center gap-4 text-xs text-zinc-400">
        {(Object.keys(KIND_COLORS) as MemoryKind[]).map((kind) => (
          <span key={kind} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: KIND_COLORS[kind] }} />
            {t(`tree.kind.${kind}`)}
          </span>
        ))}
      </div>

      {total === 0 ? (
        <EmptyState icon={TreePine} title={t('tree.emptyTitle')} subtitle={t('tree.emptySubtitle')} />
      ) : (
        <div ref={containerRef} className="relative card overflow-hidden">
          <svg viewBox="0 0 1000 700" className="block w-full" onMouseLeave={() => setTip(null)}>
            {/* soft crown glow */}
            <defs>
              <radialGradient id="crown" cx="50%" cy="42%" r="55%">
                <stop offset="0%" style={{ stopColor: 'var(--accent)', stopOpacity: 0.1 }} />
                <stop offset="100%" style={{ stopColor: 'var(--accent)', stopOpacity: 0 }} />
              </radialGradient>
            </defs>
            <rect width="1000" height="700" fill="url(#crown)" />

            {/* ground */}
            <ellipse cx="500" cy="644" rx="330" ry="13" fill="rgba(var(--accent-rgb),0.07)" />
            <line x1="120" y1="644" x2="880" y2="644" style={{ stroke: 'rgb(var(--edge))' }} strokeWidth="1.5" />

            {/* roots */}
            <path d="M 500 640 Q 470 652 420 650" stroke="#2b2440" strokeWidth="7" fill="none" strokeLinecap="round" />
            <path d="M 500 640 Q 532 654 578 651" stroke="#2b2440" strokeWidth="7" fill="none" strokeLinecap="round" />

            {/* trunk */}
            <path
              d={`M ${TRUNK_P0.x} ${TRUNK_P0.y} Q ${TRUNK_P1.x} ${TRUNK_P1.y} ${TRUNK_P2.x} ${TRUNK_P2.y}`}
              stroke="#352b4e"
              strokeWidth="17"
              fill="none"
              strokeLinecap="round"
            />
            <path
              d={`M ${TRUNK_P0.x} ${TRUNK_P0.y} Q ${TRUNK_P1.x} ${TRUNK_P1.y} ${TRUNK_P2.x} ${TRUNK_P2.y}`}
              stroke="#473a66"
              strokeWidth="7"
              fill="none"
              strokeLinecap="round"
            />
            {/* crown bud */}
            <circle cx={TRUNK_P2.x} cy={TRUNK_P2.y} r="7" fill="#a888f0" opacity="0.9" />
            <circle cx={TRUNK_P2.x} cy={TRUNK_P2.y} r="16" fill="#a888f0" opacity="0.15" />

            {branches.map((b) => (
              <g key={b.key}>
                <path
                  d={`M ${b.start.x} ${b.start.y} Q ${b.ctrl.x} ${b.ctrl.y} ${b.tip.x} ${b.tip.y}`}
                  stroke={b.leaves.length ? '#3f3560' : '#2c2640'}
                  strokeWidth={b.leaves.length ? 4.5 : 3}
                  fill="none"
                  strokeLinecap="round"
                />
                <text
                  x={b.tip.x + b.side * 12}
                  y={b.tip.y + 4}
                  textAnchor={b.side === 1 ? 'start' : 'end'}
                  fontSize="13"
                  style={{ fill: b.leaves.length ? 'rgb(var(--ink-500))' : 'rgb(var(--ink-700))' }}
                >
                  {b.label}
                </text>
                {b.leaves.map((leaf) => (
                  <g
                    key={leaf.ev.key}
                    className="cursor-pointer"
                    onClick={() => onLeafClick(leaf.ev)}
                    onMouseMove={(e) => {
                      const rect = containerRef.current?.getBoundingClientRect()
                      if (rect) setTip({ x: e.clientX - rect.left, y: e.clientY - rect.top, ev: leaf.ev })
                    }}
                    onMouseLeave={() => setTip(null)}
                  >
                    {/* stem connecting leaf to branch */}
                    <circle cx={leaf.x} cy={leaf.y} r={leaf.r * 2.4} fill={KIND_COLORS[leaf.ev.kind]} opacity="0.13" />
                    <circle
                      cx={leaf.x}
                      cy={leaf.y}
                      r={leaf.r}
                      fill={KIND_COLORS[leaf.ev.kind]}
                      style={{ stroke: 'rgb(var(--surface))' }}
                      strokeWidth="1.5"
                    />
                  </g>
                ))}
              </g>
            ))}
          </svg>

          {tip && (
            <div
              className="pointer-events-none absolute z-10 max-w-xs rounded-lg border border-edge bg-raised px-3 py-2 shadow-none"
              style={{
                left: Math.min(tip.x + 14, (containerRef.current?.clientWidth ?? 600) - 240),
                top: tip.y - 8,
              }}
            >
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: KIND_COLORS[tip.ev.kind] }}>
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: KIND_COLORS[tip.ev.kind] }} />
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
