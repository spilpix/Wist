import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowUpRight, CheckCircle2, Circle, MessageCircle, StickyNote as StickyIcon } from 'lucide-react'
import type { CanvasNode, Note, Task } from '../types/models'
import { shapePath } from './geometry'
import { fontCss, isRectish, ROUND_RECT_RADIUS, TEXT_DEFAULT_SIZE } from './constants'
import AutoWidthInput from './AutoWidthInput'

export const dashArray = (style: CanvasNode['strokeStyle'], w: number): string | undefined => {
  if (style === 'dashed') return `${w * 3} ${w * 2}`
  if (style === 'dotted') return `${w} ${w * 2}`
  return undefined
}
// CSS border-style for a stroke style
const borderStyle = (style: CanvasNode['strokeStyle']): string => (style === 'dashed' ? 'dashed' : style === 'dotted' ? 'dotted' : 'solid')

// ── shape text safe-area: inset the label so it stays inside the *visible* shape
// (a 0..100 path inside a square box leaves empty corners — text must not spill out) ──
const SHAPE_PAD: Record<string, [number, number]> = {
  ellipse: [0.15, 0.15],
  diamond: [0.24, 0.24],
  triangle: [0.22, 0.3],
  parallelogram: [0.16, 0.12],
  cylinder: [0.1, 0.2],
  cloud: [0.2, 0.22],
  star: [0.28, 0.3],
  arrowRight: [0.16, 0.24],
  hexagon: [0.16, 0.1],
  pentagon: [0.18, 0.2],
}
function shapePad(shape: string | undefined, w: number, h: number): { x: number; y: number } {
  const f = (shape && SHAPE_PAD[shape]) || [0.06, 0.06]
  return { x: Math.max(6, Math.round(w * f[0])), y: Math.max(6, Math.round(h * f[1])) }
}

// ── auto-fit: largest font (≤ cap) that makes the text fill the box without overflow ──
let measurer: HTMLDivElement | null = null
function getMeasurer() {
  if (!measurer) {
    measurer = document.createElement('div')
    measurer.style.cssText =
      'position:absolute;left:-99999px;top:0;visibility:hidden;pointer-events:none;white-space:pre-wrap;word-break:break-word;overflow-wrap:anywhere;line-height:1.25;box-sizing:content-box;font-family:inherit'
    document.body.appendChild(measurer)
  }
  return measurer
}

function useFitFont(text: string, availW: number, availH: number, cap: number, min: number, bold?: boolean, italic?: boolean, family?: string): number {
  const [size, setSize] = useState(Math.min(cap, 18))
  useLayoutEffect(() => {
    const el = getMeasurer()
    el.style.whiteSpace = 'pre-wrap'
    el.style.width = `${availW}px`
    el.style.fontWeight = bold ? '700' : '500'
    el.style.fontStyle = italic ? 'italic' : 'normal'
    el.style.fontFamily = family || 'inherit'
    el.textContent = text && text.length ? text : 'A'
    let lo = min
    let hi = Math.max(min, cap)
    let best = min
    for (let i = 0; i < 9; i++) {
      const mid = (lo + hi) / 2
      el.style.fontSize = `${mid}px`
      if (el.scrollHeight <= availH && el.scrollWidth <= availW + 1) {
        best = mid
        lo = mid
      } else {
        hi = mid
      }
    }
    setSize(Math.floor(best))
  }, [text, availW, availH, cap, min, bold, italic, family])
  return size
}

interface Props {
  node: CanvasNode
  note?: Note
  task?: Task
  selected: boolean
  editing: boolean
  fileUrl: (p: string) => string
  missingNoteLabel: string
  missingTaskLabel: string
  placeholder: string
  stickyPlaceholder?: string // FigJam-style empty-sticky prompt
  frameLabel?: string
  dropActive?: boolean // a dragged object is about to drop into this frame
  onText: (text: string) => void
  onEndEdit: () => void
  onOpenNote: () => void
  onToggleTask: () => void
  onOpenTask: () => void
  // text objects grow their box height to fit content (Figma auto-height)
  onAutoHeight?: (h: number) => void
  // auto-width text: box hugs the content on both axes
  onAutoSize?: (w: number, h: number) => void
}

/** Auto-fitting / auto-growing, wrapping text for sticky / text / shape — display + matching editor. */
function TextBlock({
  n,
  editing,
  placeholder,
  stickyPlaceholder,
  onText,
  onEndEdit,
  onAutoHeight,
  onAutoSize,
}: {
  n: CanvasNode
  editing: boolean
  placeholder: string
  stickyPlaceholder?: string
  onText: (t: string) => void
  onEndEdit: () => void
  onAutoHeight?: (h: number) => void
  onAutoSize?: (w: number, h: number) => void
}) {
  const taRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    if (editing && taRef.current) {
      taRef.current.focus()
      taRef.current.select()
    }
  }, [editing])

  const isText = n.type === 'text'
  const isSticky = n.type === 'sticky'
  // text default = auto-WIDTH (box hugs the content); fixed-width (wrap) once a side handle is dragged
  const textAuto = isText && n.autoWidth !== false
  // FigJam-style empty-sticky prompt (falls back to nothing if not provided)
  const ph = isSticky ? stickyPlaceholder ?? '' : placeholder
  // per-axis padding — stickies get a roomy writing area; text hugs; shapes get a per-shape safe-area
  const stickyPad = Math.max(14, Math.round(Math.min(n.w, n.h) * 0.1))
  const sp = n.type === 'shape' ? shapePad(n.shape, n.w, n.h) : null
  const padX = isSticky ? stickyPad : isText ? (n.fill || n.stroke ? 12 : 4) : sp ? sp.x : 8
  const padY = isSticky ? stickyPad : isText ? (n.fill || n.stroke ? 10 : 4) : sp ? sp.y : 8
  // reserve room at the sticky's bottom for the author footer ONLY when a name is set.
  // (Solo, local boards have no author → no footer, no wasted space — Miro/FigJam stamp
  // an author only because they're multiplayer; a time-only footer was just noise.)
  const footerH = isSticky && !!n.author ? 22 : 0
  const padBottom = padY + footerH
  const availW = Math.max(1, n.w - padX * 2)
  const availH = Math.max(1, n.h - padY - padBottom)
  // sticky: cap at a comfortable size so a few words don't balloon (FigJam-style), still shrinks to fit long text
  const cap =
    n.fontSize && n.fontSize > 0
      ? n.fontSize
      : isSticky
        ? Math.max(13, Math.min(30, Math.round(Math.min(n.w, n.h) * 0.16)))
        : n.type === 'shape'
          ? // shapes get a comfortable cap like stickies — a one-word label must NOT balloon to fill the box
            Math.max(13, Math.min(28, Math.round(Math.min(n.w, n.h) * 0.18)))
          : Math.min(160, Math.round(Math.min(n.w, n.h) * 0.9))
  const family = fontCss(n.fontFamily)
  // sticky / shape: auto-FIT (shrink to fill the box); text: FIXED font, box auto-GROWS
  const fitSize = useFitFont(n.text ?? '', availW, availH, cap, 9, n.bold, n.italic, family)
  const size = isText ? n.fontSize || TEXT_DEFAULT_SIZE : fitSize
  const measureText = n.text && n.text.length ? n.text : ph || 'A'

  // text auto-WIDTH: box hugs the content on BOTH axes (no wrap; Enter starts a line)
  useLayoutEffect(() => {
    if (!textAuto || !onAutoSize) return
    const el = getMeasurer()
    el.style.whiteSpace = 'pre'
    el.style.width = 'auto'
    el.style.fontWeight = n.bold ? '700' : '500'
    el.style.fontStyle = n.italic ? 'italic' : 'normal'
    el.style.fontFamily = family || 'inherit'
    el.style.fontSize = `${size}px`
    el.textContent = measureText
    const w = Math.max(24, Math.ceil(el.scrollWidth) + padX * 2 + 2)
    const h = Math.max(20, Math.ceil(el.scrollHeight) + padY * 2)
    el.style.whiteSpace = 'pre-wrap'
    el.style.width = `${availW}px`
    if (Math.abs(w - n.w) > 0.5 || Math.abs(h - n.h) > 0.5) onAutoSize(w, h)
  }, [textAuto, onAutoSize, measureText, size, n.bold, n.italic, family, padX, padY, n.w, n.h, availW])

  // text auto-HEIGHT (fixed-width mode): measure wrapped content and report the box height
  useLayoutEffect(() => {
    if (!isText || textAuto || !onAutoHeight) return
    const el = getMeasurer()
    el.style.whiteSpace = 'pre-wrap'
    el.style.width = `${availW}px`
    el.style.fontWeight = n.bold ? '700' : '500'
    el.style.fontStyle = n.italic ? 'italic' : 'normal'
    el.style.fontFamily = family || 'inherit'
    el.style.fontSize = `${size}px`
    el.textContent = n.text && n.text.length ? n.text : 'A'
    const need = Math.ceil(el.scrollHeight) + padY * 2
    if (Math.abs(need - n.h) > 0.5) onAutoHeight(need)
  }, [isText, textAuto, onAutoHeight, n.text, availW, size, n.bold, n.italic, family, padY, n.h])

  const align = n.align ?? (isText || isSticky ? 'left' : 'center')
  const vAlign = isText || isSticky ? 'flex-start' : 'center'

  const style: React.CSSProperties = {
    fontSize: size,
    fontFamily: family,
    fontWeight: n.bold ? 700 : 500,
    fontStyle: n.italic ? 'italic' : 'normal',
    textDecoration: [n.underline && 'underline', n.strike && 'line-through'].filter(Boolean).join(' ') || 'none',
    textAlign: align,
    color: n.textColor ?? (n.type === 'sticky' || n.type === 'shape' ? '#2a2018' : 'rgb(var(--ink-0))'),
    lineHeight: 1.25,
    whiteSpace: textAuto ? 'pre' : 'pre-wrap',
    wordBreak: textAuto ? 'normal' : 'break-word',
    overflowWrap: textAuto ? 'normal' : 'anywhere',
  }

  if (editing) {
    return (
      <div className="absolute inset-0 flex overflow-hidden" style={{ padding: `${padY}px ${padX}px ${padBottom}px`, alignItems: vAlign }}>
        <textarea
          ref={taRef}
          wrap={textAuto ? 'off' : 'soft'}
          value={n.text ?? ''}
          onChange={(e) => onText(e.target.value)}
          onBlur={onEndEdit}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault()
              onEndEdit()
            }
            e.stopPropagation()
          }}
          onPointerDown={(e) => e.stopPropagation()}
          onWheel={(e) => e.stopPropagation()}
          className="h-full w-full resize-none overflow-hidden border-0 bg-transparent p-0 outline-none placeholder:opacity-40"
          style={style}
          placeholder={ph}
        />
      </div>
    )
  }
  const { node: textContent, hasLists } = renderTextContent(n.text ?? '')
  return (
    <div className="absolute inset-0 flex overflow-hidden" style={{ padding: `${padY}px ${padX}px ${padBottom}px`, alignItems: vAlign }}>
      <div className="w-full" style={hasLists ? { ...style, whiteSpace: 'normal' } : style}>
        {n.text ? textContent : (ph ? <span style={{ opacity: 0.3 }}>{ph}</span> : null)}
      </div>
    </div>
  )
}

// Parse plain text with `- ` or `\d+. ` prefixes into list/paragraph ReactNodes.
// Editing always uses the plain textarea — this is display-only.
function renderTextContent(text: string): { node: ReactNode; hasLists: boolean } {
  if (!/^[-*] /m.test(text) && !/^\d+\. /m.test(text)) return { node: text, hasLists: false }
  type Chunk = { type: 'ul' | 'ol' | 'p'; lines: string[] }
  const chunks: Chunk[] = []
  for (const line of text.split('\n')) {
    const ul = line.match(/^[-*] (.*)/)
    const ol = line.match(/^\d+\. (.*)/)
    const last = chunks[chunks.length - 1]
    if (ul) {
      if (last?.type === 'ul') last.lines.push(ul[1])
      else chunks.push({ type: 'ul', lines: [ul[1]] })
    } else if (ol) {
      if (last?.type === 'ol') last.lines.push(ol[1])
      else chunks.push({ type: 'ol', lines: [ol[1]] })
    } else {
      if (last?.type === 'p') last.lines.push(line)
      else chunks.push({ type: 'p', lines: [line] })
    }
  }
  const node = (
    <>
      {chunks.map((ch, i) =>
        ch.type === 'ul' ? (
          <ul key={i} style={{ paddingLeft: '1.2em', margin: 0, listStyleType: 'disc' }}>
            {ch.lines.map((l, j) => <li key={j}>{l}</li>)}
          </ul>
        ) : ch.type === 'ol' ? (
          <ol key={i} style={{ paddingLeft: '1.5em', margin: 0 }}>
            {ch.lines.map((l, j) => <li key={j}>{l}</li>)}
          </ol>
        ) : (
          <p key={i} style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{ch.lines.join('\n')}</p>
        )
      )}
    </>
  )
  return { node, hasLists: true }
}

// strip markdown syntax for a clean note-card preview (no raw #, [[ ]], `, * on the board)
function plainText(s: string): string {
  return (s || '')
    .replace(/!\[\[([^\]]+)\]\]/g, '$1')
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, a, b) => b || a)
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/[*_`~>#]/g, '')
    .replace(/\n{2,}/g, '\n')
    .trim()
}

// short footer time for a sticky (HH:MM today, else D MMM)
function stickyTime(ts: number): string {
  try {
    const d = new Date(ts)
    const now = new Date()
    const sameDay = d.toDateString() === now.toDateString()
    return sameDay
      ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString([], { day: 'numeric', month: 'short' })
  } catch {
    return ''
  }
}

/** Pure visual for a single node. The parent owns position / size / rotation / interaction. */
export default function NodeView({ node: n, note, task, editing, fileUrl, missingNoteLabel, missingTaskLabel, placeholder, stickyPlaceholder, frameLabel, dropActive, onText, onEndEdit, onOpenNote, onToggleTask, onOpenTask, onAutoHeight, onAutoSize }: Props) {
  // ── sticky (FigJam-style: rounded square, soft shadow, author footer) ─────────
  if (n.type === 'sticky') {
    return (
      <div
        className="relative h-full w-full overflow-hidden"
        style={{
          background: n.fill || '#FCE8A6',
          borderRadius: n.radius ?? 8,
          boxShadow: '0 1px 2px rgb(0 0 0 / 0.10), 0 8px 18px rgb(0 0 0 / 0.10)',
        }}
      >
        <TextBlock n={n} editing={editing} placeholder={placeholder} stickyPlaceholder={stickyPlaceholder} onText={onText} onEndEdit={onEndEdit} />
        {n.author && (
          <div
            className="pointer-events-none absolute inset-x-3 bottom-2 flex items-center justify-between gap-2 text-[11px]"
            style={{ color: 'rgba(38,28,20,0.52)' }}
          >
            <span className="truncate font-semibold">{n.author}</span>
            {n.createdAt && <span className="shrink-0 font-medium tabular-nums opacity-80">{stickyTime(n.createdAt)}</span>}
          </div>
        )}
      </div>
    )
  }

  // ── text (optionally under a fill / stroke, Figma-style) ────────────────────
  if (n.type === 'text') {
    const sw = n.strokeWidth ?? 1
    const hasBox = !!(n.fill && n.fill !== 'transparent') || !!(n.stroke && sw > 0)
    const boxStyle: React.CSSProperties | undefined = hasBox
      ? {
          background: n.fill || 'transparent',
          border: n.stroke && sw > 0 ? `${sw}px ${borderStyle(n.strokeStyle)} ${n.stroke}` : undefined,
          borderRadius: n.radius ?? 8,
          boxSizing: 'border-box',
        }
      : undefined
    return (
      <div className="relative h-full w-full" style={boxStyle}>
        <TextBlock n={n} editing={editing} placeholder={placeholder} onText={onText} onEndEdit={onEndEdit} onAutoHeight={onAutoHeight} onAutoSize={onAutoSize} />
      </div>
    )
  }

  // ── shape ───────────────────────────────────────────────────────────────────
  if (n.type === 'shape') {
    const sw = n.strokeWidth ?? 2
    // rect-like shapes render as an HTML box → real CSS border-radius (draggable corners)
    if (isRectish(n.shape)) {
      const radius = n.radius ?? (n.shape === 'roundRect' ? ROUND_RECT_RADIUS : 0)
      const hasStroke = !!n.stroke && sw > 0
      // null = user chose "no fill" → transparent; undefined = legacy → theme fallback
      const bg = n.fill === null ? 'transparent' : n.fill || 'rgb(var(--ink-0) / 0.08)'
      return (
        <div
          className="relative h-full w-full"
          style={{
            background: bg,
            border: hasStroke ? `${sw}px ${borderStyle(n.strokeStyle)} ${n.stroke}` : undefined,
            borderRadius: radius,
            boxSizing: 'border-box',
          }}
        >
          {(editing || (n.text != null && n.text !== '')) && (
            <TextBlock n={n} editing={editing} placeholder={placeholder} onText={onText} onEndEdit={onEndEdit} />
          )}
        </div>
      )
    }
    return (
      <div className="relative h-full w-full">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
          <path
            d={shapePath(n.shape ?? 'rect')}
            fill={n.fill === null ? 'transparent' : n.fill || 'rgb(var(--ink-0) / 0.08)'}
            stroke={n.stroke || 'rgb(var(--ink-500))'}
            strokeWidth={sw}
            strokeDasharray={dashArray(n.strokeStyle, sw)}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        {(editing || (n.text != null && n.text !== '')) && (
          <TextBlock n={n} editing={editing} placeholder={placeholder} onText={onText} onEndEdit={onEndEdit} />
        )}
      </div>
    )
  }

  // ── image ───────────────────────────────────────────────────────────────────
  if (n.type === 'image') {
    const radius = n.radius ?? 6
    if (!n.path) return <div className="flex h-full w-full items-center justify-center bg-raised text-xs text-zinc-500" style={{ borderRadius: radius }}>—</div>
    if (n.crop) {
      const { x: cx, y: cy, w: cw, h: ch } = n.crop
      return (
        <div className="relative h-full w-full overflow-hidden" style={{ borderRadius: radius }}>
          <img
            src={fileUrl(n.path)}
            alt=""
            draggable={false}
            className="pointer-events-none absolute max-w-none"
            style={{ width: `${100 / cw}%`, height: `${100 / ch}%`, left: `${(-cx * 100) / cw}%`, top: `${(-cy * 100) / ch}%` }}
          />
        </div>
      )
    }
    return <img src={fileUrl(n.path)} alt="" draggable={false} className="pointer-events-none h-full w-full object-cover" style={{ borderRadius: radius }} />
  }

  // ── frame: a titled artboard; children move with it ──────────────────────────
  if (n.type === 'frame') {
    const title = n.text || frameLabel || ''
    return (
      <div
        className="relative h-full w-full transition-shadow"
        style={{
          background: n.fill || 'rgb(var(--surface))',
          border: dropActive ? '1px solid rgb(var(--accent-rgb))' : '1px solid rgb(var(--ink-0) / 0.18)',
          borderRadius: n.radius ?? 0,
          boxShadow: dropActive
            ? '0 0 0 2px rgb(var(--accent-rgb) / 0.35), inset 0 0 0 9999px rgb(var(--accent-rgb) / 0.06)'
            : '0 1px 3px rgb(0 0 0 / 0.06)',
        }}
      >
        <div
          className={`absolute -top-[23px] left-0 flex items-center text-[11px] font-semibold leading-none ${dropActive ? 'text-accent-bright' : 'text-[rgb(var(--ink-300))]'}`}
        >
          {editing ? (
            <AutoWidthInput
              autoFocus
              value={n.text ?? ''}
              onChange={onText}
              onBlur={onEndEdit}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === 'Escape') onEndEdit()
                e.stopPropagation()
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className="rounded-lg bg-card px-1.5 py-1 text-[11px] font-semibold text-[rgb(var(--ink-0))] outline-none ring-1 ring-accent"
              placeholder={frameLabel}
              min={48}
            />
          ) : (
            <span className="max-w-[280px] truncate">{title}</span>
          )}
        </div>
      </div>
    )
  }

  // ── pen (freehand) — points are local to the node box ────────────────────────
  if (n.type === 'pen') {
    const pts = (n.points || []).map((p) => `${p.x},${p.y}`).join(' ')
    return (
      <svg className="h-full w-full overflow-visible">
        <polyline points={pts} fill="none" stroke={n.stroke || 'rgb(var(--ink-0))'} strokeWidth={n.strokeWidth || 3} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }

  // ── comment pin ──────────────────────────────────────────────────────────────
  if (n.type === 'comment') {
    return (
      <div
        className={`flex h-full w-full items-center justify-center rounded-full rounded-bl-none border shadow-md ${
          n.resolved ? 'border-edge bg-card text-zinc-500' : 'border-white/40 bg-accent text-[#fff]'
        }`}
      >
        <MessageCircle size={15} />
      </div>
    )
  }

  // ── task (live card: checkbox toggles the task; ↗ opens it; body drags) ───────
  if (n.type === 'task') {
    const done = !!task?.done
    const edge = done ? '#46A758' : n.color || 'rgb(var(--edge))'
    return (
      <div className="relative h-full w-full overflow-hidden rounded-xl border bg-card transition-shadow hover:shadow-[var(--card-shadow-hover)]" style={{ borderColor: edge, borderTopWidth: 3, borderTopColor: edge }}>
        {/* body propagates pointer events → the node stays selectable / draggable */}
        <div className="flex h-full w-full items-start gap-2 p-2.5 pr-7">
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => task && onToggleTask()}
            className="mt-px shrink-0 text-zinc-400 transition-colors hover:text-accent-bright"
          >
            {done ? <CheckCircle2 size={18} className="text-[#46A758]" /> : <Circle size={18} />}
          </button>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className={`line-clamp-2 text-[13px] font-semibold ${done ? 'text-zinc-500 line-through' : 'text-[rgb(var(--ink-0))]'}`}>
              {task ? task.title || missingTaskLabel : missingTaskLabel}
            </span>
            {task?.due_date && <span className="mt-1 text-[11px] tabular-nums text-zinc-500">{task.due_date}</span>}
          </div>
        </div>
        {task && (
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onOpenTask}
            className="absolute right-1.5 top-1.5 rounded-md p-1 text-zinc-500 transition-colors hover:bg-highlight hover:text-zinc-200"
          >
            <ArrowUpRight size={13} />
          </button>
        )}
      </div>
    )
  }

  // ── note (legacy link card) ──────────────────────────────────────────────────
  const accent = n.color || 'rgb(var(--edge))'
  return (
    <div className="h-full w-full overflow-hidden rounded-xl border bg-card transition-shadow hover:shadow-[var(--card-shadow-hover)]" style={{ borderColor: n.color || 'rgb(var(--edge))', borderTopWidth: 3, borderTopColor: accent }}>
      <button onPointerDown={(e) => e.stopPropagation()} onClick={() => note && onOpenNote()} className="flex h-full w-full flex-col items-start p-2.5 text-left">
        <div className={`flex items-center gap-1.5 text-[13px] font-semibold ${note ? 'text-[rgb(var(--ink-0))]' : 'text-zinc-500'}`}>
          <StickyIcon size={12} className="shrink-0 text-accent-bright" />
          <span className="truncate">{note ? note.title || plainText(note.content).slice(0, 30) : missingNoteLabel}</span>
        </div>
        {note?.content && <p className="mt-1 line-clamp-4 text-[11px] leading-relaxed text-zinc-500">{plainText(note.content)}</p>}
      </button>
    </div>
  )
}
