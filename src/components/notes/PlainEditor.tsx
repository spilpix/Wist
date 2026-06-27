import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  Bold,
  Code,
  Copy,
  FileText,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Plus,
  Quote,
  Scissors,
  Strikethrough,
  TextSelect,
} from 'lucide-react'
import { physKey } from '../../lib/keyboard'
import { useI18n, type TKey } from '../../i18n'

type TFn = ReturnType<typeof useI18n>['t']

// ── caret pixel coordinates (mirror-div technique) ───────────────────────────
// The editor textarea auto-grows (height = scrollHeight, overflow hidden) so it
// never scrolls internally — a mirror aligned to its box gives the caret's screen
// position without any scroll bookkeeping. Anchors the [[ / slash popups + toolbar.
function caretXY(ta: HTMLTextAreaElement, pos: number): { left: number; top: number; height: number } {
  const cs = getComputedStyle(ta)
  const mirror = document.createElement('div')
  const copy = [
    'box-sizing', 'width', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
    'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
    'font-family', 'font-size', 'font-weight', 'font-style', 'letter-spacing', 'line-height',
    'text-transform', 'word-spacing', 'text-indent',
  ]
  for (const p of copy) mirror.style.setProperty(p, cs.getPropertyValue(p))
  const rect = ta.getBoundingClientRect()
  Object.assign(mirror.style, {
    position: 'fixed',
    visibility: 'hidden',
    whiteSpace: 'pre-wrap',
    overflowWrap: 'break-word',
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    height: 'auto',
  })
  mirror.textContent = ta.value.slice(0, pos)
  const marker = document.createElement('span')
  marker.textContent = ta.value.slice(pos) || '.'
  mirror.appendChild(marker)
  document.body.appendChild(mirror)
  const mr = marker.getBoundingClientRect()
  const out = { left: mr.left, top: mr.top, height: mr.height || parseFloat(cs.lineHeight) || 18 }
  document.body.removeChild(mirror)
  return out
}

// pure text transforms shared by the toolbar, context menu, keyboard and slash menu
function linePrefixOn(v: string, s: number, e: number, prefix: string) {
  const ls = v.lastIndexOf('\n', s - 1) + 1
  let le = v.indexOf('\n', e)
  if (le === -1) le = v.length
  const seg = v
    .slice(ls, le)
    .split('\n')
    .map((line) => prefix + line.replace(/^\s*(#{1,6}\s+|>\s+|[-*]\s\[[ xX]?\]\s+|[-*]\s+|\d+\.\s+)/, ''))
    .join('\n')
  return { next: v.slice(0, ls) + seg + v.slice(le), s: ls, e: ls + seg.length }
}
function wrapOn(v: string, s: number, e: number, open: string, close: string) {
  const sel = v.slice(s, e)
  return { next: v.slice(0, s) + open + sel + close + v.slice(e), s: s + open.length, e: e + open.length }
}

// detect an open `[[` immediately before the caret (no `]]`/newline since) → its query
const TRIGGER_RE = /\[\[([^[\]\n]*)$/
// detect a `/` at line-start or after whitespace (no space since) → slash-menu query
const SLASH_RE = /(?:^|\s)\/([\p{L}\d]*)$/u
// a wikilink anywhere (for Ctrl+click navigation), capturing the target title
const LINK_AT_RE = /\[\[([^[\]\n]+?)(?:\|[^\]\n]*)?\]\]/g

type Popup = { query: string; start: number; index: number; x: number; y: number }
type LinkItem = { kind: 'note'; id: number; title: string } | { kind: 'create'; title: string }

interface SlashDef {
  key: string
  icon: typeof Bold
  labelKey: TKey
  kind: 'prefix' | 'wrap' | 'link'
  arg: string
}
// the slash command palette — reuses the same markdown transforms as the toolbar
const SLASH_DEFS: SlashDef[] = [
  { key: 'h1', icon: Heading1, labelKey: 'notes.slash.h1', kind: 'prefix', arg: '# ' },
  { key: 'h2', icon: Heading2, labelKey: 'notes.slash.h2', kind: 'prefix', arg: '## ' },
  { key: 'h3', icon: Heading3, labelKey: 'notes.slash.h3', kind: 'prefix', arg: '### ' },
  { key: 'bullet', icon: List, labelKey: 'notes.slash.bullet', kind: 'prefix', arg: '- ' },
  { key: 'numbered', icon: ListOrdered, labelKey: 'notes.slash.numbered', kind: 'prefix', arg: '1. ' },
  { key: 'todo', icon: ListChecks, labelKey: 'notes.slash.todo', kind: 'prefix', arg: '- [ ] ' },
  { key: 'quote', icon: Quote, labelKey: 'notes.slash.quote', kind: 'prefix', arg: '> ' },
  { key: 'code', icon: Code, labelKey: 'notes.inlineCode', kind: 'wrap', arg: '`' },
  { key: 'bold', icon: Bold, labelKey: 'notes.bold', kind: 'wrap', arg: '**' },
  { key: 'italic', icon: Italic, labelKey: 'notes.italic', kind: 'wrap', arg: '*' },
  { key: 'highlight', icon: Highlighter, labelKey: 'notes.highlight', kind: 'wrap', arg: '==' },
  { key: 'link', icon: Link2, labelKey: 'notes.insertLink', kind: 'link', arg: '' },
]
type SlashItem = SlashDef & { label: string }

/**
 * PlainEditor — an Obsidian-style editor: a single auto-growing textarea of raw
 * markdown, with a live highlight overlay that tints [[wikilinks]] and #tags, `[[`
 * title autocomplete (create-on-miss), a `/` slash command menu, a floating selection
 * toolbar, Tab indent, auto-continued lists, Ctrl/Cmd+click link navigation, a
 * right-click menu and Ctrl+B / I / E.
 */
export default function PlainEditor({
  value,
  onChange,
  noteKey,
  t,
  placeholder,
  noteTitles = [],
  onOpenLink,
  onCreateLink,
  minHeight = '64vh',
}: {
  value: string
  onChange: (md: string) => void
  noteKey: string | number
  t: TFn
  placeholder?: string
  noteTitles?: { id: number; title: string }[]
  onOpenLink?: (title: string) => void
  onCreateLink?: (title: string) => void
  minHeight?: string
}) {
  const taRef = useRef<HTMLTextAreaElement | null>(null)
  const pendingSel = useRef<[number, number] | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const [link, setLink] = useState<Popup | null>(null)
  const [slash, setSlash] = useState<Popup | null>(null)
  const [selBar, setSelBar] = useState<{ x: number; y: number } | null>(null)

  // auto-grow + apply any pending programmatic selection after the value flows back
  useLayoutEffect(() => {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${ta.scrollHeight}px`
    if (pendingSel.current) {
      const [s, e] = pendingSel.current
      pendingSel.current = null
      ta.focus()
      ta.setSelectionRange(s, e)
    }
  }, [value])

  // reset caret + close all popups when switching notes
  useEffect(() => {
    pendingSel.current = null
    setLink(null)
    setSlash(null)
    setSelBar(null)
  }, [noteKey])

  const edit = useCallback(
    (next: string, selStart: number, selEnd: number) => {
      pendingSel.current = [selStart, selEnd]
      onChange(next)
    },
    [onChange]
  )

  // ── primitives ────────────────────────────────────────────────────────────

  const wrap = useCallback(
    (open: string, close = open) => {
      const ta = taRef.current
      if (!ta) return
      const r = wrapOn(ta.value, ta.selectionStart, ta.selectionEnd, open, close)
      edit(r.next, r.s, r.e)
    },
    [edit]
  )

  const insertAtCaret = useCallback(
    (str: string) => {
      const ta = taRef.current
      if (!ta) return
      const { selectionStart: s, selectionEnd: e, value: v } = ta
      edit(v.slice(0, s) + str + v.slice(e), s + str.length, s + str.length)
    },
    [edit]
  )

  // paste an image from the clipboard → store it (reusing the cover-image IPC) and
  // drop a markdown image link at the caret, so screenshots land straight in a note
  const onPasteImage = useCallback(
    async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const it = Array.from(e.clipboardData?.items ?? []).find((i) => i.kind === 'file' && i.type.startsWith('image/'))
      const file = it?.getAsFile()
      if (!file) return
      e.preventDefault()
      const name = file.name || `pasted.${file.type.split('/')[1] || 'png'}`
      try {
        const stored = await window.wist.files.saveCoverFromBytes(name, await file.arrayBuffer())
        insertAtCaret(`![${name}](${stored})`)
      } catch {
        /* ignore — leave the default paste behaviour */
      }
    },
    [insertAtCaret]
  )

  const linePrefix = useCallback(
    (prefix: string) => {
      const ta = taRef.current
      if (!ta) return
      const r = linePrefixOn(ta.value, ta.selectionStart, ta.selectionEnd, prefix)
      edit(r.next, r.s, r.e)
    },
    [edit]
  )

  const insertLink = useCallback(() => {
    const ta = taRef.current
    if (!ta) return
    const { selectionStart: s, selectionEnd: e, value: v } = ta
    const sel = v.slice(s, e)
    edit(v.slice(0, s) + '[[' + sel + ']]' + v.slice(e), s + 2, s + 2 + sel.length)
  }, [edit])

  const clip = useCallback((cmd: 'cut' | 'copy' | 'paste') => {
    const ta = taRef.current
    if (!ta) return
    ta.focus()
    try {
      document.execCommand(cmd)
    } catch {
      /* clipboard blocked */
    }
  }, [])

  const selectAll = useCallback(() => {
    const ta = taRef.current
    if (!ta) return
    ta.focus()
    ta.select()
  }, [])

  // continue a list / checkbox / quote on Enter; exit the list on an empty item
  const continueList = useCallback((): boolean => {
    const ta = taRef.current
    if (!ta || ta.selectionStart !== ta.selectionEnd) return false
    const pos = ta.selectionStart
    const v = ta.value
    const ls = v.lastIndexOf('\n', pos - 1) + 1
    const line = v.slice(ls, pos)
    const m = line.match(/^(\s*)([-*]\s\[[ xX]?\]\s|[-*]\s|(\d+)\.\s)/)
    if (!m) return false
    const [, indent, marker, num] = m
    if (line.trim() === marker.trim()) {
      edit(v.slice(0, ls) + v.slice(pos), ls, ls) // empty item → exit the list
      return true
    }
    let cont = marker
    if (num) cont = `${indent}${Number(num) + 1}. `
    else if (/\[/.test(marker)) cont = `${indent}- [ ] `
    const insert = `\n${cont}`
    edit(v.slice(0, pos) + insert + v.slice(pos), pos + insert.length, pos + insert.length)
    return true
  }, [edit])

  // ── [[ link + / slash autocomplete ──────────────────────────────────────────

  const buildItems = useCallback(
    (query: string): LinkItem[] => {
      const q = query.trim().toLowerCase()
      const out: LinkItem[] = noteTitles
        .filter((n) => n.title && (!q || n.title.toLowerCase().includes(q)))
        .slice(0, 8)
        .map((n) => ({ kind: 'note', id: n.id, title: n.title }))
      const exact = noteTitles.some((n) => n.title.trim().toLowerCase() === q)
      if (q && !exact && onCreateLink) out.push({ kind: 'create', title: query.trim() })
      return out
    },
    [noteTitles, onCreateLink]
  )

  const slashItems = useCallback(
    (q: string): SlashItem[] => {
      const query = q.trim().toLowerCase()
      return SLASH_DEFS.map((d) => ({ ...d, label: t(d.labelKey) })).filter((it) => !query || it.label.toLowerCase().includes(query))
    },
    [t]
  )

  // single source of truth for popup/toolbar visibility, recomputed on every input,
  // caret move and selection change
  const refreshUi = useCallback(() => {
    const ta = taRef.current
    if (!ta) return
    const { selectionStart: s, selectionEnd: e, value: v } = ta
    // a non-empty selection → floating format toolbar, no autocomplete
    if (s !== e) {
      setLink(null)
      setSlash(null)
      const a = caretXY(ta, s)
      const b = caretXY(ta, e)
      const sameLine = Math.abs(a.top - b.top) < 2
      setSelBar({ x: sameLine ? (a.left + b.left) / 2 : a.left, y: Math.min(a.top, b.top) })
      return
    }
    setSelBar(null)
    const before = v.slice(0, s)
    const wl = before.match(TRIGGER_RE)
    if (wl) {
      setSlash(null)
      const xy = caretXY(ta, s)
      const query = wl[1]
      setLink((prev) => ({ query, start: s - query.length, index: prev && prev.query === query ? prev.index : 0, x: xy.left, y: xy.top + xy.height + 4 }))
      return
    }
    const sl = before.match(SLASH_RE)
    if (sl && slashItems(sl[1]).length) {
      setLink(null)
      const xy = caretXY(ta, s)
      const query = sl[1]
      setSlash((prev) => ({ query, start: s - query.length - 1, index: prev && prev.query === query ? prev.index : 0, x: xy.left, y: xy.top + xy.height + 4 }))
      return
    }
    setLink(null)
    setSlash(null)
  }, [slashItems])

  // commit a chosen wikilink: replace the typed query with `Title]]`, caret after ]]
  const applyLink = useCallback(
    (title: string, create: boolean) => {
      const ta = taRef.current
      if (!ta || !link) return
      const before = ta.value.slice(0, link.start) // includes the opening [[
      const after = ta.value.slice(ta.selectionStart)
      const insert = `${title}]]`
      const pos = link.start + insert.length
      setLink(null)
      edit(before + insert + after, pos, pos)
      if (create) onCreateLink?.(title)
    },
    [link, edit, onCreateLink]
  )

  const chooseItem = useCallback(
    (it: LinkItem | undefined) => {
      if (it) applyLink(it.title, it.kind === 'create')
    },
    [applyLink]
  )

  // commit a slash command: strip the "/query", then apply the markdown transform
  const applySlash = useCallback(
    (it: SlashItem | undefined) => {
      const ta = taRef.current
      if (!ta || !slash || !it) return
      const caret = ta.selectionStart
      const base = ta.value.slice(0, slash.start) + ta.value.slice(caret)
      const pos = slash.start
      setSlash(null)
      if (it.kind === 'prefix') {
        const r = linePrefixOn(base, pos, pos, it.arg)
        edit(r.next, r.e, r.e)
      } else if (it.kind === 'wrap') {
        const r = wrapOn(base, pos, pos, it.arg, it.arg)
        edit(r.next, r.s, r.s)
      } else {
        edit(base.slice(0, pos) + '[[]]' + base.slice(pos), pos + 2, pos + 2)
      }
    },
    [slash, edit]
  )

  // ── keyboard ──────────────────────────────────────────────────────────────

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (link) {
      const items = buildItems(link.query)
      if (e.key === 'ArrowDown') return (e.preventDefault(), void (items.length && setLink({ ...link, index: (link.index + 1) % items.length })))
      if (e.key === 'ArrowUp') return (e.preventDefault(), void (items.length && setLink({ ...link, index: (link.index - 1 + items.length) % items.length })))
      if ((e.key === 'Enter' || e.key === 'Tab') && items.length) return (e.preventDefault(), chooseItem(items[Math.min(link.index, items.length - 1)]))
      if (e.key === 'Escape') return (e.preventDefault(), setLink(null))
    }
    if (slash) {
      const items = slashItems(slash.query)
      if (e.key === 'ArrowDown') return (e.preventDefault(), void (items.length && setSlash({ ...slash, index: (slash.index + 1) % items.length })))
      if (e.key === 'ArrowUp') return (e.preventDefault(), void (items.length && setSlash({ ...slash, index: (slash.index - 1 + items.length) % items.length })))
      if ((e.key === 'Enter' || e.key === 'Tab') && items.length) return (e.preventDefault(), applySlash(items[Math.min(slash.index, items.length - 1)]))
      if (e.key === 'Escape') return (e.preventDefault(), setSlash(null))
    }

    if (e.key === 'Tab') {
      e.preventDefault()
      const ta = taRef.current
      if (!ta) return
      const { selectionStart: s, selectionEnd: en, value: v } = ta
      const ls = v.lastIndexOf('\n', s - 1) + 1
      let le = v.indexOf('\n', en)
      if (le === -1) le = v.length
      if (e.shiftKey) {
        const seg = v.slice(ls, le).split('\n').map((l) => l.replace(/^ {1,2}/, '')).join('\n')
        edit(v.slice(0, ls) + seg + v.slice(le), ls, ls + seg.length)
      } else if (s !== en) {
        const seg = v.slice(ls, le).split('\n').map((l) => '  ' + l).join('\n')
        edit(v.slice(0, ls) + seg + v.slice(le), ls, ls + seg.length)
      } else {
        edit(v.slice(0, s) + '  ' + v.slice(s), s + 2, s + 2)
      }
      return
    }

    if ((e.ctrlKey || e.metaKey) && e.shiftKey && physKey(e) === '3') {
      e.preventDefault()
      insertAtCaret('#')
      return
    }
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
      const k = physKey(e)
      if (k === 'b') return (e.preventDefault(), wrap('**'))
      if (k === 'i') return (e.preventDefault(), wrap('*'))
      if (k === 'e') return (e.preventDefault(), wrap('`'))
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (continueList()) e.preventDefault()
    }
  }

  // Ctrl/Cmd+click a [[wikilink]] to follow it (clickable links while editing)
  const onClick = (e: React.MouseEvent<HTMLTextAreaElement>) => {
    const ta = taRef.current
    if (!ta) return
    if ((e.ctrlKey || e.metaKey) && onOpenLink) {
      const pos = ta.selectionStart
      LINK_AT_RE.lastIndex = 0
      let m: RegExpExecArray | null
      while ((m = LINK_AT_RE.exec(ta.value))) {
        if (pos >= m.index && pos <= m.index + m[0].length) {
          e.preventDefault()
          onOpenLink(m[1].trim())
          return
        }
      }
    }
    refreshUi()
  }

  // ── menus: close on outside scroll/resize ───────────────────────────────────

  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    document.addEventListener('mousedown', close)
    document.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    window.addEventListener('blur', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
      window.removeEventListener('blur', close)
    }
  }, [menu])

  useEffect(() => {
    if (!link && !slash && !selBar) return
    const close = () => {
      setLink(null)
      setSlash(null)
      setSelBar(null)
    }
    document.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [link, slash, selBar])

  // an action that keeps the textarea selection alive (preventDefault stops the blur)
  const item = (run: () => void) => ({
    onMouseDown: (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      run()
      setMenu(null)
    },
  })

  type Row =
    | { sep: true }
    | { label: string }
    | { icon: typeof Bold; text: string; run: () => void; hint?: string }

  const rows: Row[] = [
    { label: t('notes.ctxFormat') },
    { icon: Bold, text: t('notes.bold'), run: () => wrap('**'), hint: 'Ctrl+B' },
    { icon: Italic, text: t('notes.italic'), run: () => wrap('*'), hint: 'Ctrl+I' },
    { icon: Strikethrough, text: t('notes.strike'), run: () => wrap('~~') },
    { icon: Code, text: t('notes.inlineCode'), run: () => wrap('`'), hint: 'Ctrl+E' },
    { icon: Highlighter, text: t('notes.highlight'), run: () => wrap('==') },
    { sep: true },
    { label: t('notes.ctxParagraph') },
    { icon: Heading1, text: t('notes.slash.h1'), run: () => linePrefix('# ') },
    { icon: Heading2, text: t('notes.slash.h2'), run: () => linePrefix('## ') },
    { icon: Heading3, text: t('notes.slash.h3'), run: () => linePrefix('### ') },
    { icon: List, text: t('notes.slash.bullet'), run: () => linePrefix('- ') },
    { icon: ListOrdered, text: t('notes.slash.numbered'), run: () => linePrefix('1. ') },
    { icon: ListChecks, text: t('notes.slash.todo'), run: () => linePrefix('- [ ] ') },
    { icon: Quote, text: t('notes.slash.quote'), run: () => linePrefix('> ') },
    { sep: true },
    { icon: Link2, text: t('notes.insertLink'), run: insertLink, hint: '[[ ]]' },
    { sep: true },
    { icon: Scissors, text: t('notes.cut'), run: () => clip('cut') },
    { icon: Copy, text: t('notes.copy'), run: () => clip('copy') },
    { icon: Copy, text: t('notes.paste'), run: () => clip('paste') },
    { icon: TextSelect, text: t('notes.selectAllText'), run: selectAll },
  ]

  // floating selection toolbar actions
  const selActions: { icon: typeof Bold; run: () => void; title: string }[] = [
    { icon: Bold, run: () => wrap('**'), title: t('notes.bold') },
    { icon: Italic, run: () => wrap('*'), title: t('notes.italic') },
    { icon: Strikethrough, run: () => wrap('~~'), title: t('notes.strike') },
    { icon: Code, run: () => wrap('`'), title: t('notes.inlineCode') },
    { icon: Highlighter, run: () => wrap('=='), title: t('notes.highlight') },
    { icon: Link2, run: insertLink, title: t('notes.insertLink') },
  ]

  const items = link ? buildItems(link.query) : []
  const sItems = slash ? slashItems(slash.query) : []

  return (
    <>
      <div className="relative">
        {/* live highlight overlay — tints [[links]] and #tags behind the textarea */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 select-none overflow-hidden whitespace-pre-wrap break-words p-0 text-[15px] leading-relaxed text-zinc-200"
          style={{ minHeight }}
        >
          {highlightNodes(value)}
        </div>
        <textarea
          ref={taRef}
          value={value}
          spellCheck={false}
          placeholder={placeholder}
          onChange={(e) => {
            onChange(e.target.value)
            refreshUi()
          }}
          onKeyDown={onKeyDown}
          onKeyUp={(e) => {
            if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'Shift'].includes(e.key)) refreshUi()
          }}
          onClick={onClick}
          onPaste={onPasteImage}
          onMouseUp={() => refreshUi()}
          onBlur={() => setTimeout(() => { setLink(null); setSlash(null); setSelBar(null) }, 150)}
          onContextMenu={(e) => {
            e.preventDefault()
            setMenu({ x: e.clientX, y: e.clientY })
          }}
          rows={1}
          style={{ minHeight }}
          className="relative block w-full resize-none overflow-hidden bg-transparent p-0 text-[15px] leading-relaxed text-transparent caret-zinc-200 outline-none focus:outline-none focus-visible:outline-none placeholder:text-zinc-600"
        />
      </div>

      {/* floating selection toolbar */}
      {selBar && (
        <div
          style={{
            position: 'fixed',
            left: Math.min(Math.max(selBar.x, 96), window.innerWidth - 96),
            top: selBar.y,
            transform: 'translate(-50%, calc(-100% - 8px))',
          }}
          className="z-50 flex items-center gap-0.5 rounded-lg border border-edge bg-card p-1 shadow-lg"
          onMouseDown={(e) => e.preventDefault()}
        >
          {selActions.map((a, i) => {
            const Icon = a.icon
            return (
              <button
                key={i}
                title={a.title}
                onMouseDown={(e) => {
                  e.preventDefault()
                  a.run()
                  setSelBar(null)
                }}
                className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-highlight hover:text-zinc-100"
              >
                <Icon size={15} />
              </button>
            )
          })}
        </div>
      )}

      {/* [[ autocomplete popup */}
      {link && (
        <div
          style={{
            position: 'fixed',
            left: Math.min(link.x, window.innerWidth - 260),
            top: Math.min(link.y, window.innerHeight - 24 - Math.min(items.length, 9) * 32),
          }}
          className="z-50 max-h-[300px] w-64 overflow-y-auto rounded-xl border border-edge bg-card p-1 shadow-lg"
          onMouseDown={(e) => e.preventDefault()}
        >
          {items.length === 0 ? (
            <div className="px-2.5 py-2 text-[12px] text-zinc-600">{t('notes.linkEmpty')}</div>
          ) : (
            items.map((it, i) => (
              <button
                key={it.kind === 'note' ? `n${it.id}` : 'create'}
                onMouseDown={(e) => {
                  e.preventDefault()
                  chooseItem(it)
                }}
                onMouseEnter={() => setLink((l) => (l ? { ...l, index: i } : l))}
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors ${
                  i === link.index ? 'bg-highlight text-zinc-100' : 'text-zinc-300'
                }`}
              >
                {it.kind === 'create' ? (
                  <>
                    <Plus size={14} className="shrink-0 text-accent-bright" />
                    <span className="flex-1 truncate text-accent-bright">{t('notes.linkCreate', { q: it.title })}</span>
                  </>
                ) : (
                  <>
                    <FileText size={14} className="shrink-0 text-zinc-500" />
                    <span className="flex-1 truncate">{it.title}</span>
                  </>
                )}
              </button>
            ))
          )}
        </div>
      )}

      {/* / slash command popup */}
      {slash && (
        <div
          style={{
            position: 'fixed',
            left: Math.min(slash.x, window.innerWidth - 260),
            top: Math.min(slash.y, window.innerHeight - 24 - Math.min(sItems.length, 9) * 32),
          }}
          className="z-50 max-h-[320px] w-60 overflow-y-auto rounded-xl border border-edge bg-card p-1 shadow-lg"
          onMouseDown={(e) => e.preventDefault()}
        >
          <div className="px-2.5 pb-0.5 pt-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-600">{t('notes.slashHint')}</div>
          {sItems.length === 0 ? (
            <div className="px-2.5 py-2 text-[12px] text-zinc-600">{t('notes.slashEmpty')}</div>
          ) : (
            sItems.map((it, i) => {
              const Icon = it.icon
              return (
                <button
                  key={it.key}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    applySlash(it)
                  }}
                  onMouseEnter={() => setSlash((sp) => (sp ? { ...sp, index: i } : sp))}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors ${
                    i === slash.index ? 'bg-highlight text-zinc-100' : 'text-zinc-300'
                  }`}
                >
                  <Icon size={15} className="shrink-0 text-zinc-500" />
                  <span className="flex-1 truncate">{it.label}</span>
                </button>
              )
            })
          )}
        </div>
      )}

      {menu && (
        <div
          style={{ position: 'fixed', left: Math.min(menu.x, window.innerWidth - 240), top: Math.min(menu.y, window.innerHeight - 460) }}
          className="z-50 w-56 rounded-xl border border-edge bg-card p-1 shadow-lg"
          onMouseDown={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          {rows.map((row, i) => {
            if ('sep' in row) return <div key={i} className="my-1 h-px bg-edge" />
            if ('label' in row)
              return (
                <div key={i} className="px-2.5 pb-0.5 pt-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-600">
                  {row.label}
                </div>
              )
            const Icon = row.icon
            return (
              <button
                key={i}
                {...item(row.run)}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] text-zinc-300 transition-colors hover:bg-highlight hover:text-zinc-100"
              >
                <Icon size={14} className="shrink-0 text-zinc-500" />
                <span className="flex-1">{row.text}</span>
                {row.hint && <span className="text-[10px] text-zinc-600">{row.hint}</span>}
              </button>
            )
          })}
        </div>
      )}
    </>
  )
}

// Overlay renderer — a metric-SAFE "live preview". Markdown syntax markers dim and the
// content is emphasized via COLOR / line-through / background ONLY (never font size, weight
// or style), so every glyph keeps the textarea's exact width and the caret stays aligned.
// Headings brighten, **bold** whitens, ~~strike~~ is struck, ==hl== highlighted, `code`
// tinted, [[links]] accent, #tags teal. Every input char is emitted exactly once.
const DIM = 'text-zinc-600'
const INLINE_RE = /(\[\[[^[\]\n]*?\]\])|((?<=^|\s)#[A-Za-zА-Яа-яЁё0-9_-]+)|(\*\*[^*\n]+?\*\*)|(~~[^~\n]+?~~)|(==[^=\n]+?==)|(`[^`\n]+?`)/g

function inlineTokens(line: string, heading: boolean, key: { n: number }): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  INLINE_RE.lastIndex = 0
  let last = 0
  let m: RegExpExecArray | null
  const gap = (s: string) => {
    if (!s) return
    nodes.push(heading ? <span key={key.n++} className="text-zinc-100">{s}</span> : s)
  }
  const dim = (s: string) => <span key={key.n++} className={DIM}>{s}</span>
  while ((m = INLINE_RE.exec(line))) {
    if (m.index > last) gap(line.slice(last, m.index))
    if (m[1]) nodes.push(<span key={key.n++} className="text-accent-bright">{m[1]}</span>)
    else if (m[2]) nodes.push(<span key={key.n++} className="text-teal-500">{m[2]}</span>)
    else if (m[3]) nodes.push(dim('**'), <span key={key.n++} className="text-white">{m[3].slice(2, -2)}</span>, dim('**'))
    else if (m[4]) nodes.push(dim('~~'), <span key={key.n++} className="text-zinc-500 line-through">{m[4].slice(2, -2)}</span>, dim('~~'))
    else if (m[5]) nodes.push(dim('=='), <span key={key.n++} className="rounded bg-[var(--c-yellow-bg)] text-[var(--c-yellow-text)]">{m[5].slice(2, -2)}</span>, dim('=='))
    else if (m[6]) nodes.push(dim('`'), <span key={key.n++} className="text-[var(--c-orange-text)]">{m[6].slice(1, -1)}</span>, dim('`'))
    last = m.index + m[0].length
  }
  if (last < line.length) gap(line.slice(last))
  return nodes
}

function highlightNodes(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = []
  const key = { n: 0 }
  const lines = text.split('\n')
  lines.forEach((line, li) => {
    if (li > 0) out.push('\n')
    const h = /^(#{1,6}\s)(.*)$/.exec(line)
    if (h) {
      out.push(<span key={key.n++} className={DIM}>{h[1]}</span>)
      out.push(...inlineTokens(h[2], true, key))
    } else {
      out.push(...inlineTokens(line, false, key))
    }
  })
  if (text.endsWith('\n')) out.push('​')
  return out
}
