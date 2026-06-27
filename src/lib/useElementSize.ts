import { useEffect, useState, type RefObject } from 'react'

/**
 * Track an element's client size via ResizeObserver. Returns { w, h } (0×0 until measured).
 * `enabled` gates the observer so callers can defer until their element exists / is ready.
 */
export function useElementSize(ref: RefObject<HTMLElement | null>, enabled = true): { w: number; h: number } {
  const [size, setSize] = useState({ w: 0, h: 0 })
  useEffect(() => {
    if (!enabled) return
    const el = ref.current
    if (!el) return
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight })
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref, enabled])
  return size
}
