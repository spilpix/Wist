import { useState } from 'react'
import type { CanvasEdge } from '../types/models'
import { connectorPath, type Pt } from './geometry'

interface Props {
  edge: CanvasEdge
  p1: Pt
  p2: Pt
  n1?: Pt
  n2?: Pt
  selected: boolean
  onSelect: (e: React.PointerEvent) => void
}

/** A single connector, rendered inside the world-space SVG layer. */
export default function ConnectorView({ edge, p1, p2, n1, n2, selected, onSelect }: Props) {
  // hovering the (fat) hit area morphs the line into its hover state — thicker +
  // accent-tinted, eased so it grows smoothly as the pointer slips over it (Obsidian-style)
  const [hover, setHover] = useState(false)
  const type = edge.type ?? 'curve'
  const d = connectorPath(type, p1, p2, n1, n2)
  const arrow = edge.arrow ?? 'end'
  const base = edge.width ?? 2
  const active = selected || hover
  const stroke = active ? 'rgb(var(--accent-rgb))' : edge.color || 'rgb(var(--ink-500))'
  const width = active ? base + 1.5 : base
  const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }

  return (
    <g>
      {/* fat invisible hit area — also drives the smooth hover state */}
      <path
        d={d}
        fill="none"
        stroke="transparent"
        strokeWidth={Math.max(14, base + 12)}
        style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
        onPointerDown={onSelect}
        onPointerEnter={() => setHover(true)}
        onPointerLeave={() => setHover(false)}
      />
      <path
        d={d}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={edge.dash ? `${base * 3} ${base * 2}` : undefined}
        markerStart={arrow === 'both' || arrow === 'start' ? 'url(#cv-arrow-start)' : undefined}
        markerEnd={arrow === 'both' || arrow === 'end' ? 'url(#cv-arrow-end)' : undefined}
        // stroke + width via CSS so the hover morph eases (presentation attrs don't transition reliably)
        style={{ pointerEvents: 'none', stroke, strokeWidth: width, transition: 'stroke-width 130ms ease, stroke 130ms ease' }}
      />
      {edge.label ? (
        <g style={{ pointerEvents: 'none' }}>
          <rect
            x={mid.x - (edge.label.length * 3.4 + 6)}
            y={mid.y - 9}
            width={edge.label.length * 6.8 + 12}
            height={18}
            rx={4}
            fill="rgb(var(--surface))"
            stroke="rgb(var(--edge))"
            strokeWidth={1}
          />
          <text x={mid.x} y={mid.y} textAnchor="middle" dominantBaseline="central" fontSize={11} fill="rgb(var(--ink-200))">
            {edge.label}
          </text>
        </g>
      ) : null}
    </g>
  )
}
