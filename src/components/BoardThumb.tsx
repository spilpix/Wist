import { Frame } from 'lucide-react'
import type { CanvasData, CanvasNode } from '../types/models'
import { bbox, shapePath } from '../canvas/geometry'
import { isRectish } from '../canvas/constants'

// ── a faithful mini-preview of a board (Figma-style file thumbnail) ──────────────
// Shared by the Canvas index page and the Home "Canvases" widget.
export default function BoardThumb({ data }: { data: CanvasData }) {
  const nodes = data.nodes.slice(0, 160)
  const b = bbox(nodes)
  if (!nodes.length || !b) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Frame size={24} className="text-zinc-600" />
      </div>
    )
  }
  const pad = Math.max(24, Math.min(b.w, b.h) * 0.08)
  const vb = `${b.x - pad} ${b.y - pad} ${b.w + pad * 2} ${b.h + pad * 2}`
  const order = [...nodes].sort((a, b) => (a.type === 'frame' ? 0 : 1) - (b.type === 'frame' ? 0 : 1)) // frames behind
  return (
    <svg viewBox={vb} preserveAspectRatio="xMidYMid meet" className="h-full w-full">
      {order.map((n) => (
        <ThumbNode key={n.id} n={n} />
      ))}
    </svg>
  )
}

function ThumbNode({ n }: { n: CanvasNode }) {
  if (n.type === 'frame') {
    return <rect x={n.x} y={n.y} width={n.w} height={n.h} rx={n.radius ?? 2} fill="rgb(var(--surface))" stroke="rgb(var(--edge))" strokeWidth={2} />
  }
  if (n.type === 'comment') {
    return <circle cx={n.x + n.w / 2} cy={n.y + n.h / 2} r={Math.max(8, n.w / 2)} fill="rgb(var(--accent-rgb))" />
  }
  if (n.type === 'pen') {
    const pts = (n.points || []).map((p) => `${n.x + p.x},${n.y + p.y}`).join(' ')
    return <polyline points={pts} fill="none" stroke={n.stroke || 'rgb(var(--ink-400))'} strokeWidth={n.strokeWidth || 3} strokeLinecap="round" strokeLinejoin="round" />
  }
  if (n.type === 'text') {
    // a couple of faint type bars to suggest text
    const lh = Math.max(8, n.h / 3)
    return (
      <g fill={n.textColor || 'rgb(var(--ink-300))'} opacity={0.55}>
        <rect x={n.x} y={n.y + lh * 0.3} width={n.w * 0.9} height={lh * 0.5} rx={2} />
        <rect x={n.x} y={n.y + lh * 1.3} width={n.w * 0.6} height={lh * 0.5} rx={2} />
      </g>
    )
  }
  if (n.type === 'shape' && !isRectish(n.shape)) {
    return (
      <g transform={`translate(${n.x},${n.y}) scale(${n.w / 100},${n.h / 100})`}>
        <path d={shapePath(n.shape ?? 'rect')} fill={n.fill || 'rgb(var(--ink-400))'} stroke={n.stroke || 'none'} strokeWidth={n.strokeWidth ? n.strokeWidth * (100 / Math.max(n.w, n.h)) : 0} />
      </g>
    )
  }
  // sticky / rect-shape / image → filled rounded rect
  const fill = n.type === 'image' ? 'rgb(var(--raised))' : n.fill || n.color || 'rgb(var(--ink-400))'
  const radius = n.radius ?? (n.type === 'sticky' ? 4 : n.shape === 'roundRect' ? 12 : 2)
  return <rect x={n.x} y={n.y} width={n.w} height={n.h} rx={radius} fill={fill} stroke={n.stroke || 'none'} strokeWidth={n.strokeWidth || 0} />
}
