import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

interface Tip {
  text: string
  kbd: string | null
  rect: DOMRect
  side: string
  cursor: boolean // follow the pointer instead of anchoring to the element (tall handles)
  cx: number
  cy: number
}

const DELAY = 350
const MARGIN = 8 // keep this far from the viewport edge

/**
 * One global tooltip for the whole app. It intercepts ANY element with a `data-tip`
 * (our controls) or a native `title` (everything else), suppresses the native OS box,
 * and renders a single Notion-style chip — always the same style, always clamped inside
 * the viewport. Elements with `data-tip-cursor` follow the pointer (for tall/edge
 * handles like the sidebar resizer). Mount once at the app root.
 */
export default function TooltipLayer() {
  const [tip, setTip] = useState<Tip | null>(null)
  const chipRef = useRef<HTMLDivElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const current = useRef<HTMLElement | null>(null)
  const mouse = useRef({ x: 0, y: 0 })

  // place the chip at a point following the pointer, clamped to the viewport
  const placeAtCursor = (x: number, y: number) => {
    const chip = chipRef.current
    if (!chip) return
    const left = Math.max(MARGIN, Math.min(x + 14, window.innerWidth - chip.offsetWidth - MARGIN))
    const top = Math.max(MARGIN, Math.min(y + 18, window.innerHeight - chip.offsetHeight - MARGIN))
    chip.style.left = `${left}px`
    chip.style.top = `${top}px`
    chip.style.opacity = '1'
  }

  useEffect(() => {
    const restore = () => {
      const el = current.current
      if (el) {
        if (el.dataset.tipText != null) {
          if (el.isConnected && !el.hasAttribute('title')) el.setAttribute('title', el.dataset.tipText)
          delete el.dataset.tipText
        }
        if (el.dataset.tipAria === '1') {
          el.removeAttribute('aria-label')
          delete el.dataset.tipAria
        }
      }
      current.current = null
    }
    const hide = () => {
      clearTimeout(timer.current)
      restore()
      setTip(null)
    }

    const onMove = (e: MouseEvent) => {
      mouse.current.x = e.clientX
      mouse.current.y = e.clientY
      if (current.current?.hasAttribute('data-tip-cursor') && chipRef.current) placeAtCursor(e.clientX, e.clientY)
    }
    const onOver = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest?.('[data-tip],[title]') as HTMLElement | null
      if (!el || el === current.current) return
      const dataTip = el.getAttribute('data-tip')
      const text = (dataTip ?? el.getAttribute('title'))?.trim()
      if (!text) return
      hide()
      current.current = el
      if (dataTip == null) {
        el.dataset.tipText = el.getAttribute('title') ?? ''
        el.removeAttribute('title')
        if (!el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby')) {
          el.setAttribute('aria-label', text)
          el.dataset.tipAria = '1'
        }
      }
      const kbd = el.getAttribute('data-tip-kbd')
      const side = el.getAttribute('data-tip-side') ?? ''
      const cursor = el.hasAttribute('data-tip-cursor')
      timer.current = setTimeout(() => {
        if (!el.isConnected) return
        setTip({ text, kbd, rect: el.getBoundingClientRect(), side, cursor, cx: mouse.current.x, cy: mouse.current.y })
      }, DELAY)
    }
    const onOut = (e: MouseEvent) => {
      const el = current.current
      if (!el) return
      const to = e.relatedTarget as Node | null
      if (to && el.contains(to)) return
      hide()
    }

    document.addEventListener('mousemove', onMove, true)
    document.addEventListener('mouseover', onOver, true)
    document.addEventListener('mouseout', onOut, true)
    document.addEventListener('mousedown', hide, true)
    document.documentElement.addEventListener('mouseleave', hide)
    window.addEventListener('scroll', hide, true)
    window.addEventListener('resize', hide)
    window.addEventListener('blur', hide)
    return () => {
      document.removeEventListener('mousemove', onMove, true)
      document.removeEventListener('mouseover', onOver, true)
      document.removeEventListener('mouseout', onOut, true)
      document.removeEventListener('mousedown', hide, true)
      document.documentElement.removeEventListener('mouseleave', hide)
      window.removeEventListener('scroll', hide, true)
      window.removeEventListener('resize', hide)
      window.removeEventListener('blur', hide)
      hide()
    }
  }, [])

  // position + clamp once the chip is measured (runs before paint, so no flicker)
  useLayoutEffect(() => {
    const chip = chipRef.current
    if (!tip || !chip) return
    if (tip.cursor) {
      placeAtCursor(tip.cx, tip.cy)
      return
    }
    const cw = chip.offsetWidth
    const ch = chip.offsetHeight
    const vw = window.innerWidth
    const vh = window.innerHeight
    const r = tip.rect
    let side = tip.side || (r.left < 72 ? 'right' : 'bottom')
    let left: number
    let top: number
    if (side === 'right') {
      left = r.right + 8
      top = r.top + r.height / 2 - ch / 2
      if (left + cw > vw - MARGIN) left = r.left - cw - 8
    } else if (side === 'top') {
      left = r.left + r.width / 2 - cw / 2
      top = r.top - ch - 6
      if (top < MARGIN) top = r.bottom + 6
    } else {
      left = r.left + r.width / 2 - cw / 2
      top = r.bottom + 6
      if (top + ch > vh - MARGIN) top = r.top - ch - 6
    }
    left = Math.max(MARGIN, Math.min(left, vw - cw - MARGIN))
    top = Math.max(MARGIN, Math.min(top, vh - ch - MARGIN))
    chip.style.left = `${left}px`
    chip.style.top = `${top}px`
    chip.style.opacity = '1'
  }, [tip])

  if (!tip) return null
  return createPortal(
    <div
      ref={chipRef}
      role="tooltip"
      style={{ position: 'fixed', left: 0, top: 0, opacity: 0, boxShadow: 'var(--float-shadow)' }}
      className="pointer-events-none z-[200] flex max-w-[min(320px,calc(100vw-16px))] items-center gap-1.5 rounded-lg border border-edge bg-white px-2 py-1 text-[12px] font-medium leading-snug text-bg transition-opacity duration-100"
    >
      <span className="min-w-0">{tip.text}</span>
      {tip.kbd && <span className="shrink-0 text-[11px] font-normal text-bg/60">{tip.kbd}</span>}
    </div>,
    document.body,
  )
}
