import { type ReactNode } from 'react'
import { ArrowUpRight, Frame } from 'lucide-react'

interface Props {
  content: string
  onOpenLink?: (name: string) => void
  onOpenTag?: (tag: string) => void
  onOpenEmbed?: (name: string) => void
  onToggleCheckbox?: (lineIndex: number) => void
}

// resolve an image/link target: web/data/media URLs pass through; a local path goes
// through the media:// stream so brain-folder images render
function mediaUrl(u: string): string {
  return /^(https?:|data:|media:|blob:)/.test(u) ? u : window.wist.media.fileUrl(u)
}

// inline: ![img](url), **bold**, *italic*, `code`, [[wiki link]], [text](url)
function inline(text: string, onOpenLink?: (n: string) => void, onOpenTag?: (t: string) => void): ReactNode[] {
  const out: ReactNode[] = []
  const re = /(!\[([^\]]*)\]\(([^)]+)\))|(\[\[([^\]]+)\]\])|(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(`([^`]+)`)|(\[([^\]]+)\]\(([^)]+)\))|(?<=^|\s)(#[A-Za-zА-Яа-яЁё0-9_-]+)/g
  let last = 0
  let key = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    if (m[1]) {
      out.push(
        <img key={key++} src={mediaUrl(m[3])} alt={m[2]} loading="lazy" className="my-1 max-h-[420px] max-w-full rounded-lg border border-edge" />
      )
    } else if (m[4]) {
      const raw = m[5].split('|')[0].split('#')[0].trim()
      const label = m[5].includes('|') ? m[5].split('|')[1] : m[5]
      out.push(
        <button key={key++} onClick={() => onOpenLink?.(raw)} className="font-medium text-accent-bright hover:underline">
          {label}
        </button>
      )
    } else if (m[6]) out.push(<strong key={key++} className="font-semibold text-white">{m[7]}</strong>)
    else if (m[8]) out.push(<em key={key++}>{m[9]}</em>)
    else if (m[10]) out.push(<code key={key++} className="rounded border border-edge bg-field px-1.5 py-0.5 font-mono text-[0.85em] text-zinc-200">{m[11]}</code>)
    else if (m[12]) {
      const url = m[14]
      const label = m[13]
      out.push(
        <a key={key++} href={url} onClick={(e) => { e.preventDefault(); window.wist.shell.openExternal(url) }} className="text-accent-bright hover:underline">
          {label}
        </a>
      )
    } else if (m[15]) {
      const tag = m[15].slice(1)
      out.push(
        <button key={key++} onClick={() => onOpenTag?.(tag)} className="font-medium text-teal-500 hover:underline">
          {m[15]}
        </button>
      )
    }
    last = re.lastIndex
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

// split a markdown table row "| a | b |" into trimmed cells
const parseRow = (l: string): string[] => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())

const HEADING = [/^# (.*)/, /^## (.*)/, /^### (.*)/]
const isSpecial = (l: string) =>
  /^#{1,3} /.test(l) || /^>\s?/.test(l) || /^(---|\*\*\*|___)\s*$/.test(l) || /^\s*[-*]\s+/.test(l) || /^\s*\d+\.\s+/.test(l) || /^```/.test(l)

/** Lightweight Obsidian-style markdown renderer: blocks + clickable [[links]] + live checkboxes. */
export default function MarkdownView({ content, onOpenLink, onOpenTag, onOpenEmbed, onToggleCheckbox }: Props) {
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
        <pre key={k++} className="overflow-x-auto rounded-lg border border-edge bg-field p-3.5 font-mono text-[12.5px] text-zinc-200">
          <code>{buf.join('\n')}</code>
        </pre>
      )
      continue
    }

    // embed: ![[Name]] on its own line → a clickable card that opens the canvas/note
    const emb = /^!\[\[([^\]\n|]+)(?:\|[^\]\n]*)?\]\]\s*$/.exec(line)
    if (emb) {
      const name = emb[1].trim()
      blocks.push(
        <button
          key={k++}
          onClick={() => onOpenEmbed?.(name)}
          className="my-1 flex w-full items-center gap-2 rounded-lg border border-edge bg-raised px-3 py-2.5 text-left transition-colors hover:border-zinc-600"
        >
          <Frame size={15} className="shrink-0 text-accent-bright" />
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-zinc-200">{name}</span>
          <ArrowUpRight size={14} className="shrink-0 text-zinc-500" />
        </button>
      )
      i++
      continue
    }

    const h = HEADING.findIndex((re) => re.test(line))
    if (h >= 0) {
      const txt = line.replace(/^#{1,3}\s/, '')
      const sizes = ['text-2xl font-bold', 'text-xl font-bold', 'text-lg font-semibold']
      blocks.push(
        <div key={k++} className={`${sizes[h]} mt-2 text-white`}>
          {inline(txt, onOpenLink, onOpenTag)}
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
        <blockquote key={k++} className="border-l-[3px] border-zinc-600 pl-3.5 text-zinc-300">
          {inline(buf.join(' '), onOpenLink, onOpenTag)}
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
                className={`mt-0.5 flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-[5px] border-[1.6px] text-[11px] transition-colors ${
                  it.checked ? 'border-accent bg-accent text-[#fff]' : 'border-zinc-600 hover:border-accent'
                }`}
              >
                {it.checked && '✓'}
              </button>
              <span className={it.checked ? 'text-zinc-500 line-through decoration-zinc-700' : ''}>{inline(it.txt, onOpenLink, onOpenTag)}</span>
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
            <li key={j}>{inline(it, onOpenLink, onOpenTag)}</li>
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
            <li key={j}>{inline(it, onOpenLink, onOpenTag)}</li>
          ))}
        </ol>
      )
      continue
    }

    // GFM table: a header row, a |---| separator with matching columns, then body rows
    if (line.includes('|') && i + 1 < lines.length) {
      const header = parseRow(line)
      const sep = parseRow(lines[i + 1])
      if (header.length >= 1 && sep.length === header.length && sep.every((c) => /^:?-{1,}:?$/.test(c))) {
        i += 2
        const rows: string[][] = []
        while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') rows.push(parseRow(lines[i++]))
        blocks.push(
          <div key={k++} className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr>
                  {header.map((c, j) => (
                    <th key={j} className="border border-edge bg-field px-3 py-1.5 text-left font-semibold text-zinc-200">{inline(c, onOpenLink, onOpenTag)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, ri) => (
                  <tr key={ri}>
                    {header.map((_, j) => (
                      <td key={j} className="border border-edge px-3 py-1.5 text-zinc-300">{inline(r[j] ?? '', onOpenLink, onOpenTag)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
        continue
      }
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
        {inline(buf.join(' '), onOpenLink, onOpenTag)}
      </p>
    )
  }

  if (!blocks.length) return null
  return <div className="space-y-3 text-sm text-zinc-300">{blocks}</div>
}
