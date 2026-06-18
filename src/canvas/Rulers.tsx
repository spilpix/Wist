import { useEffect, useRef, useState } from 'react'
import { RULER_SIZE } from './constants'
import type { Box } from './geometry'

interface Props {
  cam: { x: number; y: number; k: number }
  width: number
  height: number
  selBox?: Box | null // selection extent (world) — highlighted on both rulers, Figma-style
}

// nearest "nice" 1 / 2 / 5 × 10ⁿ step ≥ raw — keeps tick labels round at any zoom
function niceStep(raw: number): number {
  const pow = Math.pow(10, Math.floor(Math.log10(raw)))
  const f = raw / pow
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10
  return nice * pow
}

// compact label for a world coordinate (5000 → 5k, keeps small values exact)
function fmt(v: number): string {
  const a = Math.abs(v)
  if (a >= 10000) return `${v / 1000}k`
  return String(Math.round(v))
}

/**
 * Figma-style rulers: top (X) + left (Y) bands drawn on a single canvas overlay,
 * each tick labelled in WORLD coordinates. The major step adapts to zoom (LOD) so
 * numbers never collide. The selection's extent is highlighted on both rulers.
 * Pure visual — guide drag-out is handled by the board (it owns the world transform).
 */
export default function Rulers({ cam, width, height, selBox }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const obs = new MutationObserver(() => setTick((t) => t + 1))
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
    if (!ctx || cam.k <= 0) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, W, H)

    const cs = getComputedStyle(cv)
    const ink = (cs.getPropertyValue('--ink-0').trim() || '128 128 128').replace(/\s+/g, ',')
    // a distinct raised bar — stands clear of the canvas bg AND the sidebar, both themes
    const band = (cs.getPropertyValue('--raised').trim() || '45 45 45').replace(/\s+/g, ',')
    const accent = (cs.getPropertyValue('--accent-rgb').trim() || '35 131 225').replace(/\s+/g, ',')
    const R = RULER_SIZE

    const labelColor = `rgba(${ink},0.6)`
    const majorTick = `rgba(${ink},0.5)`
    const minorTick = `rgba(${ink},0.24)`

    // ── opaque "safe bars": fully cover content that scrolls under the rulers ──
    ctx.fillStyle = `rgb(${band})`
    ctx.fillRect(0, 0, W, R) // top
    ctx.fillRect(0, 0, R, H) // left
    ctx.fillRect(0, 0, R, R) // corner square
    // crisp separating border so the bar never melts into the board or sidebar
    ctx.fillStyle = `rgba(${ink},0.16)`
    ctx.fillRect(0, R - 1, W, 1)
    ctx.fillRect(R - 1, 0, 1, H)

    // adaptive step: smallest nice step whose major ticks sit ≥ ~76px apart on screen
    const major = niceStep(78 / cam.k)
    const minor = major / 5
    ctx.font = '10px ui-sans-serif, system-ui, sans-serif'
    ctx.textBaseline = 'middle'

    // ── selection highlight bands ──
    if (selBox && selBox.w >= 0 && selBox.h >= 0) {
      ctx.fillStyle = `rgba(${accent},0.16)`
      const sx0 = cam.x + selBox.x * cam.k
      const sx1 = cam.x + (selBox.x + selBox.w) * cam.k
      ctx.fillRect(Math.min(sx0, sx1), 0, Math.abs(sx1 - sx0), R)
      const sy0 = cam.y + selBox.y * cam.k
      const sy1 = cam.y + (selBox.y + selBox.h) * cam.k
      ctx.fillRect(0, Math.min(sy0, sy1), R, Math.abs(sy1 - sy0))
    }

    // ── top ruler (X) ──
    const worldLeft = (R - cam.x) / cam.k
    const firstX = Math.ceil(worldLeft / minor) * minor
    ctx.textAlign = 'left'
    for (let wx = firstX; ; wx += minor) {
      const sx = cam.x + wx * cam.k
      if (sx > W) break
      if (sx < R - 0.5) continue
      const isMajor = Math.abs(wx / major - Math.round(wx / major)) < 1e-6
      ctx.fillStyle = isMajor ? majorTick : minorTick
      ctx.fillRect(Math.round(sx) + 0.5, isMajor ? R - 7 : R - 4, 0.5, isMajor ? 7 : 4)
      if (isMajor) {
        ctx.fillStyle = labelColor
        ctx.fillText(fmt(wx), Math.round(sx) + 3, 7)
      }
    }

    // ── left ruler (Y) — labels rotated to read vertically ──
    const worldTop = (R - cam.y) / cam.k
    const firstY = Math.ceil(worldTop / minor) * minor
    for (let wy = firstY; ; wy += minor) {
      const sy = cam.y + wy * cam.k
      if (sy > H) break
      if (sy < R - 0.5) continue
      const isMajor = Math.abs(wy / major - Math.round(wy / major)) < 1e-6
      ctx.fillStyle = isMajor ? majorTick : minorTick
      ctx.fillRect(isMajor ? R - 7 : R - 4, Math.round(sy) + 0.5, isMajor ? 7 : 4, 0.5)
      if (isMajor) {
        ctx.save()
        ctx.translate(7, Math.round(sy) + 3)
        ctx.rotate(-Math.PI / 2)
        ctx.fillStyle = labelColor
        ctx.textAlign = 'right'
        ctx.fillText(fmt(wy), 0, 0)
        ctx.restore()
      }
    }
  }, [cam.x, cam.y, cam.k, width, height, selBox, tick])

  return <canvas ref={ref} className="pointer-events-none absolute inset-0 z-20" style={{ width, height }} />
}
