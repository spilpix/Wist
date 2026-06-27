import { type ReactNode, useEffect, useRef } from 'react'
import { X } from 'lucide-react'

interface Props {
  title: string
  onClose: () => void
  children: ReactNode
  width?: string
}

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])'

export default function Modal({ title, onClose, children, width = 'max-w-xl' }: Props) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const prevFocus = document.activeElement as HTMLElement | null
    const panel = panelRef.current
    const focusables = () =>
      panel ? Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null) : []

    // focus the modal on open — unless a child already grabbed it (e.g. an autoFocus button)
    if (panel && !panel.contains(document.activeElement)) {
      const first = focusables()[0]
      ;(first ?? panel).focus()
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      // trap Tab inside the dialog so focus can't escape to the page behind it
      if (e.key === 'Tab' && panel) {
        const items = focusables()
        if (!items.length) {
          e.preventDefault()
          panel.focus()
          return
        }
        const idx = items.indexOf(document.activeElement as HTMLElement)
        if (e.shiftKey && idx <= 0) {
          e.preventDefault()
          items[items.length - 1].focus()
        } else if (!e.shiftKey && idx === items.length - 1) {
          e.preventDefault()
          items[0].focus()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      prevFocus?.focus?.() // restore focus to whatever opened the modal
    }
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6 animate-fade-in"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`w-full ${width} max-h-[88vh] overflow-y-auto rounded-2xl border border-edge bg-card p-6 outline-none animate-slide-up`}
        style={{ boxShadow: 'var(--palette-shadow)' }}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight text-white">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-zinc-500 transition-colors duration-150 hover:bg-highlight hover:text-white">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
