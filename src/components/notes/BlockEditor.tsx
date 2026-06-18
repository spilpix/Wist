import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  Check,
  Code,
  GripVertical,
  Heading1,
  Heading2,
  Heading3,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Plus,
  Quote,
  Type,
} from 'lucide-react'
import {
  LIST_TYPES,
  blankBlock,
  blockPlaceholder,
  newBlockId,
  parseBlocks,
  serializeBlocks,
  type Block,
  type BlockType,
} from './blockModel'
import { renderInline } from './renderInline'
import { useI18n } from '../../i18n'

type TFn = ReturnType<typeof useI18n>['t']

type SlashCmd = { id: string; type: BlockType | 'link'; icon: typeof Type }
const SLASH: SlashCmd[] = [
  { id: 'text', type: 'paragraph', icon: Type },
  { id: 'h1', type: 'h1', icon: Heading1 },
  { id: 'h2', type: 'h2', icon: Heading2 },
  { id: 'h3', type: 'h3', icon: Heading3 },
  { id: 'bullet', type: 'bullet', icon: List },
  { id: 'numbered', type: 'numbered', icon: ListOrdered },
  { id: 'todo', type: 'todo', icon: ListChecks },
  { id: 'quote', type: 'quote', icon: Quote },
  { id: 'code', type: 'code', icon: Code },
  { id: 'divider', type: 'divider', icon: Minus },
  { id: 'link', type: 'link', icon: Link2 },
]

// markdown shortcut: typing one of these at the very start of a paragraph converts it
function detectShortcut(v: string): { type: BlockType; rest: string } | null {
  let m: RegExpExecArray | null
  if ((m = /^#\s(.*)$/.exec(v))) return { type: 'h1', rest: m[1] }
  if ((m = /^##\s(.*)$/.exec(v))) return { type: 'h2', rest: m[1] }
  if ((m = /^###\s(.*)$/.exec(v))) return { type: 'h3', rest: m[1] }
  if ((m = /^[-*]\s\[\s?\]\s(.*)$/.exec(v))) return { type: 'todo', rest: m[1] }
  if ((m = /^\[\]\s(.*)$/.exec(v))) return { type: 'todo', rest: m[1] }
  if ((m = /^[-*]\s(.*)$/.exec(v))) return { type: 'bullet', rest: m[1] }
  if ((m = /^\d+\.\s(.*)$/.exec(v))) return { type: 'numbered', rest: m[1] }
  if ((m = /^>\s(.*)$/.exec(v))) return { type: 'quote', rest: m[1] }
  if (/^```$/.test(v) || /^```\s$/.test(v)) return { type: 'code', rest: '' }
  if (/^(-{3,})\s$/.test(v)) return { type: 'divider', rest: '' }
  return null
}

export default function BlockEditor({
  value,
  onChange,
  noteKey,
  linkCandidates,
  onOpenLink,
  t,
  placeholder,
}: {
  value: string
  onChange: (md: string) => void
  noteKey: string | number
  linkCandidates: Array<{ name: string; kind: 'title' | 'note' }>
  onOpenLink: (name: string) => void
  t: TFn
  placeholder?: string
}) {
  const [blocks, setBlocks] = useState<Block[]>(() => parseBlocks(value))
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const [slash, setSlash] = useState<{ blockId: string; items: SlashCmd[] } | null>(null)
  const [slashIdx, setSlashIdx] = useState(0)
  const [wiki, setWiki] = useState<{ blockId: string; items: Array<{ name: string; kind: 'title' | 'note' }> } | null>(null)
  const [wikiIdx, setWikiIdx] = useState(0)
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)

  const blocksRef = useRef(blocks)
  blocksRef.current = blocks
  const taRef = useRef<HTMLTextAreaElement | null>(null)
  const pendingCaret = useRef<number | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)

  // re-parse only when the note changes (NOT on every value tick — value is derived from blocks)
  useEffect(() => {
    setBlocks(parseBlocks(value))
    setFocusedId(null)
    setSlash(null)
    setWiki(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteKey])

  const commit = useCallback(
    (next: Block[]) => {
      setBlocks(next)
      onChange(serializeBlocks(next))
    },
    [onChange]
  )

  const autosize = (ta: HTMLTextAreaElement | null) => {
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${ta.scrollHeight}px`
  }

  // focus the active block's textarea + restore caret
  useLayoutEffect(() => {
    if (focusedId == null) return
    const ta = taRef.current
    if (!ta) return
    ta.focus()
    if (pendingCaret.current != null) {
      const p = Math.max(0, Math.min(pendingCaret.current, ta.value.length))
      ta.setSelectionRange(p, p)
      pendingCaret.current = null
    }
    autosize(ta)
  }, [focusedId])

  // clicking outside the editor exits edit mode (so blocks render formatted)
  useEffect(() => {
    if (focusedId == null) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setFocusedId(null)
        setSlash(null)
        setWiki(null)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [focusedId])

  const focusBlock = (id: string, caret: number) => {
    pendingCaret.current = caret
    setSlash(null)
    setWiki(null)
    setFocusedId(id)
  }
  const setCaretSoon = (pos: number) => {
    requestAnimationFrame(() => {
      const ta = taRef.current
      if (!ta) return
      const p = Math.max(0, Math.min(pos, ta.value.length))
      ta.setSelectionRange(p, p)
      autosize(ta)
    })
  }

  const idx = (id: string) => blocksRef.current.findIndex((b) => b.id === id)

  // ---- menus ----
  const openMenus = (block: Block, value: string, caret: number) => {
    const upto = value.slice(0, caret)
    const sm = /(^|\s)\/([^\s/]*)$/.exec(upto)
    if (sm) {
      const q = sm[2].toLowerCase()
      const items = SLASH.filter((c) => !q || c.id.includes(q) || t(`notes.slash.${c.id}` as 'notes.slash.h1').toLowerCase().includes(q))
      setWiki(null)
      setSlash(items.length ? { blockId: block.id, items } : null)
      setSlashIdx(0)
      return
    }
    setSlash(null)
    const wm = /\[\[([^\][]*)$/.exec(upto)
    if (wm) {
      const q = wm[1].toLowerCase()
      const items = linkCandidates.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 6)
      setWiki(items.length ? { blockId: block.id, items } : null)
      setWikiIdx(0)
    } else {
      setWiki(null)
    }
  }

  // ---- editing ----
  const handleChange = (block: Block, value: string, caret: number) => {
    // markdown shortcut conversion (only from a plain paragraph, at the start)
    if (block.type === 'paragraph') {
      const conv = detectShortcut(value)
      if (conv) {
        if (conv.type === 'divider') {
          // a divider + a fresh paragraph beneath to keep typing
          const i = idx(block.id)
          const nb = blankBlock('paragraph')
          const next = [...blocksRef.current]
          next[i] = { ...block, type: 'divider', text: '' }
          next.splice(i + 1, 0, nb)
          commit(next)
          focusBlock(nb.id, 0)
          return
        }
        commit(blocksRef.current.map((b) => (b.id === block.id ? { ...b, type: conv.type, text: conv.rest } : b)))
        setSlash(null)
        setWiki(null)
        setCaretSoon(0)
        return
      }
    }
    commit(blocksRef.current.map((b) => (b.id === block.id ? { ...b, text: value } : b)))
    openMenus(block, value, caret)
    requestAnimationFrame(() => autosize(taRef.current))
  }

  const splitBlock = (block: Block, caret: number) => {
    const i = idx(block.id)
    const left = block.text.slice(0, caret)
    const right = block.text.slice(caret)
    // pressing Enter on an empty list/quote item exits to a paragraph
    if ((LIST_TYPES.includes(block.type) || block.type === 'quote') && !left.trim() && !right.trim()) {
      commit(blocksRef.current.map((b) => (b.id === block.id ? { ...b, type: 'paragraph' } : b)))
      return
    }
    const contType: BlockType =
      block.type === 'bullet'
        ? 'bullet'
        : block.type === 'numbered'
          ? 'numbered'
          : block.type === 'todo' || block.type === 'todoDone'
            ? 'todo'
            : 'paragraph'
    const nb: Block = { id: newBlockId(), type: contType, text: right }
    const next = [...blocksRef.current]
    next[i] = { ...block, text: left }
    next.splice(i + 1, 0, nb)
    commit(next)
    focusBlock(nb.id, 0)
  }

  const mergePrev = (block: Block) => {
    const i = idx(block.id)
    if (i <= 0) return
    const prev = blocksRef.current[i - 1]
    if (prev.type === 'divider') {
      const next = [...blocksRef.current]
      next.splice(i - 1, 1)
      commit(next)
      return
    }
    const caretPos = prev.text.length
    const next = [...blocksRef.current]
    next[i - 1] = { ...prev, text: prev.text + block.text }
    next.splice(i, 1)
    commit(next)
    focusBlock(prev.id, caretPos)
  }

  const changeType = (block: Block, type: BlockType, keepText = true) => {
    commit(blocksRef.current.map((b) => (b.id === block.id ? { ...b, type, text: keepText ? b.text : '' } : b)))
  }

  const addBelow = (block: Block) => {
    const i = idx(block.id)
    const nb = blankBlock('paragraph')
    const next = [...blocksRef.current]
    next.splice(i + 1, 0, nb)
    commit(next)
    focusBlock(nb.id, 0)
  }

  const removeBlock = (id: string) => {
    const i = idx(id)
    const next = blocksRef.current.filter((b) => b.id !== id)
    if (!next.length) next.push(blankBlock())
    commit(next)
    const focus = next[Math.max(0, i - 1)]
    if (focus) focusBlock(focus.id, focus.text.length)
  }

  const toggleTodo = (block: Block) => {
    changeType(block, block.type === 'todo' ? 'todoDone' : 'todo')
  }

  // ---- menu apply ----
  const applySlash = (block: Block, cmd: SlashCmd) => {
    const ta = taRef.current
    const caret = ta ? ta.selectionStart : block.text.length
    const m = /(^|\s)\/([^\s/]*)$/.exec(block.text.slice(0, caret))
    const start = m ? caret - m[2].length - 1 : caret
    const cleaned = block.text.slice(0, start) + block.text.slice(caret)
    setSlash(null)
    if (cmd.type === 'link') {
      const withLink = cleaned.slice(0, start) + '[[' + cleaned.slice(start)
      commit(blocksRef.current.map((b) => (b.id === block.id ? { ...b, text: withLink } : b)))
      setCaretSoon(start + 2)
      requestAnimationFrame(() => openMenus(block, withLink, start + 2))
      return
    }
    if (cmd.type === 'divider') {
      const i = idx(block.id)
      const nb = blankBlock('paragraph')
      const next = [...blocksRef.current]
      next[i] = { ...block, type: 'divider', text: '' }
      next.splice(i + 1, 0, nb)
      commit(next)
      focusBlock(nb.id, 0)
      return
    }
    commit(blocksRef.current.map((b) => (b.id === block.id ? { ...b, type: cmd.type as BlockType, text: cleaned } : b)))
    setCaretSoon(start)
  }

  const applyWiki = (block: Block, name: string) => {
    const ta = taRef.current
    const caret = ta ? ta.selectionStart : block.text.length
    const before = block.text.slice(0, caret).replace(/\[\[([^\][]*)$/, `[[${name}]]`)
    const text = before + block.text.slice(caret)
    setWiki(null)
    commit(blocksRef.current.map((b) => (b.id === block.id ? { ...b, text } : b)))
    setCaretSoon(before.length)
  }

  // ---- keydown on the active textarea ----
  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>, block: Block) => {
    const ta = e.currentTarget
    // inline formatting: Ctrl/Cmd+B bold, +I italic, +E code — wraps the selection
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && ['b', 'i', 'e'].includes(e.key.toLowerCase())) {
      e.preventDefault()
      const wrap = e.key.toLowerCase() === 'b' ? '**' : e.key.toLowerCase() === 'i' ? '*' : '`'
      const s = ta.selectionStart
      const en = ta.selectionEnd
      const sel = block.text.slice(s, en)
      const next = block.text.slice(0, s) + wrap + sel + wrap + block.text.slice(en)
      commit(blocksRef.current.map((b) => (b.id === block.id ? { ...b, text: next } : b)))
      setCaretSoon(sel ? en + wrap.length * 2 : s + wrap.length)
      return
    }
    if (slash && slash.blockId === block.id) {
      if (e.key === 'ArrowDown') return e.preventDefault(), setSlashIdx((i) => Math.min(i + 1, slash.items.length - 1))
      if (e.key === 'ArrowUp') return e.preventDefault(), setSlashIdx((i) => Math.max(i - 1, 0))
      if (e.key === 'Enter' || e.key === 'Tab') return e.preventDefault(), applySlash(block, slash.items[slashIdx])
      if (e.key === 'Escape') return setSlash(null)
    }
    if (wiki && wiki.blockId === block.id) {
      if (e.key === 'ArrowDown') return e.preventDefault(), setWikiIdx((i) => Math.min(i + 1, wiki.items.length - 1))
      if (e.key === 'ArrowUp') return e.preventDefault(), setWikiIdx((i) => Math.max(i - 1, 0))
      if (e.key === 'Enter' || e.key === 'Tab') return e.preventDefault(), applyWiki(block, wiki.items[wikiIdx].name)
      if (e.key === 'Escape') return setWiki(null)
    }
    const caret = ta.selectionStart
    const collapsed = ta.selectionStart === ta.selectionEnd
    if (e.key === 'Enter' && block.type === 'code' && !e.shiftKey) return // newline inside code
    if (e.key === 'Enter') {
      e.preventDefault()
      splitBlock(block, caret)
      return
    }
    if (e.key === 'Backspace' && collapsed && caret === 0) {
      if (block.type !== 'paragraph') {
        e.preventDefault()
        changeType(block, 'paragraph')
        return
      }
      if (idx(block.id) > 0) {
        e.preventDefault()
        mergePrev(block)
        return
      }
    }
    if (e.key === 'ArrowUp' && collapsed && caret === 0) {
      const i = idx(block.id)
      if (i > 0) {
        e.preventDefault()
        const prev = blocksRef.current[i - 1]
        if (prev.type === 'divider' && i > 1) focusBlock(blocksRef.current[i - 2].id, blocksRef.current[i - 2].text.length)
        else if (prev.type !== 'divider') focusBlock(prev.id, prev.text.length)
      }
    }
    if (e.key === 'ArrowDown' && collapsed && caret === ta.value.length) {
      const i = idx(block.id)
      if (i < blocksRef.current.length - 1) {
        e.preventDefault()
        const nx = blocksRef.current[i + 1]
        if (nx.type === 'divider' && i + 2 < blocksRef.current.length) focusBlock(blocksRef.current[i + 2].id, 0)
        else if (nx.type !== 'divider') focusBlock(nx.id, 0)
      }
    }
  }

  // ---- drag reorder ----
  const drop = (targetId: string) => {
    if (!dragId || dragId === targetId) return
    const from = idx(dragId)
    const moving = blocksRef.current[from]
    const without = blocksRef.current.filter((b) => b.id !== dragId)
    const to = without.findIndex((b) => b.id === targetId)
    without.splice(to, 0, moving)
    commit(without)
  }

  // numbering for ordered-list runs
  const numbers: Record<string, number> = {}
  let run = 0
  for (const b of blocks) {
    if (b.type === 'numbered') {
      run += 1
      numbers[b.id] = run
    } else run = 0
  }

  return (
    <div ref={rootRef} className="space-y-0.5">
      {blocks.map((block) => {
        const focused = focusedId === block.id
        const showSlash = slash && slash.blockId === block.id
        const showWiki = wiki && wiki.blockId === block.id
        return (
          <div
            key={block.id}
            className={`group/blk relative flex items-start gap-1 rounded-lg ${overId === block.id && dragId ? 'border-t-2 border-accent' : ''}`}
            onDragOver={(e) => {
              if (!dragId) return
              e.preventDefault()
              if (overId !== block.id) setOverId(block.id)
            }}
            onDrop={(e) => {
              e.preventDefault()
              drop(block.id)
              setDragId(null)
              setOverId(null)
            }}
          >
            {/* gutter */}
            <div className="flex shrink-0 items-center gap-0.5 pt-1 opacity-0 transition-opacity group-hover/blk:opacity-100">
              <button
                onMouseDown={(e) => {
                  e.preventDefault()
                  addBelow(block)
                }}
                className="rounded-lg p-1 text-zinc-600 transition-colors hover:bg-highlight hover:text-zinc-300"
                title={t('notes.addBlock')}
              >
                <Plus size={14} />
              </button>
              <span
                draggable
                onDragStart={(e) => {
                  setDragId(block.id)
                  e.dataTransfer.effectAllowed = 'move'
                  e.dataTransfer.setData('text/block', block.id)
                }}
                onDragEnd={() => {
                  setDragId(null)
                  setOverId(null)
                }}
                className="cursor-grab rounded-lg p-1 text-zinc-600 transition-colors hover:bg-highlight hover:text-zinc-300 active:cursor-grabbing"
                title={t('notes.dragBlock')}
              >
                <GripVertical size={14} />
              </span>
            </div>

            {/* content */}
            <div className="relative min-w-0 flex-1">
              {block.type === 'divider' ? (
                <div onClick={() => addBelow(block)} className="cursor-pointer py-2">
                  <hr className="border-edge" />
                </div>
              ) : focused ? (
                <BlockTextarea
                  block={block}
                  number={numbers[block.id]}
                  taRef={taRef}
                  placeholder={block.type === 'paragraph' ? placeholder ?? blockPlaceholder(block.type) : blockPlaceholder(block.type)}
                  onChange={(v, caret) => handleChange(block, v, caret)}
                  onKeyDown={(e) => onKeyDown(e, block)}
                  autosize={autosize}
                />
              ) : (
                <RenderedBlock
                  block={block}
                  number={numbers[block.id]}
                  onOpenLink={onOpenLink}
                  onFocus={() => focusBlock(block.id, block.text.length)}
                  onToggleTodo={() => toggleTodo(block)}
                />
              )}

              {showSlash && (
                <Menu>
                  {slash!.items.map((cmd, i) => {
                    const Icon = cmd.icon
                    return (
                      <button
                        key={cmd.id}
                        onMouseMove={() => setSlashIdx(i)}
                        onMouseDown={(e) => {
                          e.preventDefault()
                          applySlash(block, cmd)
                        }}
                        className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors ${
                          i === slashIdx ? 'bg-highlight text-zinc-100' : 'text-zinc-300 hover:bg-highlight'
                        }`}
                      >
                        <Icon size={14} className="shrink-0 text-zinc-500" />
                        <span>{t(`notes.slash.${cmd.id}` as 'notes.slash.h1')}</span>
                      </button>
                    )
                  })}
                </Menu>
              )}
              {showWiki && (
                <Menu>
                  {wiki!.items.map((item, i) => (
                    <button
                      key={`${item.kind}-${item.name}`}
                      onMouseMove={() => setWikiIdx(i)}
                      onMouseDown={(e) => {
                        e.preventDefault()
                        applyWiki(block, item.name)
                      }}
                      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors ${
                        i === wikiIdx ? 'bg-highlight text-zinc-100' : 'text-zinc-300 hover:bg-highlight'
                      }`}
                    >
                      <Link2 size={11} className="shrink-0 text-zinc-600" />
                      <span className="truncate">{item.name}</span>
                      <span className="ml-auto text-[10px] uppercase text-zinc-600">
                        {item.kind === 'title' ? t('world.kind.title') : t('world.kind.note')}
                      </span>
                    </button>
                  ))}
                </Menu>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function Menu({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="absolute left-0 top-full z-20 mt-1 w-60 rounded-2xl border border-edge bg-card p-1.5"
      style={{ boxShadow: 'var(--float-shadow)' }}
    >
      {children}
    </div>
  )
}

// the active block, edited as raw markdown in an auto-growing textarea
function BlockTextarea({
  block,
  number,
  taRef,
  placeholder,
  onChange,
  onKeyDown,
  autosize,
}: {
  block: Block
  number?: number
  taRef: React.MutableRefObject<HTMLTextAreaElement | null>
  placeholder: string
  onChange: (value: string, caret: number) => void
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
  autosize: (ta: HTMLTextAreaElement | null) => void
}) {
  const localRef = useRef<HTMLTextAreaElement | null>(null)
  useLayoutEffect(() => {
    autosize(localRef.current)
  })
  const cls = TEXTAREA_CLASS[block.type] ?? 'text-[15px] leading-relaxed text-zinc-200'
  return (
    <div className={ROW_CLASS[block.type] ?? ''}>
      {block.type === 'bullet' && <span className="select-none pt-[5px] text-zinc-500">•</span>}
      {block.type === 'numbered' && <span className="select-none pt-[3px] text-sm text-zinc-500">{number ?? 1}.</span>}
      {(block.type === 'todo' || block.type === 'todoDone') && (
        <span className="mt-[5px] h-[17px] w-[17px] shrink-0 rounded-[5px] border-[1.6px] border-zinc-600" />
      )}
      <textarea
        ref={(el) => {
          localRef.current = el
          taRef.current = el
        }}
        rows={1}
        value={block.text}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value, e.target.selectionStart)}
        onKeyDown={onKeyDown}
        className={`block w-full resize-none overflow-hidden bg-transparent outline-none placeholder:text-zinc-600 ${cls}`}
      />
    </div>
  )
}

// a block shown formatted (not being edited) — click to start editing
function RenderedBlock({
  block,
  number,
  onOpenLink,
  onFocus,
  onToggleTodo,
}: {
  block: Block
  number?: number
  onOpenLink: (name: string) => void
  onFocus: () => void
  onToggleTodo: () => void
}) {
  const empty = !block.text.trim()
  if (block.type === 'code') {
    return (
      <pre
        onClick={onFocus}
        className="cursor-text overflow-x-auto rounded-lg border border-edge bg-field px-3.5 py-3 font-mono text-[13px] leading-relaxed text-zinc-200"
      >
        {block.text || ' '}
      </pre>
    )
  }
  const inner = empty ? <span className="text-zinc-600">&nbsp;</span> : renderInline(block.text, onOpenLink)
  if (block.type === 'h1') return <h1 onClick={onFocus} className="cursor-text pt-2 text-3xl font-bold leading-tight text-zinc-100">{inner}</h1>
  if (block.type === 'h2') return <h2 onClick={onFocus} className="cursor-text pt-1.5 text-2xl font-bold leading-snug text-zinc-100">{inner}</h2>
  if (block.type === 'h3') return <h3 onClick={onFocus} className="cursor-text pt-1 text-lg font-semibold text-zinc-100">{inner}</h3>
  if (block.type === 'quote')
    return (
      <blockquote onClick={onFocus} className="cursor-text border-l-[3px] border-zinc-600 pl-3.5 text-[15px] italic leading-relaxed text-zinc-300">
        {inner}
      </blockquote>
    )
  if (block.type === 'bullet')
    return (
      <div onClick={onFocus} className="flex cursor-text gap-2 text-[15px] leading-relaxed text-zinc-200">
        <span className="select-none pt-[2px] text-zinc-500">•</span>
        <div className="min-w-0 flex-1">{inner}</div>
      </div>
    )
  if (block.type === 'numbered')
    return (
      <div onClick={onFocus} className="flex cursor-text gap-2 text-[15px] leading-relaxed text-zinc-200">
        <span className="select-none pt-[1px] text-sm text-zinc-500">{number ?? 1}.</span>
        <div className="min-w-0 flex-1">{inner}</div>
      </div>
    )
  if (block.type === 'todo' || block.type === 'todoDone') {
    const done = block.type === 'todoDone'
    return (
      <div className="flex gap-2.5 text-[15px] leading-relaxed">
        <button
          onMouseDown={(e) => {
            e.preventDefault()
            onToggleTodo()
          }}
          className={`mt-[3px] grid h-[17px] w-[17px] shrink-0 place-items-center rounded-[5px] border-[1.6px] transition-colors ${
            done ? 'border-accent bg-accent text-[#fff]' : 'border-zinc-600 hover:border-accent'
          }`}
        >
          {done && <Check size={12} strokeWidth={3.5} className="animate-check-pop" />}
        </button>
        <div onClick={onFocus} className={`min-w-0 flex-1 cursor-text ${done ? 'text-zinc-500 line-through' : 'text-zinc-200'}`}>
          {inner}
        </div>
      </div>
    )
  }
  return <p onClick={onFocus} className="cursor-text text-[15px] leading-relaxed text-zinc-200">{inner}</p>
}

const ROW_CLASS: Partial<Record<BlockType, string>> = {
  bullet: 'flex gap-2',
  numbered: 'flex gap-2',
  todo: 'flex gap-2',
  todoDone: 'flex gap-2',
}
const TEXTAREA_CLASS: Partial<Record<BlockType, string>> = {
  h1: 'text-3xl font-bold leading-tight text-zinc-100',
  h2: 'text-2xl font-bold leading-snug text-zinc-100',
  h3: 'text-lg font-semibold text-zinc-100',
  quote: 'border-l-[3px] border-zinc-600 pl-3.5 text-[15px] italic leading-relaxed text-zinc-300',
  code: 'rounded-lg border border-edge bg-field px-3.5 py-3 font-mono text-[13px] leading-relaxed text-zinc-200',
  bullet: 'text-[15px] leading-relaxed text-zinc-200',
  numbered: 'text-[15px] leading-relaxed text-zinc-200',
  todo: 'text-[15px] leading-relaxed text-zinc-200',
  todoDone: 'text-[15px] leading-relaxed text-zinc-200',
}
