import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Code,
  Eye,
  Heading1,
  Heading2,
  Heading3,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  PenLine,
  Pin,
  Plus,
  Quote,
  Search,
  Trash2,
} from 'lucide-react'
import MarkdownView from '../components/MarkdownView'
import ChipsInput from '../components/ui/ChipsInput'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import EmptyState from '../components/ui/EmptyState'
import Spinner from '../components/ui/Spinner'
import { toast } from '../store/toastStore'
import type { Note, Title } from '../types/models'
import { formatRelative } from '../utils/formatters'
import { useI18n, t as tGlobal } from '../i18n'

/**
 * Notes — Obsidian-style two-pane: searchable list on the left, a permanent
 * editor on the right with [[wiki-link]] autocomplete and a backlinks panel.
 */

interface Draft {
  id: number | null
  title: string
  content: string
  tags: string[]
  linked_title_id: number | null
  project_id: number | null
  pinned: boolean
  token: number // stable per editing session — binds autosaves to one note, even before its DB id exists
}

let draftToken = 0
const emptyDraft = (projectId: number | null = null): Draft => ({
  id: null,
  title: '',
  content: '',
  tags: [],
  linked_title_id: null,
  project_id: projectId,
  pinned: false,
  token: ++draftToken,
})

type SaveState = 'idle' | 'saving' | 'saved'

// Notion-style "/" block commands — insert markdown for the chosen block
const SLASH_COMMANDS = [
  { id: 'h1', icon: Heading1, insert: '# ' },
  { id: 'h2', icon: Heading2, insert: '## ' },
  { id: 'h3', icon: Heading3, insert: '### ' },
  { id: 'bullet', icon: List, insert: '- ' },
  { id: 'numbered', icon: ListOrdered, insert: '1. ' },
  { id: 'todo', icon: ListChecks, insert: '- [ ] ' },
  { id: 'quote', icon: Quote, insert: '> ' },
  { id: 'divider', icon: Minus, insert: '\n---\n' },
  { id: 'code', icon: Code, insert: '```\n\n```' },
  { id: 'link', icon: Link2, insert: '[[' },
] as const
type SlashCmd = (typeof SLASH_COMMANDS)[number]

export default function Notes() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [notes, setNotes] = useState<Note[] | null>(null)
  const [titles, setTitles] = useState<Title[]>([])
  const [search, setSearch] = useState('')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [suggest, setSuggest] = useState<{ query: string; items: Array<{ name: string; kind: 'title' | 'note' }> } | null>(null)
  const [suggestIdx, setSuggestIdx] = useState(0)
  const [slash, setSlash] = useState<{ items: SlashCmd[] } | null>(null)
  const [slashIdx, setSlashIdx] = useState(0)
  const [preview, setPreview] = useState(false)

  const draftRef = useRef<Draft | null>(null)
  draftRef.current = draft
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const contentRef = useRef<HTMLTextAreaElement>(null)
  // serialize saves so a slow create can't race a second create; token→dbId remembers
  // what each editing session created so repeats become updates, not duplicate rows.
  const saveChain = useRef<Promise<unknown>>(Promise.resolve())
  const createdByToken = useRef<Map<number, number>>(new Map())

  const load = useCallback(async () => {
    const [ns, ts] = await Promise.all([window.wist.notes.list({}), window.wist.titles.list({})])
    setNotes(ns)
    setTitles(ts)
    return ns
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // ---------- saving ----------
  const persist = useCallback((d: Draft): Promise<number | null> => {
    const run = saveChain.current.then(async (): Promise<number | null> => {
      // resolve this session's row id: explicit id, or one a prior queued save created
      const existingId = d.id ?? createdByToken.current.get(d.token) ?? null
      // never create empty rows for a brand-new note; an existing note may be emptied
      if (existingId == null && !d.title.trim() && !d.content.trim()) return null
      setSaveState('saving')
      const payload = {
        title: d.title.trim(),
        content: d.content,
        tags: d.tags,
        linked_title_id: d.linked_title_id,
        project_id: d.project_id,
        pinned: (d.pinned ? 1 : 0) as 0 | 1,
      }
      let savedId: number
      if (existingId != null) {
        savedId = (await window.wist.notes.update(existingId, payload)).id
      } else {
        savedId = (await window.wist.notes.create(payload)).id
        createdByToken.current.set(d.token, savedId)
      }
      setSaveState('saved')
      await load()
      return savedId
    })
    saveChain.current = run.catch(() => undefined)
    return run
  }, [load])

  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      const d = draftRef.current
      if (!d) return
      const id = await persist(d)
      // attach the new id only if we're still editing the same session
      if (id != null && draftRef.current && draftRef.current.id == null && draftRef.current.token === d.token) {
        setDraft((cur) => (cur ? { ...cur, id } : cur))
      }
    }, 700)
  }, [persist])

  // flush on unmount
  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      const d = draftRef.current
      if (d && (d.title.trim() || d.content.trim())) persist(d)
    },
    [persist]
  )

  const patchDraft = (patch: Partial<Draft>) => {
    setDraft((d) => (d ? { ...d, ...patch } : d))
    setSaveState('idle')
    scheduleSave()
  }

  const openNote = useCallback((nt: Note) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    const prev = draftRef.current
    if (prev && prev.id !== nt.id && (prev.title.trim() || prev.content.trim())) persist(prev)
    setDraft({
      id: nt.id,
      title: nt.title,
      content: nt.content,
      tags: nt.tags,
      linked_title_id: nt.linked_title_id,
      project_id: nt.project_id,
      pinned: !!nt.pinned,
      token: ++draftToken,
    })
    setSaveState('saved')
    setSuggest(null)
    setSlash(null)
  }, [persist])

  const newNote = useCallback((projectId?: number) => {
    // guard: onClick passes a MouseEvent — only honour a real numeric project id
    const pid = typeof projectId === 'number' ? projectId : null
    if (saveTimer.current) clearTimeout(saveTimer.current)
    const prev = draftRef.current
    if (prev && (prev.title.trim() || prev.content.trim())) persist(prev)
    setDraft(emptyDraft(pid))
    setSaveState('idle')
    setSuggest(null)
    setSlash(null)
  }, [persist])

  // deep links: ?open=<id> и ?new=1
  useEffect(() => {
    if (!notes) return
    const openId = searchParams.get('open')
    if (openId) {
      const nt = notes.find((x) => x.id === Number(openId))
      if (nt) openNote(nt)
      setSearchParams({}, { replace: true })
    } else if (searchParams.get('new') === '1') {
      const proj = searchParams.get('project')
      newNote(proj ? Number(proj) : undefined) // flushes any dirty draft before clearing; seeds project link
      setSearchParams({}, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes === null, searchParams])

  const deleteNote = async () => {
    if (draft?.id == null) return
    await window.wist.notes.remove(draft.id)
    setConfirmDelete(false)
    setDraft(null)
    toast(tGlobal('notes.deleted'))
    load()
  }

  // ---------- [[autocomplete]] ----------
  const linkCandidates = useMemo(() => {
    const out: Array<{ name: string; kind: 'title' | 'note' }> = []
    for (const ti of titles) out.push({ name: ti.title, kind: 'title' })
    for (const nt of notes ?? []) if (nt.title && nt.id !== draft?.id) out.push({ name: nt.title, kind: 'note' })
    return out
  }, [titles, notes, draft?.id])

  const refreshSuggest = (value: string, caret: number) => {
    const upto = value.slice(0, caret)
    const m = /\[\[([^\][]*)$/.exec(upto)
    if (!m) {
      setSuggest(null)
      return
    }
    const q = m[1].toLowerCase()
    const items = linkCandidates.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 6)
    setSuggest(items.length ? { query: m[1], items } : null)
    setSuggestIdx(0)
  }

  const applySuggestion = (name: string) => {
    const ta = contentRef.current
    const d = draftRef.current
    if (!ta || !d) return
    const caret = ta.selectionStart
    const upto = d.content.slice(0, caret).replace(/\[\[([^\][]*)$/, `[[${name}]]`)
    const next = upto + d.content.slice(caret)
    patchDraft({ content: next })
    setSuggest(null)
    requestAnimationFrame(() => {
      ta.focus()
      ta.selectionStart = ta.selectionEnd = upto.length
    })
  }

  // ---------- "/" slash block commands ----------
  const refreshSlash = (value: string, caret: number) => {
    // [^\s/] keeps the query going for Cyrillic too (\w is ASCII-only)
    const m = /(^|\s)\/([^\s/]*)$/.exec(value.slice(0, caret))
    if (!m) {
      setSlash(null)
      return
    }
    const q = m[2].toLowerCase()
    const items = [...SLASH_COMMANDS].filter(
      (c) => !q || c.id.includes(q) || t(`notes.slash.${c.id}` as 'notes.slash.h1').toLowerCase().includes(q)
    )
    if (items.length) {
      setSuggest(null) // slash wins — never show both menus at once
      setSlash({ items })
    } else {
      setSlash(null)
    }
    setSlashIdx(0)
  }

  const applySlash = (cmd: SlashCmd) => {
    const ta = contentRef.current
    const d = draftRef.current
    if (!ta || !d) return
    const caret = ta.selectionStart
    const m = /(^|\s)\/([^\s/]*)$/.exec(d.content.slice(0, caret))
    if (!m) return
    const start = caret - m[2].length - 1 // index of the "/"
    const before = d.content.slice(0, start)
    const after = d.content.slice(caret)
    const next = before + cmd.insert + after
    patchDraft({ content: next })
    setSlash(null)
    const caretPos = cmd.id === 'code' ? (before + '```\n').length : (before + cmd.insert).length
    requestAnimationFrame(() => {
      ta.focus()
      ta.selectionStart = ta.selectionEnd = caretPos
      if (cmd.id === 'link') refreshSuggest(next, caretPos) // chain straight into [[ ]] picker
    })
  }

  // ---------- backlinks / outgoing ----------
  const backlinks = useMemo(() => {
    if (!draft?.title?.trim() || !notes) return []
    const needle = `[[${draft.title.trim().toLowerCase()}]]`
    return notes.filter((nt) => nt.id !== draft.id && nt.content.toLowerCase().includes(needle))
  }, [notes, draft?.title, draft?.id])

  const outgoing = useMemo(() => {
    if (!draft) return []
    const out: Array<{ name: string; go: () => void }> = []
    const seen = new Set<string>()
    for (const m of draft.content.matchAll(/\[\[([^\]]+)\]\]/g)) {
      const key = m[1].trim().toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      const note = (notes ?? []).find((x) => x.title.trim().toLowerCase() === key)
      if (note) {
        out.push({ name: m[1], go: () => openNote(note) })
        continue
      }
      const title = titles.find(
        (x) => x.title.trim().toLowerCase() === key || x.original_title?.trim().toLowerCase() === key
      )
      if (title) out.push({ name: m[1], go: () => navigate(`/title/${title.id}`) })
    }
    return out
  }, [draft, notes, titles, navigate, openNote])

  // resolve a [[link]] clicked in the preview to a note or title
  const openLink = (name: string) => {
    const key = name.trim().toLowerCase()
    const note = (notes ?? []).find((x) => x.title.trim().toLowerCase() === key)
    if (note) return openNote(note)
    const title = titles.find((x) => x.title.trim().toLowerCase() === key || x.original_title?.trim().toLowerCase() === key)
    if (title) navigate(`/title/${title.id}`)
  }
  // flip a checkbox in the preview by toggling its source line
  const toggleCheckbox = (idx: number) => {
    const d = draftRef.current
    if (!d) return
    const lines = d.content.split('\n')
    if (lines[idx] == null) return
    lines[idx] = lines[idx].replace(/\[([ xX])\]/, (_m, c) => (c === ' ' ? '[x]' : '[ ]'))
    patchDraft({ content: lines.join('\n') })
  }

  // ---------- list ----------
  const visible = useMemo(() => {
    if (!notes) return []
    const q = search.trim().toLowerCase()
    return notes.filter((nt) => !q || nt.title.toLowerCase().includes(q) || nt.content.toLowerCase().includes(q))
  }, [notes, search])

  if (!notes) return <Spinner />

  return (
    <div className="flex h-full">
      {/* left pane: list */}
      <div className="flex w-72 shrink-0 flex-col border-r border-edge/60 bg-surface/50">
        <div className="space-y-2 p-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-600" />
              <input
                className="input !py-1.5 !pl-7 text-xs"
                placeholder={t('notes.search')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <button className="btn-accent !px-2.5 !py-1.5" title={t('notes.new')} onClick={() => newNote()}>
              <Plus size={14} />
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
          {visible.length === 0 && (
            <div className="px-3 py-8 text-center text-xs text-zinc-600">
              {notes.length ? t('notes.emptyFiltered') : t('notes.emptyTitle')}
            </div>
          )}
          {visible.map((nt) => (
            <button
              key={nt.id}
              onClick={() => openNote(nt)}
              className={`block w-full rounded-lg px-3 py-2 text-left transition-colors ${
                draft?.id === nt.id ? 'bg-accent/15' : 'hover:bg-raised'
              }`}
            >
              <span className="flex items-center gap-1.5">
                {!!nt.pinned && <Pin size={10} className="shrink-0 fill-accent-bright text-accent-bright" />}
                <span className={`truncate text-[13px] font-medium ${draft?.id === nt.id ? 'text-accent-bright' : 'text-zinc-200'}`}>
                  {nt.title || nt.content.slice(0, 30) || '…'}
                </span>
              </span>
              <span className="mt-0.5 block truncate text-[11px] text-zinc-600">
                {formatRelative(nt.updated_at)}
                {nt.tags.length > 0 && <span> · #{nt.tags.join(' #')}</span>}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* right pane: editor */}
      {!draft ? (
        <div className="flex min-w-0 flex-1 items-center justify-center">
          <EmptyState
            icon={PenLine}
            title={t('notes.selectPrompt')}
            subtitle={t('notes.emptySubtitle')}
            action={
              <button className="btn-accent" onClick={() => newNote()}>
                <Plus size={16} /> {t('notes.new')}
              </button>
            }
          />
        </div>
      ) : (
        <div className="flex min-w-0 flex-1 flex-col">
          {/* toolbar */}
          <div className="flex items-center gap-2 border-b border-edge/60 px-5 py-2.5">
            <span className="text-[11px] text-zinc-600">
              {saveState === 'saving' ? t('notes.saving') : saveState === 'saved' ? t('notes.savedNow') : ' '}
            </span>
            <div className="ml-auto flex items-center gap-1">
              <button
                className={`rounded-lg p-2 transition-colors ${preview ? 'text-accent-bright' : 'text-zinc-500 hover:text-zinc-300'}`}
                title={preview ? t('notes.edit') : t('notes.preview')}
                onClick={() => setPreview((v) => !v)}
              >
                {preview ? <PenLine size={15} /> : <Eye size={15} />}
              </button>
              <select
                className="select !py-1 text-xs"
                value={draft.linked_title_id ?? ''}
                onChange={(e) => patchDraft({ linked_title_id: e.target.value ? Number(e.target.value) : null })}
                title={t('notes.linkedTitle')}
              >
                <option value="">{t('notes.noLink')}</option>
                {titles.map((ti) => (
                  <option key={ti.id} value={ti.id}>{ti.title}</option>
                ))}
              </select>
              <button
                className={`rounded-lg p-2 transition-colors ${draft.pinned ? 'text-accent-bright' : 'text-zinc-500 hover:text-zinc-300'}`}
                title={draft.pinned ? t('notes.unpin') : t('notes.pin')}
                onClick={() => patchDraft({ pinned: !draft.pinned })}
              >
                <Pin size={15} className={draft.pinned ? 'fill-current' : ''} />
              </button>
              {draft.id != null && (
                <button
                  className="rounded-lg p-2 text-zinc-500 transition-colors hover:text-red-400"
                  title={t('common.delete')}
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          </div>

          {/* editor body */}
          <div className="relative flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-6 py-4">
            <input
              className="w-full bg-transparent text-2xl font-semibold text-white outline-none placeholder:text-zinc-700"
              placeholder={t('notes.titlePlaceholder')}
              value={draft.title}
              onChange={(e) => patchDraft({ title: e.target.value })}
            />
            <ChipsInput value={draft.tags} onChange={(tags) => patchDraft({ tags })} placeholder={t('notes.tagsPlaceholder')} />
            {preview ? (
              <div className="min-h-[260px] flex-1">
                {draft.content.trim() ? (
                  <MarkdownView content={draft.content} onOpenLink={openLink} onToggleCheckbox={toggleCheckbox} />
                ) : (
                  <p className="text-sm text-zinc-600">{t('notes.contentPlaceholder')}</p>
                )}
              </div>
            ) : (
            <div className="relative min-h-[260px] flex-1">
              <textarea
                ref={contentRef}
                className="h-full min-h-[260px] w-full resize-none bg-transparent text-sm leading-relaxed text-zinc-300 outline-none placeholder:text-zinc-700"
                placeholder={t('notes.contentPlaceholder')}
                value={draft.content}
                onChange={(e) => {
                  patchDraft({ content: e.target.value })
                  refreshSuggest(e.target.value, e.target.selectionStart)
                  refreshSlash(e.target.value, e.target.selectionStart)
                }}
                onKeyDown={(e) => {
                  if (slash) {
                    if (e.key === 'ArrowDown') {
                      e.preventDefault()
                      setSlashIdx((i) => Math.min(i + 1, slash.items.length - 1))
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault()
                      setSlashIdx((i) => Math.max(i - 1, 0))
                    } else if (e.key === 'Enter' || e.key === 'Tab') {
                      e.preventDefault()
                      applySlash(slash.items[slashIdx])
                    } else if (e.key === 'Escape') {
                      setSlash(null)
                    }
                    return
                  }
                  if (suggest) {
                    if (e.key === 'ArrowDown') {
                      e.preventDefault()
                      setSuggestIdx((i) => Math.min(i + 1, suggest.items.length - 1))
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault()
                      setSuggestIdx((i) => Math.max(i - 1, 0))
                    } else if (e.key === 'Enter' || e.key === 'Tab') {
                      e.preventDefault()
                      applySuggestion(suggest.items[suggestIdx].name)
                    } else if (e.key === 'Escape') {
                      setSuggest(null)
                    }
                  }
                }}
                onClick={(e) => {
                  refreshSuggest(draft.content, e.currentTarget.selectionStart)
                  refreshSlash(draft.content, e.currentTarget.selectionStart)
                }}
              />
              {suggest && (
                <div className="absolute left-0 top-0 z-10 w-72 -translate-y-1 rounded-lg border border-edge bg-surface p-1 shadow-none">
                  {suggest.items.map((item, i) => (
                    <button
                      key={`${item.kind}-${item.name}`}
                      onMouseMove={() => setSuggestIdx(i)}
                      onClick={() => applySuggestion(item.name)}
                      className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs ${
                        i === suggestIdx ? 'bg-accent/15 text-accent-bright' : 'text-zinc-300'
                      }`}
                    >
                      <Link2 size={11} className="shrink-0 text-zinc-600" />
                      <span className="truncate">{item.name}</span>
                      <span className="ml-auto text-[10px] uppercase text-zinc-600">
                        {item.kind === 'title' ? t('world.kind.title') : t('world.kind.note')}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {slash && (
                <div className="absolute left-0 top-0 z-10 w-60 -translate-y-1 rounded-lg border border-edge bg-surface p-1 shadow-lg">
                  {slash.items.map((cmd, i) => {
                    const Icon = cmd.icon
                    return (
                      <button
                        key={cmd.id}
                        onMouseMove={() => setSlashIdx(i)}
                        onClick={() => applySlash(cmd)}
                        className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-xs ${
                          i === slashIdx ? 'bg-accent/15 text-accent-bright' : 'text-zinc-300'
                        }`}
                      >
                        <Icon size={14} className="shrink-0 text-zinc-500" />
                        <span>{t(`notes.slash.${cmd.id}` as 'notes.slash.h1')}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
            )}

            {/* connections: outgoing links + backlinks */}
            {(outgoing.length > 0 || backlinks.length > 0) && (
              <div className="border-t border-edge/50 pt-3">
                {outgoing.length > 0 && (
                  <div className="mb-2 flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-600">{t('notes.outgoing')}</span>
                    {outgoing.map((o) => (
                      <button
                        key={o.name}
                        onClick={o.go}
                        className="rounded-md bg-accent/10 px-2 py-0.5 text-xs text-accent-bright hover:bg-accent/20"
                      >
                        [[{o.name}]]
                      </button>
                    ))}
                  </div>
                )}
                {backlinks.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-600">{t('notes.backlinks')}</span>
                    {backlinks.map((nt) => (
                      <button
                        key={nt.id}
                        onClick={() => openNote(nt)}
                        className="rounded-md bg-raised px-2 py-0.5 text-xs text-zinc-300 hover:bg-edge"
                      >
                        {nt.title || nt.content.slice(0, 24)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {confirmDelete && (
        <ConfirmDialog
          title={t('notes.deleteConfirmTitle')}
          message={t('notes.deleteConfirmMessage')}
          confirmLabel={t('common.delete')}
          danger
          onConfirm={deleteNote}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  )
}
