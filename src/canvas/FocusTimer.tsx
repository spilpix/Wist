import { useEffect, useRef, useState } from 'react'
import { Pause, Play, RotateCcw, X } from 'lucide-react'
import { ACTIVE } from './constants'

const PRESETS = [
  { label: '25', mins: 25 },
  { label: '15', mins: 15 },
  { label: '5', mins: 5 },
]

function playDing() {
  try {
    const ctx = new AudioContext()
    const t = ctx.currentTime
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.value = i === 2 ? 1100 : 880
      gain.gain.setValueAtTime(0, t + i * 0.32)
      gain.gain.linearRampToValueAtTime(0.22, t + i * 0.32 + 0.03)
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.32 + 0.28)
      osc.start(t + i * 0.32)
      osc.stop(t + i * 0.32 + 0.32)
    }
    setTimeout(() => ctx.close(), 2000)
  } catch {
    // AudioContext unavailable
  }
}

interface Props {
  onClose: () => void
}

export default function FocusTimer({ onClose }: Props) {
  const [presetIdx, setPresetIdx] = useState(0)
  const [remaining, setRemaining] = useState(PRESETS[0].mins * 60)
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(false)
  const total = PRESETS[presetIdx].mins * 60
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopTick = () => {
    if (tickRef.current) {
      clearInterval(tickRef.current)
      tickRef.current = null
    }
  }

  useEffect(() => {
    if (!running) return
    tickRef.current = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          stopTick()
          setRunning(false)
          setDone(true)
          playDing()
          return 0
        }
        return r - 1
      })
    }, 1000)
    return stopTick
  }, [running])

  const selectPreset = (i: number) => {
    stopTick()
    setRunning(false)
    setDone(false)
    setPresetIdx(i)
    setRemaining(PRESETS[i].mins * 60)
  }

  const reset = () => {
    stopTick()
    setRunning(false)
    setDone(false)
    setRemaining(total)
  }

  const toggle = () => {
    if (done) { reset(); return }
    setRunning((r) => !r)
  }

  const mins = Math.floor(remaining / 60)
  const secs = remaining % 60
  const label = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`

  // SVG circular progress
  const R = 42
  const circ = 2 * Math.PI * R
  const ringColor = done ? '#46A758' : ACTIVE
  const offset = circ * (1 - remaining / total)

  return (
    <div
      className="pointer-events-auto w-60 rounded-2xl border border-edge bg-card p-4"
      style={{ boxShadow: 'var(--float-shadow)' }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* top row: preset chips + close */}
      <div className="mb-4 flex items-center gap-1">
        {PRESETS.map((p, i) => (
          <button
            key={i}
            onClick={() => selectPreset(i)}
            className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
              presetIdx === i ? 'bg-accent text-white' : 'text-zinc-400 hover:bg-highlight hover:text-zinc-200'
            }`}
          >
            {p.label} мин
          </button>
        ))}
        <button onClick={onClose} className="ml-auto rounded-lg p-1 text-zinc-500 transition-colors hover:bg-highlight hover:text-zinc-200">
          <X size={14} />
        </button>
      </div>

      {/* ring */}
      <div className="relative mx-auto mb-4 flex h-32 w-32 items-center justify-center">
        <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
          <circle cx="50" cy="50" r={R} fill="none" stroke="rgb(var(--edge))" strokeWidth="6" />
          <circle
            cx="50" cy="50" r={R}
            fill="none"
            stroke={ringColor}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={offset}
            style={{ transition: running ? 'stroke-dashoffset 0.9s linear' : 'none' }}
          />
        </svg>
        <div className="text-center">
          <div className="text-2xl font-bold tabular-nums tracking-tight" style={{ color: done ? '#46A758' : 'rgb(var(--ink-0))' }}>
            {label}
          </div>
          {done && <div className="mt-0.5 text-[10px] font-semibold text-[#46A758]">Готово!</div>}
          {!done && <div className="mt-0.5 text-[10px] text-zinc-500">{running ? 'в фокусе' : remaining === total ? 'готов' : 'пауза'}</div>}
        </div>
      </div>

      {/* controls */}
      <div className="flex items-center justify-center gap-3">
        <button
          onClick={reset}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-edge text-zinc-500 transition-colors hover:bg-highlight hover:text-zinc-200"
          title="Сбросить"
        >
          <RotateCcw size={14} />
        </button>
        <button
          onClick={toggle}
          className="flex h-12 w-12 items-center justify-center rounded-full text-white transition-colors"
          style={{ background: running ? '#E5484D' : ACTIVE }}
          title={running ? 'Пауза' : done ? 'Заново' : 'Старт'}
        >
          {running ? <Pause size={19} fill="white" strokeWidth={0} /> : <Play size={19} fill="white" strokeWidth={0} />}
        </button>
        {/* spacer to visually center the play button */}
        <div className="h-9 w-9" />
      </div>
    </div>
  )
}
