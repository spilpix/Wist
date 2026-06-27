import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react'
import { MIN_ZOOM, MAX_ZOOM } from './constants'
import { bbox, type Box, type Pt } from './geometry'
import type { CanvasNode } from '../types/models'

export interface Camera {
  x: number
  y: number
  k: number
}

/**
 * The board's camera/viewport — extracted from CanvasBoard's body. Owns cam state + its
 * mirror ref + the in-flight tween id, and all the camera math: screen⇄world conversion,
 * zoom (at a point / centred), fit-to-box (instant + animated), fit-to-content, and a
 * smooth tween for navigation jumps. `getNodes` (kept stable by the caller) feeds
 * fit-to-content its bounds; `boardRef` provides the viewport rect.
 */
export function useViewport(opts: { boardRef: MutableRefObject<HTMLDivElement | null>; getNodes: () => CanvasNode[] }) {
  const { boardRef, getNodes } = opts
  const [cam, setCam] = useState<Camera>({ x: 200, y: 140, k: 1 })
  const camRef = useRef(cam)
  camRef.current = cam
  const camAnim = useRef<number | null>(null) // rAF id of an in-flight camera tween

  // ── coordinate helpers ────────────────────────────────────────────────────────
  const toWorld = useCallback(
    (cx: number, cy: number): Pt => {
      const r = boardRef.current!.getBoundingClientRect()
      const c = camRef.current
      return { x: (cx - r.left - c.x) / c.k, y: (cy - r.top - c.y) / c.k }
    },
    [boardRef]
  )
  const toScreen = (wx: number, wy: number): Pt => ({ x: cam.x + wx * cam.k, y: cam.y + wy * cam.k })

  // ── camera ────────────────────────────────────────────────────────────────────
  // smooth camera tween for NAVIGATION jumps (fit / frames / search / zoom buttons).
  // Export + presentation keep the instant `fitBox` so capture lands on a settled frame.
  const cancelCamAnim = useCallback(() => {
    if (camAnim.current != null) {
      cancelAnimationFrame(camAnim.current)
      camAnim.current = null
    }
  }, [])
  const animateCamTo = useCallback(
    (target: Camera, dur = 280) => {
      cancelCamAnim()
      const start = camRef.current
      const t0 = performance.now()
      const ease = (p: number) => 1 - Math.pow(1 - p, 3) // easeOutCubic
      const step = (now: number) => {
        const p = Math.min(1, (now - t0) / dur)
        const e = ease(p)
        setCam({ x: start.x + (target.x - start.x) * e, y: start.y + (target.y - start.y) * e, k: start.k + (target.k - start.k) * e })
        camAnim.current = p < 1 ? requestAnimationFrame(step) : null
      }
      camAnim.current = requestAnimationFrame(step)
    },
    [cancelCamAnim]
  )

  const zoomAt = (sx: number, sy: number, factor: number) =>
    setCam((c) => {
      const nk = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, c.k * factor))
      return { k: nk, x: sx - ((sx - c.x) / c.k) * nk, y: sy - ((sy - c.y) / c.k) * nk }
    })
  const zoomCenter = (factor: number) => {
    const r = boardRef.current?.getBoundingClientRect()
    const sx = (r?.width ?? 800) / 2
    const sy = (r?.height ?? 600) / 2
    const c = camRef.current
    const nk = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, c.k * factor))
    animateCamTo({ k: nk, x: sx - ((sx - c.x) / c.k) * nk, y: sy - ((sy - c.y) / c.k) * nk }, 170)
  }
  const fitBox = (box: Box, margin = 40) => {
    const r = boardRef.current?.getBoundingClientRect()
    if (!r) return
    const k = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.min((r.width - margin * 2) / box.w, (r.height - margin * 2) / box.h)))
    setCam({ k, x: (r.width - box.w * k) / 2 - box.x * k, y: (r.height - box.h * k) / 2 - box.y * k })
  }
  // animated counterpart of fitBox — for user-facing navigation (frames panel, etc.)
  const animateToBox = (box: Box, margin = 60) => {
    const r = boardRef.current?.getBoundingClientRect()
    if (!r) return
    const k = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.min((r.width - margin * 2) / box.w, (r.height - margin * 2) / box.h)))
    animateCamTo({ k, x: (r.width - box.w * k) / 2 - box.x * k, y: (r.height - box.h * k) / 2 - box.y * k })
  }
  const fit = useCallback(
    (animate = false) => {
      const b = bbox(getNodes())
      const r = boardRef.current?.getBoundingClientRect()
      if (!b || !r) {
        setCam({ x: 200, y: 140, k: 1 })
        return
      }
      const pad = 80
      const k = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.min((r.width - pad * 2) / b.w, (r.height - pad * 2) / b.h, 1.5)))
      const target = { k, x: (r.width - b.w * k) / 2 - b.x * k, y: (r.height - b.h * k) / 2 - b.y * k }
      animate ? animateCamTo(target) : setCam(target)
    },
    [getNodes, animateCamTo, boardRef]
  )

  // stop any in-flight camera tween when leaving the board
  useEffect(() => () => cancelCamAnim(), [cancelCamAnim])

  return { cam, setCam, camRef, toWorld, toScreen, cancelCamAnim, animateCamTo, zoomAt, zoomCenter, fitBox, animateToBox, fit }
}
