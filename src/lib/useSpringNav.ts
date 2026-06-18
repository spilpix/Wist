import { useCallback, useEffect, useRef, useState } from 'react'

// Spring-loaded navigation ("spring-loaded folders", macOS-style).
//
// While dragging a droppable item, hovering a target (a workspace tab) for `delay` ms
// fires `onSpring(key)` — so the user can grab an item in one section, pause over another
// section's tab to switch the visible page to it, then drop, all in a single gesture.
//
// `enter(key)` is idempotent for the same key: re-firing it (e.g. as `dragover` bubbles up
// from a child element) keeps the running timer instead of restarting it.
export function useSpringNav(onSpring: (key: string) => void, delay = 550) {
  const cb = useRef(onSpring)
  cb.current = onSpring
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const keyRef = useRef<string | null>(null)
  const [armed, setArmed] = useState<string | null>(null) // the target currently counting down

  const cancel = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    keyRef.current = null
    setArmed(null)
  }, [])

  const enter = useCallback(
    (key: string) => {
      if (keyRef.current === key) return // already arming this target — keep the timer alive
      if (timer.current) clearTimeout(timer.current)
      keyRef.current = key
      setArmed(key)
      timer.current = setTimeout(() => {
        const fire = keyRef.current
        timer.current = null
        keyRef.current = null
        setArmed(null)
        if (fire) cb.current(fire)
      }, delay)
    },
    [delay]
  )

  // any end-of-drag anywhere disarms (a drop that missed a target, Esc-cancel, …)
  useEffect(() => {
    const off = () => cancel()
    window.addEventListener('drop', off)
    window.addEventListener('dragend', off)
    return () => {
      window.removeEventListener('drop', off)
      window.removeEventListener('dragend', off)
    }
  }, [cancel])

  return { enter, cancel, armed }
}
