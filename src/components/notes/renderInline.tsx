import { type ReactNode } from 'react'

// Render inline markdown (bold / italic / code / [[wikilinks]] / [links](url)) to React
// nodes. Used to display a note block when it's NOT being edited (the focused block shows
// raw markdown in a textarea instead — Obsidian "live preview" behaviour).

const INLINE = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(\[\[[^\]]+\]\])|(\[[^\]]+\]\([^)]+\))/g

export function renderInline(text: string, onOpenLink?: (name: string) => void): ReactNode {
  if (!text) return null
  const out: ReactNode[] = []
  let last = 0
  let key = 0
  let m: RegExpExecArray | null
  INLINE.lastIndex = 0
  while ((m = INLINE.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const tok = m[0]
    if (m[1]) {
      out.push(
        <code key={key++} className="rounded border border-edge bg-field px-1.5 py-0.5 font-mono text-[0.85em] text-zinc-200">
          {tok.slice(1, -1)}
        </code>
      )
    } else if (m[2]) {
      out.push(
        <strong key={key++} className="font-semibold text-zinc-100">
          {tok.slice(2, -2)}
        </strong>
      )
    } else if (m[3]) {
      out.push(
        <em key={key++} className="italic">
          {tok.slice(1, -1)}
        </em>
      )
    } else if (m[4]) {
      const inner = tok.slice(2, -2)
      const [name, label] = inner.split('|')
      out.push(
        <button
          key={key++}
          type="button"
          onMouseDown={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onOpenLink?.(name.trim())
          }}
          className="text-accent-bright underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
        >
          {(label ?? name).trim()}
        </button>
      )
    } else if (m[5]) {
      const lm = /\[([^\]]+)\]\(([^)]+)\)/.exec(tok)
      if (lm) {
        out.push(
          <a
            key={key++}
            href={lm[2]}
            onMouseDown={(e) => {
              e.preventDefault()
              e.stopPropagation()
              window.wist.shell.openExternal(lm[2])
            }}
            className="text-accent-bright underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
          >
            {lm[1]}
          </a>
        )
      }
    }
    last = m.index + tok.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}
