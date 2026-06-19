import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowUpDown,
  BookOpen,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  FileText,
  FilePlus2,
  Folder,
  FolderOpen,
  FolderPlus,
  GripVertical,
  ListTree,
  MoreHorizontal,
  MoreVertical,
  PenLine,
  Pin,
  Star,
  Trash2,
  X,
} from 'lucide-react'
import PlainEditor from '../components/notes/PlainEditor'
import MarkdownView from '../components/MarkdownView'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import Skeleton, { SkeletonLine } from '../components/ui/Skeleton'
import { toast } from '../store/toastStore'
import { useUiStore } from '../store/uiStore'
import { useTabStore } from '../store/tabStore'
import { useFavoritesStore } from '../store/favoritesStore'
import { physKey } from '../lib/keyboard'
import type { Note, NoteFolder } from '../types/models'
import { useI18n, t as tGlobal } from '../i18n'

// ─── Draft ──────────────────────────────────────────────────────────────────

interface Draft {
  id: number | null
  title: string
  content: string
  tags: string[]
  project_id: number | null
  pinned: boolean
  folder_id: number | null
  token: number
}

let draftToken = 0
const emptyDraft = (title = '', folderId: number | null = null, projectId: number | null = null): Draft => ({
  id: null,
  title,
  content: '',
  tags: [],
  project_id: projectId,
  pinned: false,
  folder_id: folderId,
  token: ++draftToken,
})

type SaveState = 'idle' | 'saving' | 'saved'
type SortMode = 'name' | 'modified' | 'created'

// Obsidian-style untitled numbering. `extra` carries titles handed out this session
// but not yet reflected in `notes` (the DB save + reload is async) so rapid "New note"
// clicks don't collide into duplicate "Без названия N".
function nextUntitledTitle(notes: Note[], base: string, extra?: Set<string>): string {
  const existing = new Set(notes.map((n) => n.title.trim()))
  if (extra) for (const e of extra) existing.add(e)
  if (!existing.has(base)) return base
  let i = 1
  while (existing.has(`${base} ${i}`)) i++
  return `${base} ${i}`
}

// Obsidian-style inline tags: #tag tokens in the body (no space after #), so a
// "# Heading" stays a heading while "#idea" becomes a tag.
function extractTags(md: string): string[] {
  return Array.from(new Set([...md.matchAll(/(?:^|\s)#([\p{L}\d][\p{L}\d_-]*)/gu)].map((m) => m[1])))
}

// ─── Tree ───────────────────────────────────────────────────────────────────

type TreeNode =
  | { kind: 'folder'; folder: NoteFolder; children: TreeNode[] }
  | { kind: 'note'; note: Note }

// folders are ordered by their manual `sort` (drag-to-reorder), name as the tiebreak
function sortFolders(folders: NoteFolder[]): NoteFolder[] {
  return [...folders].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))
}

function buildTree(folders: NoteFolder[], notes: Note[], sortMode: SortMode): TreeNode[] {
  const sortedFolders = sortFolders(folders)

  const sortNotes = (ns: Note[]) => {
    const arr = [...ns]
    // ALWAYS break ties by id so a burst of same-second "Без названия N" notes stays
    // in strict order instead of turning into a jumble. modified/created → newest id
    // first; name → numeric-aware ("Без названия 2" before "Без названия 10").
    if (sortMode === 'name') arr.sort((a, b) => (a.title || '').localeCompare(b.title || '', undefined, { numeric: true, sensitivity: 'base' }) || a.id - b.id)
    else if (sortMode === 'modified') arr.sort((a, b) => b.updated_at.localeCompare(a.updated_at) || b.id - a.id)
    else arr.sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id)
    return arr
  }

  function getChildren(parentId: number | null): TreeNode[] {
    const childFolders = sortedFolders.filter((f) => f.parent_id === parentId)
    const childNotes = sortNotes(notes.filter((n) => (n.folder_id ?? null) === parentId))
    return [
      ...childFolders.map((f) => ({ kind: 'folder' as const, folder: f, children: getChildren(f.id) })),
      ...childNotes.map((n) => ({ kind: 'note' as const, note: n })),
    ]
  }

  return getChildren(null)
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function Notes() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const [notes, setNotes] = useState<Note[] | null>(null)
  const [folders, setFolders] = useState<NoteFolder[]>([])
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [readingMode, setReadingMode] = useState(false)
  const [showOptions, setShowOptions] = useState(false)

  // tree UI state
  const [expandedFolders, setExpandedFolders] = useState<Set<number>>(new Set())
  const [sortMode, setSortMode] = useState<SortMode>('modified')
  const [showSortMenu, setShowSortMenu] = useState(false)
  const [showOutline, setShowOutline] = useState(false)
  // folder drag-reorder (pointer-based; siblings only — the insertion line shows the slot)
  const [dragFolderId, setDragFolderId] = useState<number | null>(null)
  const [folderDrop, setFolderDrop] = useState<{ parent: number | null; slot: number } | null>(null)

  // multi-select in the sidebar (Ctrl/Cmd+click toggle · Shift+click range · Ctrl+A all · Del/Backspace delete)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [lastClickedId, setLastClickedId] = useState<number | null>(null)
  const [bulkConfirm, setBulkConfirm] = useState(false)

  // folder ops
  const [renamingFolderId, setRenamingFolderId] = useState<number | null>(null)
  const [renamingValue, setRenamingValue] = useState('')
  // false = not creating a folder · null = creating at root · number = creating inside that folder
  const [newFolderParentId, setNewFolderParentId] = useState<number | null | false>(false)
  const [newFolderValue, setNewFolderValue] = useState('')
  // untitled titles handed out this session (see nextUntitledTitle)
  const handedOutTitles = useRef<Set<string>>(new Set())
  // note ops
  const [renamingNoteId, setRenamingNoteId] = useState<number | null>(null)
  const [renamingNoteValue, setRenamingNoteValue] = useState('')
  // shared context menu — folders and notes both use it
  const [contextMenu, setContextMenu] = useState<{ kind: 'folder' | 'note'; id: number; x: number; y: number } | null>(null)

  // universal favorites (pin a note to the sidebar Избранные)
  const loadFavs = useFavoritesStore((s) => s.load)
  const toggleFav = useFavoritesStore((s) => s.toggle)
  const isFav = useFavoritesStore((s) => s.isPinned)
  useEffect(() => {
    loadFavs()
  }, [loadFavs])
  const toggleNoteFav = useCallback(
    (n: Note) => {
      toggleFav({ kind: 'note', ref: n.id, label: n.title, route: `/notes?open=${n.id}` }).then((pinned) =>
        toast(pinned ? tGlobal('fav.added') : tGlobal('fav.removed'))
      )
    },
    [toggleFav]
  )

  // auto-collapse app sidebar (same as MemoryTree / graph)
  const setSidebarCollapsed = useUiStore((s) => s.setSidebarCollapsed)
  useEffect(() => {
    const was = useUiStore.getState().sidebarCollapsed
    setSidebarCollapsed(true, false)
    return () => setSidebarCollapsed(was, false)
  }, [setSidebarCollapsed])

  // ─── save chain ───────────────────────────────────────────────────────────

  const draftRef = useRef<Draft | null>(null)
  draftRef.current = draft
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveChain = useRef<Promise<unknown>>(Promise.resolve())
  const createdByToken = useRef<Map<number, number>>(new Map())

  const load = useCallback(async () => {
    try {
      const [ns, fs] = await Promise.all([
        window.wist.notes.list({}),
        window.wist.noteFolders.list(),
      ])
      setNotes(ns)
      setFolders(fs)
      return ns
    } catch (e) {
      console.error('notes load failed', e)
      toast(tGlobal('notes.loadError'))
      setNotes((prev) => prev ?? [])
      return []
    }
  }, [])

  // sibling folder ids under a parent, in their current displayed order
  const siblingFolderIds = useCallback(
    (parent: number | null) => sortFolders(folders.filter((f) => (f.parent_id ?? null) === parent)).map((f) => f.id),
    [folders]
  )

  const reorderFolders = useCallback(
    (ids: number[]) => {
      // optimistic: assign the moved sibling group new sort 0..n so the tree settles instantly
      setFolders((prev) => {
        const order = new Map(ids.map((id, i) => [id, i]))
        return prev.map((f) => (order.has(f.id) ? { ...f, sort: order.get(f.id)! } : f))
      })
      window.wist.noteFolders.reorder(ids).then(load).catch(() => load())
    },
    [load]
  )

  // pointer-drag a folder among its siblings (design-system ghost + insertion line)
  const startFolderDrag = useCallback(
    (e: React.MouseEvent, folder: NoteFolder) => {
      if (e.button !== 0) return
      const rowEl = (e.target as HTMLElement).closest<HTMLElement>('[data-folder-row]')
      if (!rowEl) return
      e.preventDefault()
      e.stopPropagation()
      const parent = folder.parent_id ?? null
      const rect = rowEl.getBoundingClientRect()
      const ox = e.clientX - rect.left
      const oy = e.clientY - rect.top

      const ghost = rowEl.cloneNode(true) as HTMLElement
      ghost.classList.add('drag-ghost')
      Object.assign(ghost.style, {
        position: 'fixed',
        zIndex: '210',
        pointerEvents: 'none',
        width: `${rect.width}px`,
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        margin: '0',
      })
      document.body.appendChild(ghost)
      document.body.style.userSelect = 'none'
      setDragFolderId(folder.id)

      const key = parent ?? 'root'
      const slotAt = (y: number): number => {
        const rows = Array.from(document.querySelectorAll<HTMLElement>(`[data-folder-row][data-parent="${key}"]`))
        for (let i = 0; i < rows.length; i++) {
          const r = rows[i].getBoundingClientRect()
          if (y < r.top + r.height / 2) return i
        }
        return rows.length
      }

      const onMove = (ev: MouseEvent) => {
        ghost.style.left = `${ev.clientX - ox}px`
        ghost.style.top = `${ev.clientY - oy}px`
        setFolderDrop({ parent, slot: slotAt(ev.clientY) })
      }
      const finish = (ev: MouseEvent) => {
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', finish)
        document.body.style.userSelect = ''
        ghost.remove()
        const ids = siblingFolderIds(parent)
        const from = ids.indexOf(folder.id)
        const slot = slotAt(ev.clientY)
        if (from !== -1) {
          let to = slot > from ? slot - 1 : slot
          to = Math.max(0, Math.min(ids.length - 1, to))
          if (to !== from) {
            const next = ids.slice()
            next.splice(from, 1)
            next.splice(to, 0, folder.id)
            reorderFolders(next)
          }
        }
        setDragFolderId(null)
        setFolderDrop(null)
      }
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', finish)
    },
    [siblingFolderIds, reorderFolders]
  )

  useEffect(() => {
    load()
  }, [load])

  const persist = useCallback(
    (d: Draft): Promise<number | null> => {
      const run = saveChain.current.then(async (): Promise<number | null> => {
        const existingId = d.id ?? createdByToken.current.get(d.token) ?? null
        if (existingId == null && !d.title.trim() && !d.content.trim()) return null
        setSaveState('saving')
        const payload = {
          title: d.title.trim(),
          content: d.content,
          tags: d.tags,
          project_id: d.project_id,
          pinned: (d.pinned ? 1 : 0) as 0 | 1,
          folder_id: d.folder_id,
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
      saveChain.current = run.catch((e) => { console.error('note save failed', e); toast(tGlobal('notes.saveError')); return undefined })
      return run
    },
    [load]
  )

  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      const d = draftRef.current
      if (!d) return
      const id = await persist(d)
      if (id != null && draftRef.current && draftRef.current.id == null && draftRef.current.token === d.token) {
        setDraft((cur) => (cur ? { ...cur, id } : cur))
      }
    }, 700)
  }, [persist])

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

  const openNote = useCallback(
    (nt: Note) => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      const prev = draftRef.current
      if (prev && prev.id !== nt.id && (prev.title.trim() || prev.content.trim())) persist(prev)
      setDraft({
        id: nt.id,
        title: nt.title,
        content: nt.content,
        tags: nt.tags,
        project_id: nt.project_id,
        pinned: !!nt.pinned,
        folder_id: nt.folder_id ?? null,
        token: ++draftToken,
      })
      setSaveState('saved')
    },
    [persist]
  )

  const createNote = useCallback(
    (folderId: number | null = null) => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      const prev = draftRef.current
      if (prev && (prev.title.trim() || prev.content.trim())) persist(prev)
      const base = t('notes.untitled')
      const title = nextUntitledTitle(notes ?? [], base, handedOutTitles.current)
      handedOutTitles.current.add(title)
      const d = emptyDraft(title, folderId)
      setDraft(d)
      setReadingMode(false)
      setSaveState('idle')
      // Persist immediately so the new note shows up in the sidebar tree right away —
      // it used to only appear after the first keystroke (or a re-entry) triggered a save.
      persist(d).then((id) => {
        if (id != null && draftRef.current && draftRef.current.token === d.token && draftRef.current.id == null) {
          setDraft((cur) => (cur ? { ...cur, id } : cur))
        }
      })
    },
    [persist, notes, t]
  )

  // deep links
  useEffect(() => {
    if (!notes) return
    const openId = searchParams.get('open')
    if (openId) {
      const nt = notes.find((x) => x.id === Number(openId))
      if (nt) openNote(nt)
      setSearchParams({}, { replace: true })
    } else if (searchParams.get('new') === '1') {
      const proj = searchParams.get('project')
      createNote(null)
      void proj
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

  // ─── connections (backlinks / outgoing) ─────────────────────────────────────

  const backlinks = useMemo(() => {
    if (!draft?.title?.trim() || !notes) return []
    const needle = `[[${draft.title.trim().toLowerCase()}]]`
    return notes.filter((nt) => nt.id !== draft.id && nt.content.toLowerCase().includes(needle))
  }, [notes, draft?.title, draft?.id])

  const outgoing = useMemo(() => {
    if (!draft) return []
    const out: Array<{ name: string; go: () => void }> = []
    const seen = new Set<string>()
    for (const m of draft.content.matchAll(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g)) {
      const key = m[1].trim().toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      const note = (notes ?? []).find((x) => x.title.trim().toLowerCase() === key)
      if (note) { out.push({ name: m[1], go: () => openNote(note) }); continue }
    }
    return out
  }, [draft, notes, openNote])

  const wordCount = useMemo(() => {
    if (!draft) return 0
    return draft.content.trim().match(/\S+/g)?.length ?? 0
  }, [draft])

  const charCount = draft?.content.length ?? 0

  const openLink = useCallback(
    (name: string) => {
      const key = name.trim().toLowerCase()
      const note = (notes ?? []).find((x) => x.title.trim().toLowerCase() === key)
      if (note) openNote(note)
    },
    [notes, openNote]
  )

  // reading view: flip a "- [ ]" ↔ "- [x]" checkbox on the given line
  const toggleCheckbox = (lineIndex: number) => {
    if (!draft) return
    const lines = draft.content.split('\n')
    const line = lines[lineIndex]
    if (line == null) return
    lines[lineIndex] = /\[[xX]\]/.test(line)
      ? line.replace(/\[[xX]\]/, '[ ]')
      : line.replace(/\[\s?\]/, '[x]')
    patchDraft({ content: lines.join('\n') })
  }

  // ─── outline ──────────────────────────────────────────────────────────────

  const outline = useMemo(() => {
    if (!draft?.content) return []
    return draft.content
      .split('\n')
      .flatMap((line) => {
        const m = line.match(/^(#{1,3})\s+(.+)$/)
        return m ? [{ level: m[1].length, text: m[2] }] : []
      })
  }, [draft?.content])

  // ─── folder ops ───────────────────────────────────────────────────────────

  const startNewFolder = (parentId: number | null = null) => {
    setNewFolderParentId(parentId)
    setNewFolderValue('')
  }

  const commitNewFolder = async () => {
    const name = newFolderValue.trim()
    const parentId = newFolderParentId === false ? null : newFolderParentId
    setNewFolderParentId(false)
    if (!name) return
    await window.wist.noteFolders.create(name, parentId)
    await load()
    setExpandedFolders((prev) => {
      const next = new Set(prev)
      if (typeof parentId === 'number') next.add(parentId)
      return next
    })
  }

  const startRename = (folderId: number, currentName: string) => {
    setContextMenu(null)
    setRenamingFolderId(folderId)
    setRenamingValue(currentName)
  }

  const commitRename = async () => {
    if (renamingFolderId == null) return
    const name = renamingValue.trim()
    setRenamingFolderId(null)
    if (!name) return
    await window.wist.noteFolders.rename(renamingFolderId, name)
    await load()
  }

  const deleteFolder = async (folderId: number) => {
    setContextMenu(null)
    await window.wist.noteFolders.remove(folderId)
    await load()
  }

  const toggleFolder = (folderId: number) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev)
      if (next.has(folderId)) next.delete(folderId)
      else next.add(folderId)
      return next
    })
  }

  const collapseAll = () => setExpandedFolders(new Set())

  // ─── note ops (sidebar context menu) ───────────────────────────────────────

  const startRenameNote = (noteId: number, currentTitle: string) => {
    setContextMenu(null)
    setRenamingNoteId(noteId)
    setRenamingNoteValue(currentTitle)
  }

  const commitRenameNote = async () => {
    if (renamingNoteId == null) return
    const id = renamingNoteId
    const title = renamingNoteValue.trim()
    setRenamingNoteId(null)
    if (!title) return
    await window.wist.notes.update(id, { title })
    if (draftRef.current?.id === id) setDraft((d) => (d ? { ...d, title } : d))
    await load()
  }

  const duplicateNote = async (note: Note) => {
    setContextMenu(null)
    const title = note.title ? nextUntitledTitle(notes ?? [], note.title, handedOutTitles.current) : ''
    if (title) handedOutTitles.current.add(title)
    await window.wist.notes.create({
      title,
      content: note.content,
      tags: note.tags,
      project_id: note.project_id,
      pinned: 0,
      folder_id: note.folder_id ?? null,
    })
    await load()
  }

  const deleteNoteById = async (note: Note) => {
    setContextMenu(null)
    await window.wist.notes.remove(note.id)
    if (draftRef.current?.id === note.id) setDraft(null)
    toast(tGlobal('notes.deleted'))
    await load()
  }

  // ─── close tab ────────────────────────────────────────────────────────────

  const handleClose = () => {
    const { activeId, closeTab } = useTabStore.getState()
    if (activeId) {
      const next = closeTab(activeId)
      navigate(next ?? '/')
    } else {
      navigate('/')
    }
  }

  // ─── tree ─────────────────────────────────────────────────────────────────

  const tree = useMemo(
    () => (notes ? buildTree(folders, notes, sortMode) : []),
    [folders, notes, sortMode]
  )

  // ─── multi-select ───────────────────────────────────────────────────────────

  // every note id in display order (incl. inside collapsed folders) — drives Ctrl+A and Shift-range
  const orderedNoteIds = useMemo(() => {
    const ids: number[] = []
    const walk = (nodes: TreeNode[]) =>
      nodes.forEach((n) => (n.kind === 'note' ? ids.push(n.note.id) : walk(n.children)))
    walk(tree)
    return ids
  }, [tree])

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
    setLastClickedId(id)
  }
  const selectRange = (id: number) => {
    const anchor = lastClickedId
    const i1 = anchor == null ? -1 : orderedNoteIds.indexOf(anchor)
    const i2 = orderedNoteIds.indexOf(id)
    if (i1 < 0 || i2 < 0) {
      toggleSelect(id)
      return
    }
    const [lo, hi] = i1 < i2 ? [i1, i2] : [i2, i1]
    setSelectedIds((prev) => {
      const n = new Set(prev)
      for (let i = lo; i <= hi; i++) n.add(orderedNoteIds[i])
      return n
    })
  }
  const clearSelection = () => setSelectedIds(new Set())

  const doBulkDelete = async () => {
    const ids = [...selectedIds]
    setBulkConfirm(false)
    if (!ids.length) return
    try {
      await Promise.all(ids.map((id) => window.wist.notes.remove(id)))
      if (draftRef.current?.id != null && selectedIds.has(draftRef.current.id)) setDraft(null)
      clearSelection()
      toast(tGlobal('notes.deletedN', { n: ids.length }))
      await load()
    } catch (e) {
      console.error('bulk delete failed', e)
      toast(tGlobal('notes.saveError'))
    }
  }

  // keyboard: Ctrl/Cmd+A select all · Del/Backspace delete selection · Esc clear.
  // Skipped while typing (editor / title / rename / search) so native shortcuts still work.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      const typing = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
      if (typing) return
      if ((e.ctrlKey || e.metaKey) && physKey(e) === 'a') {
        if (orderedNoteIds.length) {
          e.preventDefault()
          setSelectedIds(new Set(orderedNoteIds))
          setLastClickedId(orderedNoteIds[0])
        }
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.size > 0) {
        e.preventDefault()
        setBulkConfirm(true)
      } else if (e.key === 'Escape' && selectedIds.size > 0) {
        setSelectedIds(new Set())
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [orderedNoteIds, selectedIds]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── render helpers ───────────────────────────────────────────────────────

  const renderNewFolderInput = (parentId: number | null) => {
    if (newFolderParentId !== parentId) return null
    return (
      <div className="flex items-center gap-1 py-0.5 pl-2">
        <Folder size={13} className="shrink-0 text-zinc-500" />
        <input
          autoFocus
          className="min-w-0 flex-1 bg-transparent text-[13px] text-zinc-200 outline-none placeholder:text-zinc-600"
          placeholder={t('notes.folderNamePh')}
          value={newFolderValue}
          onChange={(e) => setNewFolderValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitNewFolder()
            if (e.key === 'Escape') setNewFolderParentId(false)
          }}
          onBlur={commitNewFolder}
        />
      </div>
    )
  }

  const renderTree = (nodes: TreeNode[], depth = 0, parentId: number | null = null): React.ReactNode => {
    const folderTotal = nodes.reduce((n, x) => n + (x.kind === 'folder' ? 1 : 0), 0)
    const showLine = (slot: number) =>
      folderDrop != null && dragFolderId != null && folderDrop.parent === parentId && folderDrop.slot === slot
    const lineEl = <div className="insert-line" style={{ marginLeft: depth * 12 + 10, marginRight: 6 }} />
    return nodes.map((node) => {
      if (node.kind === 'folder') {
        const isOpen = expandedFolders.has(node.folder.id)
        const isRenaming = renamingFolderId === node.folder.id
        const myIdx = nodes.indexOf(node)
        return (
          <Fragment key={`folder-${node.folder.id}`}>
            {showLine(myIdx) && lineEl}
            <div>
              <div
                data-folder-row
                data-parent={parentId ?? 'root'}
                style={{ paddingLeft: depth * 12 + 4 }}
                className={`group flex cursor-pointer items-center gap-1 rounded py-0.5 pr-1 text-zinc-400 transition-colors hover:bg-highlight hover:text-zinc-200 ${dragFolderId === node.folder.id ? 'drag-taken' : ''}`}
                onClick={() => toggleFolder(node.folder.id)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  setContextMenu({ kind: 'folder', id: node.folder.id, x: e.clientX, y: e.clientY })
                }}
              >
                <span
                  className="drag-handle -ml-1 shrink-0 cursor-grab opacity-0 transition-opacity group-hover:opacity-100"
                  title={t('notes.reorderFolder')}
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => startFolderDrag(e, node.folder)}
                >
                  <GripVertical size={12} />
                </span>
                <span className="shrink-0">
                  {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                </span>
              {isOpen ? (
                <FolderOpen size={13} className="shrink-0 text-zinc-400" />
              ) : (
                <Folder size={13} className="shrink-0 text-zinc-500" />
              )}
              {isRenaming ? (
                <input
                  autoFocus
                  className="min-w-0 flex-1 bg-transparent text-[13px] text-zinc-200 outline-none"
                  value={renamingValue}
                  onChange={(e) => setRenamingValue(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    e.stopPropagation()
                    if (e.key === 'Enter') commitRename()
                    if (e.key === 'Escape') setRenamingFolderId(null)
                  }}
                  onBlur={commitRename}
                />
              ) : (
                <span className="min-w-0 flex-1 truncate text-[13px]">{node.folder.name}</span>
              )}
              <button
                className="invisible ml-auto shrink-0 rounded p-0.5 text-zinc-600 hover:text-zinc-300 group-hover:visible"
                onClick={(e) => {
                  e.stopPropagation()
                  setContextMenu({ kind: 'folder', id: node.folder.id, x: e.clientX, y: e.clientY })
                }}
              >
                <MoreHorizontal size={12} />
              </button>
              </div>
              {isOpen && (
                <div>
                  {renderTree(node.children, depth + 1, node.folder.id)}
                  {renderNewFolderInput(node.folder.id)}
                </div>
              )}
            </div>
            {myIdx === folderTotal - 1 && showLine(folderTotal) && lineEl}
          </Fragment>
        )
      }

      // note row
      const nt = node.note
      const active = draft?.id === nt.id
      const selected = selectedIds.has(nt.id)
      const isRenamingNote = renamingNoteId === nt.id
      return (
        <div
          key={`note-${nt.id}`}
          style={{ paddingLeft: depth * 12 + 18 }}
          className={`group flex cursor-pointer items-center gap-1.5 rounded py-0.5 pr-1 transition-colors ${
            selected
              ? 'bg-highlight text-zinc-100'
              : active
                ? 'bg-sidebar-active text-zinc-100'
                : 'text-zinc-400 hover:bg-highlight hover:text-zinc-200'
          }`}
          onClick={(e) => {
            if (isRenamingNote) return
            if (e.metaKey || e.ctrlKey) { e.preventDefault(); toggleSelect(nt.id); return }
            if (e.shiftKey) { e.preventDefault(); selectRange(nt.id); return }
            setSelectedIds(new Set())
            setLastClickedId(nt.id)
            openNote(nt)
          }}
          onContextMenu={(e) => {
            e.preventDefault()
            setContextMenu({ kind: 'note', id: nt.id, x: e.clientX, y: e.clientY })
          }}
        >
          <FileText size={13} className="shrink-0" />
          {isRenamingNote ? (
            <input
              autoFocus
              className="min-w-0 flex-1 bg-transparent text-[13px] text-zinc-200 outline-none"
              value={renamingNoteValue}
              onChange={(e) => setRenamingNoteValue(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                e.stopPropagation()
                if (e.key === 'Enter') commitRenameNote()
                if (e.key === 'Escape') setRenamingNoteId(null)
              }}
              onBlur={commitRenameNote}
            />
          ) : (
            <span className="min-w-0 flex-1 truncate text-[13px]">
              {nt.title || nt.content.replace(/[#>*`[\]-]/g, '').slice(0, 30) || t('notes.untitled')}
            </span>
          )}
          <button
            className="invisible ml-auto shrink-0 rounded p-0.5 text-zinc-600 hover:text-zinc-300 group-hover:visible"
            onClick={(e) => {
              e.stopPropagation()
              setContextMenu({ kind: 'note', id: nt.id, x: e.clientX, y: e.clientY })
            }}
          >
            <MoreHorizontal size={12} />
          </button>
        </div>
      )
    })
  }

  // ─── render ───────────────────────────────────────────────────────────────

  if (!notes)
    return (
      <div className="flex h-full">
        <div className="flex w-60 shrink-0 flex-col gap-1.5 border-r border-edge bg-surface px-2.5 py-3">
          {['58%', '72%', '44%', '64%', '50%', '78%', '40%'].map((w, i) => (
            <div key={i} className="flex items-center gap-2 px-1 py-1.5">
              <Skeleton w={15} h={15} radius="4px" className="shrink-0" />
              <SkeletonLine w={w} />
            </div>
          ))}
        </div>
        <div className="flex flex-1 flex-col gap-3 px-10 py-10">
          <SkeletonLine w={220} className="!h-[22px]" />
          <div className="h-3" />
          <SkeletonLine w="92%" />
          <SkeletonLine w="84%" />
          <SkeletonLine w="60%" />
        </div>
      </div>
    )

  return (
    <div
      className="flex h-full"
      onClick={() => {
        setContextMenu(null)
        setShowSortMenu(false)
        setShowOptions(false)
      }}
    >
      {/* ── Internal notes sidebar ─────────────────────────────────────── */}
      <div className="flex w-60 shrink-0 flex-col border-r border-edge bg-surface">
        {/* 5-icon toolbar */}
        <div className="flex items-center gap-0.5 border-b border-edge px-1.5 py-1.5">
          <button
            className="rounded p-1.5 text-zinc-500 transition-colors hover:bg-highlight hover:text-zinc-200"
            title={t('notes.newNote')}
            onClick={() => createNote()}
          >
            <FilePlus2 size={15} />
          </button>
          <button
            className="rounded p-1.5 text-zinc-500 transition-colors hover:bg-highlight hover:text-zinc-200"
            title={t('notes.newFolder')}
            onClick={() => startNewFolder(null)}
          >
            <FolderPlus size={15} />
          </button>

          {/* sort button + dropdown */}
          <div className="relative">
            <button
              className={`rounded p-1.5 transition-colors hover:bg-highlight ${showSortMenu ? 'bg-highlight text-zinc-200' : 'text-zinc-500 hover:text-zinc-200'}`}
              title={t('notes.sortOrder')}
              onClick={(e) => {
                e.stopPropagation()
                setShowSortMenu((v) => !v)
              }}
            >
              <ArrowUpDown size={15} />
            </button>
            {showSortMenu && (
              <div
                className="absolute left-0 top-full z-50 mt-1 w-44 rounded-lg border border-edge bg-raised py-1 shadow-lg"
                onClick={(e) => e.stopPropagation()}
              >
                {(['name', 'modified', 'created'] as SortMode[]).map((mode) => (
                  <button
                    key={mode}
                    className={`block w-full px-3 py-1.5 text-left text-[13px] transition-colors hover:bg-highlight ${sortMode === mode ? 'font-medium text-zinc-100' : 'text-zinc-300'}`}
                    onClick={() => { setSortMode(mode); setShowSortMenu(false) }}
                  >
                    {t(mode === 'name' ? 'notes.sortByName' : mode === 'modified' ? 'notes.sortByModified' : 'notes.sortByCreated')}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            className={`rounded p-1.5 transition-colors hover:bg-highlight ${showOutline ? 'bg-highlight text-zinc-200' : 'text-zinc-500 hover:text-zinc-200'}`}
            title={t('notes.outline')}
            onClick={() => setShowOutline((v) => !v)}
          >
            <ListTree size={15} />
          </button>
          <button
            className="rounded p-1.5 text-zinc-500 transition-colors hover:bg-highlight hover:text-zinc-200"
            title={t('notes.collapseAll')}
            onClick={collapseAll}
          >
            <ChevronsDownUp size={15} />
          </button>
        </div>

        {/* outline panel (when active) */}
        {showOutline && outline.length > 0 && (
          <div className="border-b border-edge bg-raised px-3 py-2">
            {outline.map((h, i) => (
              <div
                key={i}
                style={{ paddingLeft: (h.level - 1) * 12 }}
                className="truncate py-0.5 text-[12px] text-zinc-400 hover:text-zinc-200"
              >
                {h.text}
              </div>
            ))}
          </div>
        )}

        {/* selection bar — appears once one or more notes are selected */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2 border-b border-edge bg-raised px-2.5 py-1.5 text-[12.5px]">
            <span className="font-medium text-zinc-200">{t('notes.selectedN', { n: selectedIds.size })}</span>
            <button
              onClick={() => setBulkConfirm(true)}
              className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-danger transition-colors hover:bg-highlight"
            >
              <Trash2 size={13} /> {t('common.delete')}
            </button>
            <button
              onClick={clearSelection}
              title={t('notes.clearSelection')}
              className="rounded p-0.5 text-zinc-500 transition-colors hover:bg-highlight hover:text-zinc-200"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* folder + note tree */}
        <div className="min-h-0 flex-1 overflow-y-auto px-1 py-1">
          {renderTree(tree)}
          {renderNewFolderInput(null)}
          {tree.length === 0 && newFolderParentId === false && (
            <div className="px-3 py-6 text-center text-[12px] text-zinc-600">{t('notes.emptyTitle')}</div>
          )}
        </div>
      </div>

      {/* ── Main area ──────────────────────────────────────────────────── */}
      {!draft ? (
        /* Obsidian-style empty state: 3 plain text links */
        <div className="flex min-w-0 flex-1 items-center justify-center">
          <div className="flex flex-col items-center gap-1.5">
            <button
              className="text-[14px] text-accent-bright transition-opacity hover:opacity-70"
              onClick={() => createNote()}
            >
              {t('notes.createFile')}
            </button>
            <button
              className="text-[14px] text-accent-bright transition-opacity hover:opacity-70"
              onClick={() => {
                const { setPalette } = useUiStore.getState()
                setPalette(true)
              }}
            >
              {t('notes.goToFile')}
            </button>
            <button
              className="text-[14px] text-accent-bright transition-opacity hover:opacity-70"
              onClick={handleClose}
            >
              {t('common.close')}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Obsidian-style top bar: centered title · reading-mode · options */}
          <div className="relative flex h-9 shrink-0 items-center border-b border-edge px-2">
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className="max-w-[55%] truncate text-[13px] text-zinc-400">{draft.title || t('notes.untitled')}</span>
            </div>
            <div className="z-10 ml-auto flex items-center gap-0.5">
              <button
                className={`rounded-lg p-1.5 transition-colors hover:bg-highlight ${readingMode ? 'bg-highlight text-zinc-100' : 'text-zinc-500 hover:text-zinc-200'}`}
                title={readingMode ? t('notes.editMode') : t('notes.readingMode')}
                onClick={() => setReadingMode((v) => !v)}
              >
                {readingMode ? <PenLine size={15} /> : <BookOpen size={15} />}
              </button>
              <div className="relative">
                <button
                  className={`rounded-lg p-1.5 transition-colors hover:bg-highlight ${showOptions ? 'bg-highlight text-zinc-200' : 'text-zinc-500 hover:text-zinc-200'}`}
                  title={t('notes.options')}
                  onClick={(e) => {
                    e.stopPropagation()
                    setShowOptions((v) => !v)
                  }}
                >
                  <MoreVertical size={15} />
                </button>
                {showOptions && (
                  <div
                    className="absolute right-0 top-full z-50 mt-1 w-56 rounded-lg border border-edge bg-raised p-1 shadow-lg"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] text-zinc-300 hover:bg-highlight"
                      onClick={() => {
                        patchDraft({ pinned: !draft.pinned })
                        setShowOptions(false)
                      }}
                    >
                      <Pin size={14} className={`shrink-0 ${draft.pinned ? 'fill-current text-zinc-200' : 'text-zinc-500'}`} />
                      {draft.pinned ? t('notes.unpin') : t('notes.pin')}
                    </button>
                    {draft.id != null && (
                      <button
                        className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] text-zinc-300 hover:bg-highlight"
                        onClick={() => {
                          setShowOptions(false)
                          toggleNoteFav({ id: draft.id, title: draft.title } as Note)
                        }}
                      >
                        <Star
                          size={14}
                          className={`shrink-0 ${isFav('note', draft.id) ? 'fill-current text-[var(--c-yellow-text)]' : 'text-zinc-500'}`}
                        />
                        {isFav('note', draft.id) ? t('fav.unpin') : t('fav.pin')}
                      </button>
                    )}
                    {draft.id != null && (
                      <>
                        <div className="my-1 h-px bg-edge" />
                        <button
                          className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] text-danger hover:bg-highlight"
                          onClick={() => {
                            setShowOptions(false)
                            setConfirmDelete(true)
                          }}
                        >
                          <Trash2 size={14} className="shrink-0" /> {t('common.delete')}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* body: editor or reading view */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto max-w-[720px] px-6 py-10">
              {readingMode ? (
                <>
                  <h1 className="mb-4 text-4xl font-bold leading-tight text-white">{draft.title || t('notes.untitled')}</h1>
                  <MarkdownView content={draft.content} onOpenLink={openLink} onToggleCheckbox={toggleCheckbox} />
                </>
              ) : (
                <>
                  <input
                    className="mb-4 block w-full bg-transparent text-4xl font-bold leading-tight text-white outline-none focus-visible:outline-none placeholder:text-zinc-700"
                    placeholder={t('notes.titlePlaceholder')}
                    value={draft.title}
                    onChange={(e) => patchDraft({ title: e.target.value })}
                  />
                  <PlainEditor
                    key={draft.token}
                    noteKey={draft.token}
                    value={draft.content}
                    onChange={(md) => patchDraft({ content: md, tags: extractTags(md) })}
                    placeholder={t('notes.bodyPlaceholder')}
                    t={t}
                  />
                </>
              )}

              {/* connections */}
              {(outgoing.length > 0 || backlinks.length > 0) && (
                <div className="mt-10 border-t border-edge pt-4">
                  {outgoing.length > 0 && (
                    <div className="mb-2 flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-600">{t('notes.outgoing')}</span>
                      {outgoing.map((o) => (
                        <button key={o.name} onClick={o.go} className="rounded-full bg-raised px-2.5 py-0.5 text-xs text-accent-bright transition-colors hover:bg-highlight">
                          {o.name}
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
                          className="flex items-center gap-1 rounded-full bg-raised px-2.5 py-0.5 text-xs text-zinc-300 transition-colors hover:bg-highlight"
                        >
                          <FileText size={11} /> {nt.title || nt.content.slice(0, 24)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

            </div>
          </div>

          {/* bottom-right status bar (Obsidian-style) */}
          <div className="flex shrink-0 items-center justify-end gap-4 border-t border-edge px-5 py-1 text-[11px] text-zinc-600">
            {saveState !== 'idle' && <span>{saveState === 'saving' ? t('notes.saving') : t('notes.savedNow')}</span>}
            <span>{t('notes.statBacklinks').replace('{n}', String(backlinks.length))}</span>
            <span>{t('notes.statWords').replace('{n}', String(wordCount))}</span>
            <span>{t('notes.statChars').replace('{n}', String(charCount))}</span>
          </div>
        </div>
      )}

      {/* context menu — folders + notes */}
      {contextMenu && (
        <div
          style={{ position: 'fixed', left: Math.min(contextMenu.x, window.innerWidth - 190), top: contextMenu.y }}
          className="z-50 w-44 rounded-lg border border-edge bg-raised py-1 shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.kind === 'folder' ? (
            <>
              <button
                className="block w-full px-3 py-1.5 text-left text-[13px] text-zinc-300 hover:bg-highlight"
                onClick={() => {
                  const id = contextMenu.id
                  setContextMenu(null)
                  createNote(id)
                }}
              >
                {t('notes.newNote')}
              </button>
              <button
                className="block w-full px-3 py-1.5 text-left text-[13px] text-zinc-300 hover:bg-highlight"
                onClick={() => {
                  const id = contextMenu.id
                  setContextMenu(null)
                  setExpandedFolders((p) => new Set(p).add(id))
                  startNewFolder(id)
                }}
              >
                {t('notes.newFolder')}
              </button>
              <div className="my-1 h-px bg-edge" />
              <button
                className="block w-full px-3 py-1.5 text-left text-[13px] text-zinc-300 hover:bg-highlight"
                onClick={() => {
                  const f = folders.find((x) => x.id === contextMenu.id)
                  if (f) startRename(f.id, f.name)
                }}
              >
                {t('notes.renameFolder')}
              </button>
              <button
                className="block w-full px-3 py-1.5 text-left text-[13px] text-danger hover:bg-highlight"
                onClick={() => deleteFolder(contextMenu.id)}
              >
                {t('notes.deleteFolder')}
              </button>
            </>
          ) : (
            <>
              <button
                className="block w-full px-3 py-1.5 text-left text-[13px] text-zinc-300 hover:bg-highlight"
                onClick={() => {
                  const n = notes.find((x) => x.id === contextMenu.id)
                  setContextMenu(null)
                  if (n) openNote(n)
                }}
              >
                {t('notes.openNote')}
              </button>
              <button
                className="block w-full px-3 py-1.5 text-left text-[13px] text-zinc-300 hover:bg-highlight"
                onClick={() => {
                  const n = notes.find((x) => x.id === contextMenu.id)
                  if (n) startRenameNote(n.id, n.title)
                }}
              >
                {t('notes.rename')}
              </button>
              <button
                className="block w-full px-3 py-1.5 text-left text-[13px] text-zinc-300 hover:bg-highlight"
                onClick={() => {
                  const n = notes.find((x) => x.id === contextMenu.id)
                  if (n) duplicateNote(n)
                }}
              >
                {t('notes.duplicate')}
              </button>
              <button
                className="block w-full px-3 py-1.5 text-left text-[13px] text-zinc-300 hover:bg-highlight"
                onClick={() => {
                  const n = notes.find((x) => x.id === contextMenu.id)
                  setContextMenu(null)
                  if (n) toggleNoteFav(n)
                }}
              >
                {isFav('note', contextMenu.id) ? t('fav.unpin') : t('fav.pin')}
              </button>
              <div className="my-1 h-px bg-edge" />
              <button
                className="block w-full px-3 py-1.5 text-left text-[13px] text-danger hover:bg-highlight"
                onClick={() => {
                  const n = notes.find((x) => x.id === contextMenu.id)
                  if (n) deleteNoteById(n)
                }}
              >
                {t('common.delete')}
              </button>
            </>
          )}
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

      {bulkConfirm && (
        <ConfirmDialog
          title={t('notes.bulkDeleteTitle')}
          message={t('notes.bulkDeleteMessage', { n: selectedIds.size })}
          confirmLabel={t('common.delete')}
          danger
          onConfirm={doBulkDelete}
          onCancel={() => setBulkConfirm(false)}
        />
      )}
    </div>
  )
}
