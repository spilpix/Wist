import { type ReactNode } from 'react'

interface Props {
  content: string
  onOpenLink?: (name: string) => void
  onToggleCheckbox?: (lineIndex: number) => void
}

// inline: **bold**, *italic*, `code`, [[wiki link]], [text](url)
function inline(text: string, onOpenLink?: (n: string) => void): ReactNode[] {
  const out: ReactNode[] = []
  const re = /(\[\[([^\]]+)\]\])|(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(`([^`]+)`)|(\[([^\]]+)\]\(([^)]+)\))/g
  let last = 0
  let key = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    if (m[1]) {
      const raw = m[2].split('|')[0].split('#')[0].trim()
      const label = m[2].includes('|') ? m[2].split('|')[1] : m[2]
      out.push(
        <button key={key++} onClick={() => onOpenLink?.(raw)} className="font-medium text-accent-bright hover:underline">
          {label}
        </button>
      )
    } else if (m[3]) out.push(<strong key={key++} className="font-semibold text-white">{m[4]}</strong>)
    else if (m[5]) out.push(<em key={key++}>{m[6]}</em>)
    else if (m[7]) out.push(<code key={key++} className="rounded bg-raised px-1 py-0.5 font-mono text-[0.85em] text-accent-bright">{m[8]}</code>)
    else if (m[9]) {
      const url = m[11]
      const label = m[10]
      out.push(
        <a key={key++} href={url} onClick={(e) => { e.preventDefault(); window.wist.shell.openExternal(url) }} className="text-accent-bright hover:underline">
          {label}
        </a>
      )
    }
    last = re.lastIndex
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

const HEADING = [/^# (.*)/, /^## (.*)/, /^### (.*)/]
const isSpecial = (l: string) =>
  /^#{1,3} /.test(l) || /^>\s?/.test(l) || /^(---|\*\*\*|___)\s*$/.test(l) || /^\s*[-*]\s+/.test(l) || /^\s*\d+\.\s+/.test(l) || /^```/.test(l)

/** Lightweight Obsidian-style markdown renderer: blocks + clickable [[links]] + live checkboxes. */
export default function MarkdownView({ content, onOpenLink, onToggleCheckbox }: Props) {
  const lines = content.split('\n')
  const blocks: ReactNode[] = []
  let i = 0
  let k = 0

  while (i < lines.length) {
    const line = lines[i]

    if (/^```/.test(line)) {
      const buf: string[] = []
      i++
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++])
      i++ // closing fence
      blocks.push(
        <pre key={k++} className="overflow-x-auto rounded-lg border border-edge bg-raised p-3 font-mono text-[12.5px] text-zinc-300">
          <code>{buf.join('\n')}</code>
        </pre>
      )
      continue
    }

    const h = HEADING.findIndex((re) => re.test(line))
    if (h >= 0) {
      const txt = line.replace(/^#{1,3}\s/, '')
      const sizes = ['text-2xl font-bold', 'text-xl font-bold', 'text-lg font-semibold']
      blocks.push(
        <div key={k++} className={`${sizes[h]} mt-2 text-white`}>
          {inline(txt, onOpenLink)}
        </div>
      )
      i++
      continue
    }

    if (/^(---|\*\*\*|___)\s*$/.test(line)) {
      blocks.push(<hr key={k++} className="my-1 border-edge" />)
      i++
      continue
    }

    if (/^>\s?/.test(line)) {
      const buf: string[] = []
      while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ''))
      blocks.push(
        <blockquote key={k++} className="border-l-2 border-accent/60 pl-3 text-zinc-400">
          {inline(buf.join(' '), onOpenLink)}
        </blockquote>
      )
      continue
    }

    if (/^\s*[-*]\s+\[[ xX]\]/.test(line)) {
      const items: Array<{ checked: boolean; txt: string; idx: number }> = []
      while (i < lines.length && /^\s*[-*]\s+\[[ xX]\]/.test(lines[i])) {
        items.push({ checked: /\[[xX]\]/.test(lines[i]), txt: lines[i].replace(/^\s*[-*]\s+\[[ xX]\]\s?/, ''), idx: i })
        i++
      }
      blocks.push(
        <ul key={k++} className="space-y-1">
          {items.map((it) => (
            <li key={it.idx} className="flex items-start gap-2">
              <button
                onClick={() => onToggleCheckbox?.(it.idx)}
                className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                  it.checked ? 'border-accent bg-accent text-[#fff]' : 'border-edge hover:border-accent'
                }`}
              >
                {it.checked && '✓'}
              </button>
              <span className={it.checked ? 'text-zinc-500 line-through decoration-zinc-700' : ''}>{inline(it.txt, onOpenLink)}</span>
            </li>
          ))}
        </ul>
      )
      continue
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i]) && !/^\s*[-*]\s+\[[ xX]\]/.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*]\s+/, ''))
      blocks.push(
        <ul key={k++} className="list-disc space-y-0.5 pl-5 marker:text-zinc-600">
          {items.map((it, j) => (
            <li key={j}>{inline(it, onOpenLink)}</li>
          ))}
        </ul>
      )
      continue
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*\d+\.\s+/, ''))
      blocks.push(
        <ol key={k++} className="list-decimal space-y-0.5 pl-5 marker:text-zinc-600">
          {items.map((it, j) => (
            <li key={j}>{inline(it, onOpenLink)}</li>
          ))}
        </ol>
      )
      continue
    }

    if (line.trim() === '') {
      i++
      continue
    }

    const buf: string[] = []
    while (i < lines.length && lines[i].trim() !== '' && !isSpecial(lines[i])) buf.push(lines[i++])
    if (!buf.length) {
      i++ // safety net: never zero-advance, even if a future block type diverges from isSpecial
      continue
    }
    blocks.push(
      <p key={k++} className="leading-relaxed">
        {inline(buf.join(' '), onOpenLink)}
      </p>
    )
  }

  if (!blocks.length) return null
  return <div className="space-y-3 text-sm text-zinc-300">{blocks}</div>
}
