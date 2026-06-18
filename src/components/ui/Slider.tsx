import { useRef, useState } from 'react'

/** Accent-filled drag/click slider used for seek + volume across the player.
 *  (The global input[type=range] styles would fight an accent-filled track.) */
export default function Slider({
  value,
  max,
  onChange,
  className = '',
  ariaLabel,
  big = false,
}: {
  value: number
  max: number
  onChange: (v: number) => void
  className?: string
  ariaLabel?: string
  big?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState(false)
  const frac = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0

  const valAt = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect()
    return Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * max
  }
  const onDown = (e: React.PointerEvent) => {
    e.preventDefault()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    setDrag(true)
    onChange(valAt(e.clientX))
  }
  const onMove = (e: React.PointerEvent) => {
    if (drag) onChange(valAt(e.clientX))
  }
  const stop = (e: React.PointerEvent) => {
    setDrag(false)
    try {
      ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
    } catch {
      /* not captured */
    }
  }

  return (
    <div
      ref={ref}
      role="slider"
      aria-label={ariaLabel}
      aria-valuenow={Math.round(frac * 100)}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={stop}
      className={`group/sl relative flex cursor-pointer items-center ${className}`}
    >
      <div className={`${big ? 'h-1.5' : 'h-1'} w-full overflow-hidden rounded-full bg-edge`}>
        <div
          className={`h-full rounded-full transition-colors ${drag ? 'bg-accent' : 'bg-zinc-300 group-hover/sl:bg-accent'}`}
          style={{ width: `${frac * 100}%` }}
        />
      </div>
      <div
        className={`absolute ${big ? 'h-3.5 w-3.5' : 'h-3 w-3'} -translate-x-1/2 rounded-full bg-zinc-100 transition-opacity ${
          drag ? 'opacity-100' : 'opacity-0 group-hover/sl:opacity-100'
        }`}
        style={{ left: `${frac * 100}%` }}
      />
    </div>
  )
}
