import { useCallback, useEffect, type MutableRefObject } from 'react'
import type { CanvasData } from '../types/models'

type Cam = { x: number; y: number; k: number }

// stable signature of a board's persisted state — used to skip no-op autosaves
export const sigOf = (id: number, nm: string, d: CanvasData, c: Cam) =>
  JSON.stringify({ id, nm, n: d.nodes, e: d.edges, g: d.guides, v: c })

interface BoardLatest {
  id: number
  data: CanvasData
  name: string
  cam: Cam
}

/**
 * Owns a canvas board's save lifecycle — extracted from CanvasBoard's ~2700-line body:
 *  - persist (write to disk + remember the signature)
 *  - debounced autosave (skips no-op writes; never persists the presentation camera)
 *  - flush-on-leave (board switch / unmount)
 *  - a 30s safety net
 * The shared refs (latest / readyRef / baseline) are passed in: the board's render still
 * writes `latest.current` each frame, and the load effect still seeds baseline / readyRef.
 */
export function useCanvasPersistence(opts: {
  canvasId: number
  name: string
  data: CanvasData
  cam: Cam
  present: number | null
  latest: MutableRefObject<BoardLatest>
  readyRef: MutableRefObject<boolean>
  baseline: MutableRefObject<string>
}): void {
  const { canvasId, name, data, cam, present, latest, readyRef, baseline } = opts

  // write a board's state to disk and remember its signature (skips later no-ops)
  const persist = useCallback(
    (id: number, nm: string, d: CanvasData, c: Cam) => {
      window.wist.canvas.update(id, { name: nm, data: { ...d, viewport: c } }).catch(() => {})
      baseline.current = sigOf(id, nm, d, c)
    },
    [baseline]
  )

  // autosave: debounced; skips no-op writes and never persists the present camera
  useEffect(() => {
    if (!readyRef.current || present != null) return
    if (sigOf(canvasId, name, data, cam) === baseline.current) return
    const h = setTimeout(() => persist(canvasId, name, data, cam), 700)
    return () => clearTimeout(h)
  }, [data, name, cam, canvasId, present, persist, readyRef, baseline])

  // flush THIS board's pending edits when leaving it (switch or unmount)
  useEffect(() => {
    const id2 = canvasId
    return () => {
      const l = latest.current
      if (readyRef.current && sigOf(id2, l.name, l.data, l.cam) !== baseline.current) persist(id2, l.name, l.data, l.cam)
    }
  }, [canvasId, persist, latest, readyRef, baseline])

  // 30s safety net
  useEffect(() => {
    const iv = setInterval(() => {
      const l = latest.current
      if (readyRef.current && sigOf(l.id, l.name, l.data, l.cam) !== baseline.current) persist(l.id, l.name, l.data, l.cam)
    }, 30000)
    return () => clearInterval(iv)
  }, [persist, latest, readyRef, baseline])
}
