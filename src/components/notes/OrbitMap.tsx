import { useEffect, useState } from 'react'
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react'
import type { NodeRef, RelatedEdge } from '../../types/models'
import { objColorHex, hueForType } from '../../lib/objectColors'

// A note's neighbourhood at the scale of one thought, built into the note (not hidden on
// /tree): a small radial "orbit" map for shape + a readable legend (full names, link
// direction, type colour) below it. One component — replaces the old duplicated
// orbit + backlinks + relations stack. Colour = neighbour's type.
const CAP = 8

export default function OrbitMap({ focus, onOpen, label }: { focus: NodeRef; onOpen: (route: string) => void; label: string }) {
  const [rels, setRels] = useState<RelatedEdge[]>([])
  useEffect(() => {
    let alive = true
    window.wist.edges
      .related(focus.type, String(focus.id))
      .then((r) => alive && setRels(r))
      .catch(() => alive && setRels([]))
    return () => {
      alive = false
    }
  }, [focus.type, focus.id])

  const shown = rels.filter((r) => !r.node.missing && r.node.route).slice(0, CAP)
  if (!shown.length) return null
  const extra = rels.length - shown.length

  const W = 220
  const H = 156
  const cx = W / 2
  const cy = 78
  const R = 60
  const nodes = shown.map((r, i) => {
    const ang = (-90 + (360 / shown.length) * i) * (Math.PI / 180)
    return {
      r,
      x: cx + R * Math.cos(ang),
      y: cy + R * Math.sin(ang),
      color: objColorHex(hueForType(r.node.type)),
    }
  })

  return (
    <div className="mb-5">
      <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-600">{label}</div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Карта связей заметки">
        <circle cx={cx} cy={cy} r={R} fill="none" stroke="rgb(var(--edge))" strokeWidth={1} />
        {nodes.map((n, i) => (
          <line key={`l${i}`} x1={cx} y1={cy} x2={n.x} y2={n.y} stroke={n.color} strokeWidth={1.2} opacity={0.4} />
        ))}
        {nodes.map((n, i) => (
          <g key={i} onClick={() => n.r.node.route && onOpen(n.r.node.route)} style={{ cursor: 'pointer' }}>
            <circle cx={n.x} cy={n.y} r={8} fill={n.color} />
            <title>{n.r.node.label}</title>
          </g>
        ))}
        <circle cx={cx} cy={cy} r={11} fill="rgb(var(--accent-rgb))" />
      </svg>

      {/* legend — the orbit's key: full names, link direction, type colour */}
      <div className="mt-1.5 flex flex-col gap-0.5">
        {shown.map((r, i) => (
          <button
            key={i}
            onClick={() => r.node.route && onOpen(r.node.route)}
            title={r.direction === 'in' ? 'Ссылается сюда' : 'Ведёт отсюда'}
            className="flex items-center gap-2 rounded-md px-1.5 py-1 text-left text-[12.5px] text-zinc-300 transition-colors hover:bg-highlight"
          >
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: objColorHex(hueForType(r.node.type)) }} aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">{r.node.label || '—'}</span>
            {r.direction === 'in' ? (
              <ArrowDownLeft size={12} className="shrink-0 text-zinc-600" />
            ) : (
              <ArrowUpRight size={12} className="shrink-0 text-zinc-600" />
            )}
          </button>
        ))}
        {extra > 0 && <div className="px-1.5 pt-0.5 text-[11px] text-zinc-600">+{extra}</div>}
      </div>
    </div>
  )
}
