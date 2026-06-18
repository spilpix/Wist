import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Archive,
  ChevronRight,
  Eye,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  FolderSymlink,
  Image as ImageIcon,
  Music2,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Video,
} from 'lucide-react'
import EmptyState from '../components/ui/EmptyState'
import Spinner from '../components/ui/Spinner'
import Modal from '../components/ui/Modal'
import { toast } from '../store/toastStore'
import { isExternalFileDrag, setMediaDrag } from '../lib/mediaDrag'
import type { VaultDiskEntry, VaultFile, VaultKind } from '../types/models'
import { useI18n, tn as tnGlobal } from '../i18n'

const KIND_ICONS: Record<VaultKind, typeof FileText> = {
  image: ImageIcon,
  video: Video,
  audio: Music2,
  doc: FileText,
  archive: Package,
  other: Archive,
}

function formatSize(bytes: number): string {
  if (bytes >= 1 << 30) return `${(bytes / (1 << 30)).toFixed(1)} GB`
  if (bytes >= 1 << 20) return `${(bytes / (1 << 20)).toFixed(1)} MB`
  if (bytes >= 1 << 10) return `${Math.round(bytes / (1 << 10))} KB`
  return `${bytes} B`
}

// a uniform row the grid renders, mapped from either a vault row or a live disk entry
interface Row {
  key: string
  name: string
  isFolder: boolean
  live: boolean // a real OS folder (diskfolder link or a disk subdirectory)
  kind: VaultKind
  path: string | null
  size: number
  vaultId?: number // present only for editable vault rows (remove / rename)
}

type Crumb = { kind: 'vault'; id: number | null; name: string } | { kind: 'disk'; path: string; name: string }

interface VaultProps {
  embedded?: boolean // rendered inside the Library hub (no page chrome / title)
  kindFilter?: 'image' | 'file' | 'doc' // Library categories: Images → images only, Documents → docs only, Files → the rest
}

export default function Vault({ embedded = false, kindFilter }: VaultProps = {}) {
  const { t } = useI18n()
  const rootLabel =
    kindFilter === 'image'
      ? t('lib.cat.images')
      : kindFilter === 'doc'
        ? t('lib.cat.documents')
        : kindFilter === 'file'
          ? t('lib.cat.files')
          : t('nav.vault')
  const [crumbs, setCrumbs] = useState<Crumb[]>([{ kind: 'vault', id: null, name: '' }])
  const [vaultItems, setVaultItems] = useState<VaultFile[] | null>(null)
  const [diskItems, setDiskItems] = useState<VaultDiskEntry[] | null>(null)
  const [search, setSearch] = useState('')
  const [dragOver, setDragOver] = useState(false)
  // dragenter/leave fire for every child too; count depth so the overlay doesn't flicker
  const dragDepth = useRef(0)
  const [newFolderOpen, setNewFolderOpen] = useState(false)
  const [renaming, setRenaming] = useState<{ id: number; name: string } | null>(null)

  const current = crumbs[crumbs.length - 1]
  const inVault = current.kind === 'vault'
  const parentId = current.kind === 'vault' ? current.id : null

  const load = useCallback(() => {
    // null the active list too so the spinner shows on same-mode navigation (no stale flash)
    if (current.kind === 'vault') {
      setDiskItems(null)
      setVaultItems(null)
      window.wist.vault.list(current.id).then(setVaultItems)
    } else {
      setVaultItems(null)
      setDiskItems(null)
      window.wist.vault.browse(current.path).then(setDiskItems)
    }
  }, [current])

  useEffect(() => {
    setSearch('')
    load()
  }, [load])

  // unify whichever source is active into Row[]
  const rows = useMemo<Row[]>(() => {
    if (inVault) {
      return (vaultItems ?? []).map((f) => {
        const folder = f.kind === 'folder' || f.kind === 'diskfolder'
        return {
          key: `v${f.id}`,
          name: f.name,
          isFolder: folder,
          live: f.kind === 'diskfolder',
          kind: folder ? 'other' : (f.kind as VaultKind),
          path: f.path || null,
          size: f.size,
          vaultId: f.id,
        }
      })
    }
    return (diskItems ?? []).map((e) => ({
      key: `d${e.path}`,
      name: e.name,
      isFolder: e.isDir,
      live: e.isDir,
      kind: e.kind,
      path: e.path,
      size: e.size,
    }))
  }, [inVault, vaultItems, diskItems])

  const loading = inVault ? vaultItems === null : diskItems === null

  const visible = useMemo(() => {
    let out = rows
    // Library categories: Images → folders + image files; Documents → folders + docs; Files → folders + everything non-image
    if (kindFilter)
      out = out.filter(
        (r) => r.isFolder || (kindFilter === 'image' ? r.kind === 'image' : kindFilter === 'doc' ? r.kind === 'doc' : r.kind !== 'image')
      )
    const q = search.trim().toLowerCase()
    return q ? out.filter((r) => r.name.toLowerCase().includes(q)) : out
  }, [rows, search, kindFilter])

  const open = (r: Row) => {
    if (r.isFolder) {
      if (r.live && r.path) setCrumbs((c) => [...c, { kind: 'disk', path: r.path!, name: r.name }])
      else if (r.vaultId != null) setCrumbs((c) => [...c, { kind: 'vault', id: r.vaultId!, name: r.name }])
    } else if (r.path) {
      window.wist.vault.open(r.path)
    }
  }

  const goTo = (i: number) => setCrumbs((c) => c.slice(0, i + 1))

  const addFiles = async (fn: () => Promise<number>) => {
    const n = await fn()
    if (n > 0) {
      toast(tnGlobal('count.files', n) + ' ✓', 'success')
      load()
    } else {
      toast(t('vault.noNew'))
    }
  }

  // adding a folder ALSO syncs the music/video inside it into their sections
  const mediaParts = (r: { tracks?: number; titles?: number; episodes?: number }): string[] => {
    const parts: string[] = []
    if (r.tracks) parts.push(t('vault.syncedTracks', { n: r.tracks }))
    if (r.episodes || r.titles) parts.push(t('vault.syncedVideos', { n: r.episodes || r.titles || 0 }))
    return parts
  }

  const addFolder = async () => {
    const r = await window.wist.vault.addFolder(parentId)
    if (!r.folders) {
      toast(t('vault.noNew'))
      return
    }
    load()
    const parts = mediaParts(r)
    toast(parts.length ? `${t('vault.folderAdded')} · ${parts.join(' · ')}` : t('vault.folderAdded'), 'success')
  }

  const syncAll = async () => {
    toast(t('vault.syncing'))
    const r = await window.wist.vault.syncAll()
    load()
    const parts = mediaParts(r)
    toast(parts.length ? parts.join(' · ') : t('vault.syncNone'), 'success')
  }

  // ── drop rules ────────────────────────────────────────────────────────────
  // This zone accepts ONE thing: files dragged in from the OS, and only when the
  // current folder is an editable vault (live OS folders are read-only). Internal
  // drags (a row dragged out, a media payload) are ignored entirely — so the import
  // overlay never appears for them and the cursor shows "no-drop".
  const acceptsDrop = (e: React.DragEvent) => inVault && isExternalFileDrag(e)

  const onDragEnter = (e: React.DragEvent) => {
    if (!acceptsDrop(e)) return
    e.preventDefault()
    dragDepth.current++
    if (!dragOver) setDragOver(true)
  }
  const onDragOver = (e: React.DragEvent) => {
    if (!acceptsDrop(e)) return
    e.preventDefault() // required to allow the drop
    e.dataTransfer.dropEffect = 'copy'
  }
  const onDragLeave = () => {
    if (!dragOver) return
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) setDragOver(false)
  }
  const onDrop = async (e: React.DragEvent) => {
    dragDepth.current = 0
    setDragOver(false)
    if (!acceptsDrop(e)) return
    e.preventDefault()
    const paths = Array.from(e.dataTransfer.files)
      .map((f) => window.wist.util.pathForFile(f))
      .filter(Boolean)
    if (paths.length) addFiles(() => window.wist.vault.addPaths(paths, parentId))
  }

  const createFolder = async (name: string) => {
    if (!inVault) return
    await window.wist.vault.createFolder(name, parentId)
    setNewFolderOpen(false)
    load()
  }

  const remove = async (id: number) => {
    await window.wist.vault.remove(id)
    load()
  }

  return (
    <div
      className={embedded ? 'relative' : 'page relative'}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        {!embedded && <h1 className="page-title !mb-0">{rootLabel}</h1>}
        {inVault && (
          <div className="ml-auto flex flex-wrap gap-2">
            <button className="btn-ghost" onClick={() => setNewFolderOpen(true)}>
              <FolderPlus size={15} /> {t('vault.newFolder')}
            </button>
            <button className="btn-ghost" onClick={addFolder}>
              <FolderOpen size={15} /> {t('vault.addFolder')}
            </button>
            <button className="btn-ghost" onClick={syncAll} title={t('vault.syncHint')}>
              <RefreshCw size={15} /> {t('vault.sync')}
            </button>
            <button className="btn-accent" onClick={() => addFiles(() => window.wist.vault.pickAndAdd(parentId))}>
              <Plus size={16} /> {t('vault.add')}
            </button>
          </div>
        )}
      </div>

      {/* breadcrumb */}
      <div className="mb-5 flex items-center gap-0.5 overflow-x-auto text-[13.5px]">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1
          const label = i === 0 ? rootLabel : c.name
          return (
            <span key={i} className="flex shrink-0 items-center gap-0.5">
              {i > 0 && <ChevronRight size={14} className="text-zinc-700" />}
              <button
                onClick={() => !last && goTo(i)}
                disabled={last}
                className={`max-w-[200px] truncate rounded px-2 py-0.5 transition-colors ${
                  last ? 'font-medium text-white' : 'text-zinc-400 hover:bg-highlight hover:text-zinc-100'
                }`}
              >
                {label}
              </button>
            </span>
          )
        })}
        {!inVault && (
          <span className="ml-2 flex shrink-0 items-center gap-1 rounded-full bg-raised px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
            <FolderSymlink size={11} /> {t('vault.live')}
          </span>
        )}
      </div>

      {rows.length > 8 && (
        <div className="relative mb-5 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
          <input className="input !pl-8" placeholder={t('vault.search')} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      )}

      {dragOver && inVault && (
        <div className="pointer-events-none absolute inset-2 z-30 flex items-center justify-center rounded-2xl border-2 border-dashed border-accent bg-accent/[0.06] backdrop-blur-[1px] animate-scale-in">
          <span className="rounded-xl border border-edge bg-surface px-6 py-3 text-base font-semibold text-accent-bright shadow-[var(--float-shadow)]">
            {t('vault.dropHere')}
          </span>
        </div>
      )}

      {loading ? (
        <Spinner />
      ) : !visible.length ? (
        <EmptyState
          icon={search ? Search : Archive}
          title={search ? t('notes.emptyFiltered') : crumbs.length > 1 ? t('vault.folderEmpty') : t('vault.emptyTitle')}
          subtitle={search || crumbs.length > 1 ? undefined : t('vault.emptySubtitle')}
          action={
            inVault && !search ? (
              <button className="btn-accent" onClick={() => addFiles(() => window.wist.vault.pickAndAdd(parentId))}>
                <Plus size={16} /> {t('vault.add')}
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-2 items-start gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {visible.map((r) => (
            <VaultCard
              key={r.key}
              row={r}
              t={t}
              embedded={embedded}
              onOpen={() => open(r)}
              onReveal={() => r.path && window.wist.shell.showItemInFolder(r.path)}
              onRename={r.vaultId != null ? () => setRenaming({ id: r.vaultId!, name: r.name }) : undefined}
              onRemove={r.vaultId != null ? () => remove(r.vaultId!) : undefined}
            />
          ))}
        </div>
      )}

      {newFolderOpen && <NameModal title={t('vault.newFolder')} onClose={() => setNewFolderOpen(false)} onSubmit={createFolder} />}
      {renaming && (
        <NameModal
          title={t('vault.rename')}
          initial={renaming.name}
          onClose={() => setRenaming(null)}
          onSubmit={async (name) => {
            await window.wist.vault.rename(renaming.id, name)
            setRenaming(null)
            load()
          }}
        />
      )}
    </div>
  )
}

type TFn = ReturnType<typeof useI18n>['t']

function VaultCard({
  row: r,
  t,
  embedded,
  onOpen,
  onReveal,
  onRename,
  onRemove,
}: {
  row: Row
  t: TFn
  embedded?: boolean
  onOpen: () => void
  onReveal: () => void
  onRename?: () => void
  onRemove?: () => void
}) {
  const isImage = !r.isFolder && r.kind === 'image' && r.path
  const Icon = r.isFolder ? (r.live ? FolderSymlink : Folder) : KIND_ICONS[r.kind]

  return (
    <div
      className={
        r.isFolder
          ? 'group relative flex flex-col rounded-2xl p-1.5 transition-colors hover:bg-highlight'
          : 'tile group relative flex flex-col overflow-hidden'
      }
      draggable={!r.isFolder && !!r.path}
      onDragStart={(e) => {
        if (r.isFolder || !r.path) return
        // embedded in the Library hub → drag INTO the app (Canvas / a Hub) via the shared
        // media payload; standalone Vault → native OS drag-out to other apps
        if (embedded) {
          setMediaDrag(
            e,
            {
              source: 'vault',
              kind: r.kind === 'image' ? 'image' : 'file',
              title: r.name,
              path: r.path,
              cover: r.kind === 'image' ? r.path : null,
            },
            e.currentTarget
          )
          return
        }
        e.preventDefault()
        window.wist.vault.startDrag(r.path)
      }}
    >
      {/* preview / icon — folders take the square «app-folder» tile (matches «Мои файлы») */}
      {r.isFolder ? (
        <button
          onClick={onOpen}
          title={r.path ?? r.name}
          className="flex aspect-square w-full items-center justify-center rounded-xl border border-edge bg-raised text-zinc-400 transition-colors group-hover:border-zinc-700 group-hover:text-zinc-300"
        >
          <Icon size={38} strokeWidth={1.5} />
        </button>
      ) : (
        <button onClick={onOpen} className="relative block aspect-[4/3] w-full overflow-hidden bg-raised" title={r.path ?? r.name}>
          {isImage ? (
            <img
              src={window.wist.media.fileUrl(r.path!)}
              alt={r.name}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.04]"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-zinc-500">
              <Icon size={30} strokeWidth={1.75} />
            </span>
          )}
        </button>
      )}

      {/* label */}
      <button onClick={onOpen} className={`flex min-w-0 items-center gap-2 text-left ${r.isFolder ? 'px-2 pb-1 pt-2' : 'px-3 py-2.5'}`}>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium text-zinc-200 group-hover:text-white">{r.name}</span>
          <span className="block text-[11px] text-zinc-500">
            {r.isFolder ? (r.live ? t('vault.live') : t('vault.folder')) : formatSize(r.size)}
          </span>
        </span>
      </button>

      {/* hover actions */}
      <div className="absolute right-1.5 top-1.5 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        {r.path && (
          <ActionDot title={t('detail.showInFolder')} onClick={onReveal}>
            <Eye size={13} />
          </ActionDot>
        )}
        {onRename && (
          <ActionDot title={t('vault.rename')} onClick={onRename}>
            <Pencil size={13} />
          </ActionDot>
        )}
        {onRemove && (
          <ActionDot title={t('common.delete')} danger onClick={onRemove}>
            <Trash2 size={13} />
          </ActionDot>
        )}
      </div>
    </div>
  )
}

function ActionDot({ children, title, danger, onClick }: { children: React.ReactNode; title: string; danger?: boolean; onClick: () => void }) {
  return (
    <button
      title={title}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className={`rounded-lg bg-black/55 p-1.5 text-[#fff] backdrop-blur-sm transition-colors hover:bg-black/75 ${danger ? 'hover:text-danger' : ''}`}
    >
      {children}
    </button>
  )
}

function NameModal({ title, initial = '', onClose, onSubmit }: { title: string; initial?: string; onClose: () => void; onSubmit: (name: string) => void }) {
  const { t } = useI18n()
  const [name, setName] = useState(initial)
  const [submitting, setSubmitting] = useState(false)
  const submit = () => {
    if (!name.trim() || submitting) return
    setSubmitting(true)
    onSubmit(name.trim())
  }
  return (
    <Modal title={title} onClose={onClose} width="max-w-sm">
      <input
        autoFocus
        className="input mb-4"
        placeholder={t('vault.folderNamePh')}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
      />
      <div className="flex justify-end gap-2">
        <button className="btn-ghost" onClick={onClose}>
          {t('common.cancel')}
        </button>
        <button className="btn-accent" disabled={!name.trim() || submitting} onClick={submit}>
          {t('common.save')}
        </button>
      </div>
    </Modal>
  )
}
