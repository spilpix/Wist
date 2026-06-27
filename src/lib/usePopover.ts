import { useEffect, useRef, useState } from 'react'

/**
 * Shared dropdown/popover plumbing: open state + close on outside-click + Escape.
 * Attach the returned `ref` to the popover's container element; each menu keeps its
 * own trigger and panel JSX. Replaces the identical useEffect that was hand-copied
 * across NewMenu / ProfileMenu / AccentSwatch / etc. (the source of dropdown drift).
 */
export function usePopover<T extends HTMLElement = HTMLDivElement>() {
  const [open, setOpen] = useState(false)
  const ref = useRef<T | null>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])
  return { open, setOpen, ref }
}
