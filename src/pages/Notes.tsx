import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Bot, Check, Pin, PenLine, Plus, Search, Trash2, X } from 'lucide-react'
import ChipsInput from '../components/ui/ChipsInput'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import EmptyState from '../components/ui/EmptyState'
import Spinner from '../components/ui/Spinner'
import { toast } from '../store/toastStore'
import type { Note, Title } from '../types/models'
import { formatRelative } from '../utils/formatters'
import { useI18n, t as tGlobal } from '../i18n'

/** Renders text with [[wiki links]] highlighted; clicking a link resolves to a title or note. */
function WikiText({ text, onLink }: { text: string; onLink: (name: string) => void }) {
  const parts = text.split(/(\[\[[^\]]+\]\])/g)
  return (
    <>
      {parts.map((part, i) => {
        const m = /^\[\[([^\]]+)\]\]$/.exec(part)
        if (!m) return <span key={i}>{part}</span>
        return (
          <button
            key={i}
            className="font-medium text-accent-bright hover:underline"
            onClick={(e) => {
              e.stopPropagation()
              onLink(m[1])
            }}
          >
            {m[1]}
          </button>
        )
      })}
    </>
  )
}

interface Draft {
  id: number | null
  title: string
  content: string
  tags: string[]
  linked_title_id: number | null
  pinned: boolean
}

const EMPTY_DRAFT: Draft = { id: null, title: '', content: '', tags: [], linked_title_id: null, pinned: false }

export default function Notes() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [notes, setNotes] = useState<Note[]>([])
  const [titles, setTitles] = useState<Title[]>([])
  const [allTags, setAllTags] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const load = useCallback(async () => {
    const [ns, ts, tags] = await Promise.all([
      window.wist.notes.list({}),
      window.wist.titles.list({}),
      window.wist.notes.tags(),
    ])
    setNotes(ns)
    setTitles(ts)
    setAllTags(tags)
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    // live refresh when an AI agent posts a note through the local API
    return window.wist.events.onDataChanged((kind) => {
      if (kind === 'notes') load()
    })
  }, [load])

  // deep links: /notes?open=<id> (memory tree) and /notes?new=1 (command palette)
  useEffect(() => {
    if (loading) return
    const openId = searchParams.get('open')
    const isNew = searchParams.get('new') === '1'
    if (openId) {
      const note = notes.find((n) => n.id === Number(openId))
      if (note) openNote(note)
      setSearchParams({}, { replace: true })
    } else if (isNew) {
      setDraft({ ...EMPTY_DRAFT })
      setSearchParams({}, { replace: true })
    }
  }, [loading, searchParams]) // eslint-disable-line react-hooks/exhaustive-deps

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return notes.filter(
      (n) =>
        (!q || n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q)) &&
        (!tagFilter || n.tags.includes(tagFilter))
    )
  }, [notes, search, tagFilter])

  const pinned = visible.filter((n) => n.pinned)
  const rest = visible.filter((n) => !n.pinned)

  const openNote = (n: Note) =>
    setDraft({
      id: n.id,
      title: n.title,
      content: n.content,
      tags: n.tags,
      linked_title_id: n.linked_title_id,
      pinned: !!n.pinned,
    })

  // --- reliable saving: debounce-autosave while typing, create on first input ---
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const draftRef = useRef<Draft | null>(null)
  draftRef.current = draft
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const creating = useRef(false)

  const persistDraft = useCallback(async () => {
    const d = draftRef.current
    if (!d || (!d.title.trim() && !d.content.trim())) return
    setSaveState('saving')
    const payload = {
      title: d.title.trim(),
      content: d.content,
      tags: d.tags,
      linked_title_id: d.linked_title_id,
      pinned: (d.pinned ? 1 : 0) as 0 | 1,
    }
    if (d.id != null) {
      await window.wist.notes.update(d.id, payload)
    } else {
      if (creating.current) return
      creating.current = true
      try {
        const created = await window.wist.notes.create(payload)
        setDraft((prev) => (prev && prev.id == null ? { ...prev, id: created.id } : prev))
      } finally {
        creating.current = false
      }
    }
    setSaveState('saved')
    load()
  }, [load])

  const updateDraft = (patch: Partial<Draft>) => {
    setDraft((d) => (d ? { ...d, ...patch } : d))
    setSaveState('saving')
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(persistDraft, 800)
  }

  const closeEditor = async () => {
    if (!draft) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    await persistDraft()
    setDraft(null)
    setSaveState('idle')
  }

  const deleteNote = async () => {
    if (draft?.id == null) return
    await window.wist.notes.remove(draft.id)
    setConfirmDelete(false)
    setDraft(null)
    toast(tGlobal('notes.deleted'))
    load()
  }

  /** [[Name]] → open matching note, otherwise navigate to matching title. */
  const resolveLink = (name: string) => {
    const q = name.trim().toLowerCase()
    const note = notes.find((n) => n.title.trim().toLowerCase() === q)
    if (note) {
      openNote(note)
      return
    }
    const title = titles.find(
      (ti) => ti.title.trim().toLowerCase() === q || ti.original_title?.trim().toLowerCase() === q
    )
    if (title) navigate(`/title/${title.id}`)
  }

  const NoteCard = ({ note }: { note: Note }) => (
    <button
      onClick={() => openNote(note)}
      className={`mb-4 block w-full break-inside-avoid rounded-xl bg-surface p-4 text-left transition-all duration-150 hover:-translate-y-0.5 hover:bg-raised ${
        note.pinned ? 'ring-1 ring-accent/40' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        {note.title && <div className="text-sm font-semibold text-zinc-100">{note.title}</div>}
        {!!note.pinned && <Pin size={12} className="mt-0.5 shrink-0 fill-accent-bright text-accent-bright" />}
      </div>
      {note.content && (
        <p className="mt-1.5 line-clamp-6 whitespace-pre-wrap text-[13px] leading-relaxed text-zinc-400">
          <WikiText text={note.content} onLink={resolveLink} />
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {note.source !== 'user' && (
          <span className="flex items-center gap-1 rounded-md bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold text-accent-bright">
            <Bot size={10} /> {note.source}
          </span>
        )}
        {note.linked_title_name && (
          <span className="rounded-md bg-accent/15 px-1.5 py-0.5 text-[11px] text-accent-bright">
            {note.linked_title_name}
          </span>
        )}
        {note.tags.map((tag) => (
          <span key={tag} className="rounded-md bg-raised px-1.5 py-0.5 text-[11px] text-zinc-500">#{tag}</span>
        ))}
        <span className="ml-auto text-[11px] text-zinc-600">{formatRelative(note.updated_at)}</span>
      </div>
    </button>
  )

  if (loading) return <Spinner />

  return (
    <div className="page">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="page-title !mb-0">{t('nav.notes')}</h1>
        <button className="btn-accent" onClick={() => setDraft({ ...EMPTY_DRAFT })}>
          <Plus size={16} /> {t('notes.new')}
        </button>
      </div>

      {notes.length > 0 && (
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
            <input
              className="input !w-64 !pl-8"
              placeholder={t('notes.search')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {allTags.map((tag) => (
            <button
              key={tag}
              onClick={() => setTagFilter(tagFilter === tag ? null : tag)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                tagFilter === tag ? 'bg-accent text-[#fff]' : 'bg-raised text-zinc-400 hover:text-zinc-200'
              }`}
            >
              #{tag}
            </button>
          ))}
        </div>
      )}

      {!visible.length ? (
        <EmptyState
          icon={PenLine}
          title={notes.length ? t('notes.emptyFiltered') : t('notes.emptyTitle')}
          subtitle={notes.length ? t('notes.emptyFilteredSubtitle') : t('notes.emptySubtitle')}
          action={
            !notes.length ? (
              <button className="btn-accent" onClick={() => setDraft({ ...EMPTY_DRAFT })}>
                <Plus size={16} /> {t('notes.new')}
              </button>
            ) : undefined
          }
        />
      ) : (
        <>
          {pinned.length > 0 && (
            <>
              <h2 className="section-title">{t('notes.pinned')}</h2>
              <div className="mb-6 columns-2 gap-4 lg:columns-3 xl:columns-4">
                {pinned.map((n) => (
                  <NoteCard key={n.id} note={n} />
                ))}
              </div>
            </>
          )}
          <div className="columns-2 gap-4 lg:columns-3 xl:columns-4">
            {rest.map((n) => (
              <NoteCard key={n.id} note={n} />
            ))}
          </div>
        </>
      )}

      {/* slide-over editor */}
      {draft && (
        <>
          <div className="fixed inset-0 z-30 bg-black/50 animate-fade-in" onClick={() => closeEditor()} />
          <div className="fixed bottom-0 right-0 top-9 z-40 flex w-[540px] max-w-full flex-col border-l border-edge bg-surface animate-slide-up">
            <div className="flex items-center gap-2 border-b border-edge/60 px-5 py-3">
              <PenLine size={15} className="text-accent-bright" />
              <span className="text-xs text-zinc-500">
                {saveState === 'saving'
                  ? t('notes.saving')
                  : saveState === 'saved'
                    ? t('notes.savedNow')
                    : draft.id != null
                      ? t('notes.editedRel', { rel: formatRelative(notes.find((n) => n.id === draft.id)?.updated_at) })
                      : t('notes.new')}
              </span>
              <div className="ml-auto flex items-center gap-1">
                <button
                  className={`rounded-lg p-2 transition-colors ${
                    draft.pinned ? 'text-accent-bright' : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                  title={draft.pinned ? t('notes.unpin') : t('notes.pin')}
                  onClick={() => updateDraft({ pinned: !draft.pinned })}
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
                <button
                  className="rounded-lg p-2 text-zinc-500 transition-colors hover:text-white"
                  onClick={() => closeEditor()}
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-5">
              <input
                autoFocus
                className="w-full bg-transparent text-xl font-semibold text-white outline-none placeholder:text-zinc-700"
                placeholder={t('notes.titlePlaceholder')}
                value={draft.title}
                onChange={(e) => updateDraft({ title: e.target.value })}
              />
              <textarea
                className="min-h-[260px] flex-1 resize-none bg-transparent text-sm leading-relaxed text-zinc-300 outline-none placeholder:text-zinc-700"
                placeholder={t('notes.contentPlaceholder')}
                value={draft.content}
                onChange={(e) => updateDraft({ content: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) closeEditor()
                  if (e.key === 'Escape') closeEditor()
                }}
              />
              <div className="space-y-3 border-t border-edge/50 pt-4">
                <ChipsInput value={draft.tags} onChange={(tags) => updateDraft({ tags })} placeholder={t('notes.tagsPlaceholder')} />
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-500">{t('notes.linkedTitle')}</label>
                  <select
                    className="select w-full"
                    value={draft.linked_title_id ?? ''}
                    onChange={(e) =>
                      updateDraft({ linked_title_id: e.target.value ? Number(e.target.value) : null })
                    }
                  >
                    <option value="">{t('notes.noLink')}</option>
                    {titles.map((ti) => (
                      <option key={ti.id} value={ti.id}>{ti.title}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-edge/60 px-5 py-3">
              <button className="btn-accent" onClick={() => closeEditor()}>
                <Check size={15} /> {t('notes.saveClose')}
              </button>
            </div>
          </div>
        </>
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
