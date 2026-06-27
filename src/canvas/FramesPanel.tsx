import { useState } from 'react'
import { ChevronDown, ChevronUp, Play } from 'lucide-react'
import type { CanvasNode } from '../types/models'
import type { TKey, TParams } from '../i18n'

type TFn = (key: TKey, params?: TParams) => string

interface Props {
  frames: CanvasNode[]
  nodes: CanvasNode[]
  onNavigate: (f: CanvasNode) => void
  onPresent: () => void
  t: TFn
}

function Thumb({ frame, nodes }: { frame: CanvasNode; nodes: CanvasNode[] }) {
  const children = nodes.filter((n) => n.frameId === frame.id && n.type !== 'frame')
  return (
    <svg viewBox={`${frame.x} ${frame.y} ${frame.w} ${frame.h}`} preserveAspectRatio="xMidYMid meet" className="h-12 w-20 rounded-lg border border-edge bg-bg">
      <rect x={frame.x} y={frame.y} width={frame.w} height={frame.h} fill="rgb(var(--surface))" />
      {children.map((n) => (
        <rect
          key={n.id}
          x={n.x}
          y={n.y}
          width={n.w}
          height={n.h}
          rx={Math.min(n.w, n.h) * 0.08}
          fill={n.fill || n.color || 'rgb(var(--ink-500))'}
          opacity={0.85}
        />
      ))}
    </svg>
  )
}

export default function FramesPanel({ frames, nodes, onNavigate, onPresent, t }: Props) {
  const [open, setOpen] = useState(true)
  if (!frames.length) return null
  return (
    <div className="pointer-events-auto rounded-2xl border border-edge bg-card ring-1 ring-black/5 backdrop-blur" style={{ boxShadow: 'var(--float-shadow)' }}>
      <div className="flex items-center gap-2 px-2.5 py-1.5">
        <button className="flex items-center gap-1 text-xs font-semibold text-[rgb(var(--ink-300))]" onClick={() => setOpen((v) => !v)}>
          {open ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
          {t('canvas.frames', { n: frames.length })}
        </button>
        <button
          className="ml-auto flex items-center gap-1 rounded-lg bg-accent px-2 py-1 text-[11px] font-medium text-[#fff] transition-colors hover:bg-accent-hover"
          onClick={onPresent}
          title={t('canvas.present')}
        >
          <Play size={12} /> {t('canvas.present')}
        </button>
      </div>
      {open && (
        <div className="flex max-w-[60vw] gap-2 overflow-x-auto px-2.5 pb-2.5">
          {frames.map((f, i) => (
            <button key={f.id} onClick={() => onNavigate(f)} className="group shrink-0 text-left" title={f.text || `${i + 1}`}>
              <Thumb frame={f} nodes={nodes} />
              <div className="mt-0.5 max-w-20 truncate text-[10px] text-zinc-500 group-hover:text-zinc-300">
                {i + 1}. {f.text || t('canvas.frame')}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
