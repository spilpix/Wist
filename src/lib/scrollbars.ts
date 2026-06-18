// Overlay-scrollbar behaviour: while an element is actively scrolled, mark it
// `.scrolling` so the custom thumb fades in (see the `::-webkit-scrollbar` rules
// in index.css); remove the mark a short moment after the wheel goes idle so the
// thumb fades back out. Global, capture-phase, passive — one listener for the
// whole app, works for every nested scroll container.

const HIDE_DELAY = 850 // ms of no scroll before the thumb fades away
const timers = new WeakMap<Element, number>()

function mark(el: Element): void {
  el.classList.add('scrolling')
  const prev = timers.get(el)
  if (prev) clearTimeout(prev)
  timers.set(
    el,
    window.setTimeout(() => el.classList.remove('scrolling'), HIDE_DELAY)
  )
}

function onScroll(e: Event): void {
  // scroll on the document reports `document` as target → use the scrolling root
  const t = e.target
  const el = t instanceof Element ? t : document.scrollingElement ?? document.documentElement
  if (el instanceof Element) mark(el)
}

let started = false

export function initScrollbars(): void {
  if (started) return
  started = true
  document.addEventListener('scroll', onScroll, { capture: true, passive: true })
}
