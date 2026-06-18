import { useEffect, useRef, useState } from 'react'
import { GRID } from './constants'

interface Props {
  cam: { x: number; y: number; k: number }
  width: number
  height: number
  mode: 'dots' | 'lines' | 'none'
}

/**
 * Infinite canvas grid. Draws ONLY the lines currently in the viewport, aligned
 * to world coords via modulo, with two levels crossfaded by zoom (Level-of-Detail)
 * so the grid never gets too dense or vanishes. Re-renders on camera / size change.
 */
export default function GridCanvas({ cam, width, height, mode }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [themeTick, setThemeTick] = useState(0)
  // redraw with the new ink colour when the app theme flips
  useEffect(() => {
    const obs = new MutationObserver(() => setThemeTick((t) => t + 1))
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => obs.disconnect()
  }, [])
  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const dpr = window.devicePixelRatio || 1
    const W = Math.max(1, Math.floor(width))
    const H = Math.max(1, Math.floor(height))
    if (cv.width !== Math.floor(W * dpr) || cv.height !== Math.floor(H * dpr)) {
      cv.width = Math.floor(W * dpr)
      cv.height = Math.floor(H * dpr)
    }
    const ctx = cv.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, W, H)
    if (mode === 'none' || cam.k <= 0) return

    // theme ink colour ("R G B" → "R,G,B")
    const ink = (getComputedStyle(cv).getPropertyValue('--ink-0').trim() || '128 128 128').replace(/\s+/g, ',')
    // Miro-style: sparse + very faint, roughly constant on-screen spacing
    const maxAlpha = mode === 'dots' ? 0.26 : 0.13
    const target = mode === 'dots' ? 46 : 52 // desired screen spacing of the primary grid

    // primary level: smallest GRID*2^n whose screen spacing ≥ target (keeps spacing ∈ [target, 2·target))
    let cell = GRID
    while (cell * cam.k < target) cell *= 2
    while (cell * cam.k >= target * 2) cell /= 2
    const sp = cell * cam.k
    const fineSp = sp / 2
    const fineAlpha = Math.max(0, Math.min(1, (fineSp - target / 2) / (target / 2)))

    const drawLevel = (s: number, alpha: number) => {
      if (alpha <= 0.02 || s < 4) return
      const startX = ((cam.x % s) + s) % s
      const startY = ((cam.y % s) + s) % s
      if (mode === 'lines') {
        ctx.strokeStyle = `rgba(${ink},${alpha})`
        ctx.lineWidth = 1
        ctx.beginPath()
        for (let x = startX; x <= W; x += s) {
          ctx.moveTo(Math.round(x) + 0.5, 0)
          ctx.lineTo(Math.round(x) + 0.5, H)
        }
        for (let y = startY; y <= H; y += s) {
          ctx.moveTo(0, Math.round(y) + 0.5)
          ctx.lineTo(W, Math.round(y) + 0.5)
        }
        ctx.stroke()
      } else {
        if ((W / s) * (H / s) > 14000) return // perf guard
        ctx.fillStyle = `rgba(${ink},${alpha})`
        const r = 1
        for (let x = startX; x <= W; x += s) {
          for (let y = startY; y <= H; y += s) {
            ctx.fillRect(x - r, y - r, r * 2, r * 2)
          }
        }
      }
    }

    drawLevel(fineSp, fineAlpha * maxAlpha)
    drawLevel(sp, maxAlpha)
  }, [cam.x, cam.y, cam.k, width, height, mode, themeTick])

  return <canvas ref={ref} className="pointer-events-none absolute inset-0" style={{ width, height }} />
}
