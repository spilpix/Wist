import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  Bold,
  Code,
  Copy,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Quote,
  Scissors,
  Strikethrough,
  TextSelect,
} from 'lucide-react'
import { physKey } from '../../lib/keyboard'
import { useI18n } from '../../i18n'

type TFn = ReturnType<typeof useI18n>['t']

/**
 * PlainEditor — an Obsidian "source mode"-style editor: a single auto-growing
 * textarea of raw markdown, no blocks/boxes/gutters. Formatting is done through a
 * right-click context menu (and Ctrl+B / I / E). Tags live inline as #tag.
 */
export default function PlainEditor({
  value,
  onChange,
  noteKey,
  t,
  placeholder,
}: {
  value: string
  onChange: (md: string) => void
  noteKey: string | number
  t: TFn
  placeholder?: string
}) {
  const taRef = useRef<HTMLTextAreaElement | null>(null)
  const pendingSel = useRef<[number, number] | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)

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

  // reset scroll/caret when switching notes
  useEffect(() => {
    pendingSel.current = null
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
      const { selectionStart: s, selectionEnd: e, value: v } = ta
      const sel = v.slice(s, e)
      const next = v.slice(0, s) + open + sel + close + v.slice(e)
      edit(next, s + open.length, e + open.length)
    },
    [edit]
  )

  const insertAtCaret = useCallback(
    (str: string) => {
      const ta = taRef.current
      if (!ta) return
      const { selectionStart: s, selectionEnd: e, value: v } = ta
      const next = v.slice(0, s) + str + v.slice(e)
      edit(next, s + str.length, s + str.length)
    },
    [edit]
  )

  // add a line-level prefix (heading / list / quote) to every line in the selection,
  // stripping any existing marker first
  const linePrefix = useCallback(
    (prefix: string) => {
      const ta = taRef.current
      if (!ta) return
      const v = ta.value
      const ls = v.lastIndexOf('\n', ta.selectionStart - 1) + 1
      let le = v.indexOf('\n', ta.selectionEnd)
      if (le === -1) le = v.length
      const seg = v
        .slice(ls, le)
        .split('\n')
        .map((line) => prefix + line.replace(/^\s*(#{1,6}\s+|>\s+|[-*]\s\[[ xX]?\]\s+|[-*]\s+|\d+\.\s+)/, ''))
        .join('\n')
      const next = v.slice(0, ls) + seg + v.slice(le)
      edit(next, ls, ls + seg.length)
    },
    [edit]
  )

  const insertLink = useCallback(() => {
    const ta = taRef.current
    if (!ta) return
    const { selectionStart: s, selectionEnd: e, value: v } = ta
    const sel = v.slice(s, e)
    const next = v.slice(0, s) + '[[' + sel + ']]' + v.slice(e)
    edit(next, s + 2, s + 2 + sel.length)
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

  // ── keyboard ──────────────────────────────────────────────────────────────

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
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
  }

  // ── context menu ──────────────────────────────────────────────────────────

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

  return (
    <>
      <textarea
        ref={taRef}
        value={value}
        spellCheck={false}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onContextMenu={(e) => {
          e.preventDefault()
          setMenu({ x: e.clientX, y: e.clientY })
        }}
        rows={1}
        style={{ minHeight: '64vh' }}
        className="block w-full resize-none overflow-hidden bg-transparent text-[15px] leading-relaxed text-zinc-200 outline-none focus:outline-none focus-visible:outline-none placeholder:text-zinc-600"
      />

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
