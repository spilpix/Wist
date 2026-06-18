import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react'
import TimeSelect from './TimeSelect'
import { useI18n } from '../../i18n'

// YYYY-MM-DD <-> local Date helpers (no timezone drift)
function parse(v: string): Date | null {
  if (!v) return null
  const [y, m, d] = v.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}
function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

/**
 * A clean, light, theme-aware date picker (Notion-style popover calendar).
 * Replaces the native <input type="date"> which can't be styled.
 */
export default function DatePicker({
  value,
  onChange,
  placeholder,
  variant = 'field',
  title,
  withTime = false,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  variant?: 'field' | 'icon'
  title?: string
  withTime?: boolean
}) {
  const { lang } = useI18n()
  const locale = lang === 'ru' ? 'ru-RU' : 'en-US'
  // value may be 'YYYY-MM-DD' or (withTime) 'YYYY-MM-DD HH:MM'
  const datePart = value ? value.slice(0, 10) : ''
  const timePart = value && value.length > 10 ? value.slice(11, 16) : ''
  const selected = parse(datePart)
  const today = new Date()
  const combine = (date: string, time: string) => (time ? `${date} ${time}` : date)
  const [open, setOpen] = useState(false)
  const [view, setView] = useState(() => selected ?? today)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)

  // keep the calendar's month in sync whenever the value is changed from outside
  useEffect(() => {
    const p = parse(datePart)
    if (p) setView(p)
  }, [datePart])

  // position the portal popover relative to the trigger; flip up if it would overflow.
  // reposition (not close) on scroll/resize so it stays glued to the field inside modals.
  useLayoutEffect(() => {
    if (!open) return
    const place = () => {
      const r = btnRef.current?.getBoundingClientRect()
      if (!r) return
      const H = withTime ? 430 : 360
      const openUp = r.bottom + H > window.innerHeight && r.top - H > 0
      const left = Math.max(8, Math.min(r.left, window.innerWidth - 276))
      setPos({ top: openUp ? r.top - H + 6 : r.bottom + 6, left })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, withTime])

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      const target = e.target as Node
      if (btnRef.current?.contains(target) || popRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const weekdays = useMemo(() => {
    // Monday-first short weekday names in the app's language
    const base = new Date(2024, 0, 1) // a Monday
    const fmt = new Intl.DateTimeFormat(locale, { weekday: 'short' })
    return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(base.getFullYear(), base.getMonth(), base.getDate() + i)))
  }, [locale])

  const grid = useMemo(() => {
    const first = new Date(view.getFullYear(), view.getMonth(), 1)
    const offset = (first.getDay() + 6) % 7 // Monday = 0
    const start = new Date(first.getFullYear(), first.getMonth(), 1 - offset)
    const cells: Date[] = []
    for (let i = 0; i < 42; i++) cells.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i))
    return cells
  }, [view])

  const monthLabel = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(view)
  const display = selected
    ? new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(selected) + (timePart ? `, ${timePart}` : '')
    : ''

  return (
    <>
      {variant === 'icon' ? (
        <button
          ref={btnRef}
          type="button"
          onClick={() => setOpen((o) => !o)}
          title={title || display || placeholder}
          className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors duration-150 ${
            display ? 'bg-highlight text-zinc-100' : 'text-zinc-500 hover:bg-highlight hover:text-zinc-200'
          }`}
        >
          <CalendarDays size={16} />
        </button>
      ) : (
        <button
          ref={btnRef}
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="input flex w-full items-center gap-2 text-left"
        >
          <CalendarDays size={15} className="shrink-0 text-zinc-500" />
          <span className={`flex-1 ${display ? 'text-zinc-200' : 'text-zinc-500'}`}>{display || placeholder || ''}</span>
          {display && (
            <span
              role="button"
              tabIndex={-1}
              onClick={(e) => {
                e.stopPropagation()
                onChange('')
              }}
              className="rounded p-0.5 text-zinc-500 hover:text-zinc-200"
            >
              <X size={13} />
            </span>
          )}
        </button>
      )}

      {open && pos &&
        createPortal(
          <div
            ref={popRef}
            style={{ position: 'fixed', top: pos.top, left: pos.left, boxShadow: 'var(--float-shadow)' }}
            className="z-[60] w-[268px] rounded-2xl border border-edge bg-card p-3"
          >
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))}
              className="rounded-lg p-1.5 text-zinc-400 transition-colors duration-150 hover:bg-highlight hover:text-white"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm font-semibold capitalize text-zinc-200">{monthLabel}</span>
            <button
              type="button"
              onClick={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))}
              className="rounded-lg p-1.5 text-zinc-400 transition-colors duration-150 hover:bg-highlight hover:text-white"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="mb-1 grid grid-cols-7 gap-0.5">
            {weekdays.map((w) => (
              <div key={w} className="py-1 text-center text-[10px] font-medium uppercase text-zinc-600">
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {grid.map((d) => {
              const inMonth = d.getMonth() === view.getMonth()
              const isSel = selected && sameDay(d, selected)
              const isToday = sameDay(d, today)
              return (
                <button
                  key={d.toISOString()}
                  type="button"
                  onClick={() => {
                    onChange(combine(iso(d), timePart))
                    if (!withTime) setOpen(false) // date-only → pick & close; withTime → stay open for the Time row
                  }}
                  className={`flex h-8 items-center justify-center rounded-lg text-[13px] transition-colors duration-150 ${
                    isSel
                      ? 'bg-accent font-semibold text-[#fff]'
                      : inMonth
                        ? 'text-zinc-300 hover:bg-highlight'
                        : 'text-zinc-600 hover:bg-highlight'
                  } ${isToday && !isSel ? 'ring-1 ring-inset ring-accent/50' : ''}`}
                >
                  {d.getDate()}
                </button>
              )
            })}
          </div>

          {withTime && (
            <div className="mt-2 flex items-center justify-between border-t border-edge pt-2">
              <span className="text-xs font-medium text-zinc-500">{lang === 'ru' ? 'Время' : 'Time'}</span>
              <TimeSelect
                value={timePart}
                onChange={(tm) => {
                  const base = datePart || iso(today)
                  onChange(combine(base, tm))
                }}
              />
            </div>
          )}

          <div className="mt-2 flex items-center justify-between border-t border-edge pt-2">
            <button
              type="button"
              onClick={() => onChange('')}
              className="rounded-lg px-2 py-1 text-xs text-zinc-500 transition-colors duration-150 hover:text-[color:var(--c-red-text)]"
            >
              {lang === 'ru' ? 'Очистить' : 'Clear'}
            </button>
            <button
              type="button"
              onClick={() => {
                onChange(combine(iso(today), timePart))
                setView(today)
                if (!withTime) setOpen(false)
              }}
              className="rounded-lg px-2 py-1 text-xs font-medium text-zinc-300 transition-colors duration-150 hover:bg-highlight hover:text-zinc-100"
            >
              {lang === 'ru' ? 'Сегодня' : 'Today'}
            </button>
          </div>
          </div>,
          document.body
        )}
    </>
  )
}
