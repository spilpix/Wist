import { type ReactNode } from 'react'

/**
 * A thin circular progress ring. `value` is 0..1. Children render centered inside
 * (e.g. a small percentage or count). Used on hub cards and the hub dashboard.
 */
export default function ProgressRing({
  value,
  size = 34,
  stroke = 4,
  color = 'var(--accent)',
  track = 'rgb(var(--edge))',
  children,
}: {
  value: number
  size?: number
  stroke?: number
  color?: string
  track?: string
  children?: ReactNode
}) {
  const v = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const off = c * (1 - v)
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={off}
          style={{ transition: 'stroke-dashoffset 0.4s ease' }}
        />
      </svg>
      {children != null && (
        <div className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-zinc-200">{children}</div>
      )}
    </div>
  )
}
