import { useRef } from 'react'
import type { CanvasNode, CanvasViewport } from '../types/models'
import { bbox } from './geometry'

const MM_W = 188
const MM_H = 128
const PAD = 8

interface Props {
  nodes: CanvasNode[]
  cam: CanvasViewport
  boardW: number
  boardH: number
  onPanTo: (worldCx: number, worldCy: number) => void
}

/** Bottom-right navigator: all nodes + the current viewport, drag to move the camera. */
export default function Minimap({ nodes, cam, boardW, boardH, onPanTo }: Props) {
  const ref = useRef<SVGSVGElement>(null)
  const dragging = useRef(false)

  // visible world rectangle
  const view = {
    x: -cam.x / cam.k,
    y: -cam.y / cam.k,
    w: boardW / cam.k,
    h: boardH / cam.k,
  }
  const content = bbox(nodes) ?? view
  const minX = Math.min(content.x, view.x)
  const minY = Math.min(content.y, view.y)
  const maxX = Math.max(content.x + content.w, view.x + view.w)
  const maxY = Math.max(content.y + content.h, view.y + view.h)
  const bw = Math.max(1, maxX - minX)
  const bh = Math.max(1, maxY - minY)
  const scale = Math.min((MM_W - PAD * 2) / bw, (MM_H - PAD * 2) / bh)
  const offX = PAD + ((MM_W - PAD * 2) - bw * scale) / 2
  const offY = PAD + ((MM_H - PAD * 2) - bh * scale) / 2
  const toMM = (wx: number, wy: number) => ({ x: offX + (wx - minX) * scale, y: offY + (wy - minY) * scale })

  const navTo = (clientX: number, clientY: number) => {
    const r = ref.current!.getBoundingClientRect()
    const mx = clientX - r.left
    const my = clientY - r.top
    const wx = (mx - offX) / scale + minX
    const wy = (my - offY) / scale + minY
    onPanTo(wx, wy)
  }

  const vp = toMM(view.x, view.y)
  return (
    <svg
      ref={ref}
      width={MM_W}
      height={MM_H}
      className="cursor-pointer rounded-xl border border-edge bg-surface backdrop-blur"
      style={{ boxShadow: 'var(--float-shadow)' }}
      onPointerDown={(e) => {
        dragging.current = true
        ;(e.target as Element).setPointerCapture?.(e.pointerId)
        navTo(e.clientX, e.clientY)
      }}
      onPointerMove={(e) => dragging.current && navTo(e.clientX, e.clientY)}
      onPointerUp={() => (dragging.current = false)}
    >
      {nodes.map((n) => {
        const p = toMM(n.x, n.y)
        return (
          <rect
            key={n.id}
            x={p.x}
            y={p.y}
            width={Math.max(2, n.w * scale)}
            height={Math.max(2, n.h * scale)}
            rx={1.5}
            fill={n.fill || n.color || 'rgb(var(--ink-500))'}
            opacity={0.7}
          />
        )
      })}
      <rect
        x={vp.x}
        y={vp.y}
        width={view.w * scale}
        height={view.h * scale}
        fill="rgb(var(--accent-rgb) / 0.12)"
        stroke="rgb(var(--accent-rgb))"
        strokeWidth={1.5}
        rx={2}
      />
    </svg>
  )
}
