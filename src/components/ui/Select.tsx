import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

/**
 * Themed Select — a styled trigger + popover list that replaces the native <select>
 * (whose OS dropdown ignores the app theme/font). Keyboard-navigable, closes on
 * outside-click/Escape. Drop-in for simple value/label option lists.
 */
export default function Select({
  value,
  onChange,
  options,
  placeholder = '—',
  disabled,
  className = '',
  size = 'md',
  align = 'left',
  ariaLabel,
}: {
  value: string
  onChange: (v: string) => void
  options: SelectOption[]
  placeholder?: string
  disabled?: boolean
  className?: string
  size?: 'sm' | 'md'
  align?: 'left' | 'right'
  ariaLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const listId = useId()

  const selected = options.find((o) => o.value === value)
  const pad = size === 'sm' ? 'px-2 py-1 text-[12.5px]' : 'px-2.5 py-1.5 text-[13px]'

  const openMenu = useCallback(() => {
    if (disabled) return
    const i = options.findIndex((o) => o.value === value)
    setActive(i < 0 ? 0 : i)
    setOpen(true)
  }, [disabled, options, value])

  const choose = useCallback(
    (opt: SelectOption) => {
      if (opt.disabled) return
      onChange(opt.value)
      setOpen(false)
    },
    [onChange]
  )

  // close on outside click / Escape / scroll away
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // keep the active row in view
  useEffect(() => {
    if (open) listRef.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [open, active])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault()
        openMenu()
      }
      return
    }
    if (e.key === 'Escape') return (e.preventDefault(), setOpen(false))
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => {
        let n = i
        do n = (n + 1) % options.length
        while (options[n]?.disabled && n !== i)
        return n
      })
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => {
        let n = i
        do n = (n - 1 + options.length) % options.length
        while (options[n]?.disabled && n !== i)
        return n
      })
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      const opt = options[active]
      if (opt) choose(opt)
    }
  }

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        aria-controls={listId}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKeyDown}
        className={`flex w-full items-center justify-between gap-2 rounded-lg border border-edge bg-field ${pad} text-left text-zinc-200 transition-colors hover:border-zinc-600 focus-visible:outline-none disabled:opacity-50 ${
          open ? 'border-accent' : ''
        }`}
      >
        <span className={`min-w-0 flex-1 truncate ${selected ? '' : 'text-zinc-500'}`}>{selected ? selected.label : placeholder}</span>
        <ChevronDown size={14} className={`shrink-0 text-zinc-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          ref={listRef}
          id={listId}
          role="listbox"
          className={`absolute z-50 mt-1 max-h-60 min-w-full overflow-y-auto rounded-lg border border-edge bg-raised p-1 shadow-lg ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          {options.map((opt, i) => {
            const isSel = opt.value === value
            return (
              <button
                key={opt.value}
                type="button"
                data-i={i}
                role="option"
                aria-selected={isSel}
                disabled={opt.disabled}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(opt)}
                className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors disabled:opacity-40 ${
                  i === active ? 'bg-highlight text-zinc-100' : 'text-zinc-300'
                }`}
              >
                <span className="min-w-0 flex-1 truncate">{opt.label}</span>
                {isSel && <Check size={14} className="shrink-0 text-accent-bright" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
