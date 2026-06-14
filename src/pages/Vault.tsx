import { useCallback, useEffect, useMemo, useState } from 'react'
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
  Search,
  Trash2,
  Video,
} from 'lucide-react'
import EmptyState from '../components/ui/EmptyState'
import Spinner from '../components/ui/Spinner'
import Modal from '../components/ui/Modal'
import { toast } from '../store/toastStore'
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

const KIND_COLORS: Record<VaultKind, string> = {
  image: '#4ade80',
  video: '#a888f0',
  audio: '#fb923c',
  doc: '#60a5fa',
  archive: '#facc15',
  other: '#8b8b9e',
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

export default function Vault() {
  const { t } = useI18n()
  const [crumbs, setCrumbs] = useState<Crumb[]>([{ kind: 'vault', id: null, name: '' }])
  const [vaultItems, setVaultItems] = useState<VaultFile[] | null>(null)
  const [diskItems, setDiskItems] = useState<VaultDiskEntry[] | null>(null)
  const [search, setSearch] = useState('')
  const [dragOver, setDragOver] = useState(false)
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
    const q = search.trim().toLowerCase()
    return q ? rows.filter((r) => r.name.toLowerCase().includes(q)) : rows
  }, [rows, search])

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

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (!inVault) return // live OS folders are read-only here
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
      className="page"
      onDragOver={(e) => {
        if (!inVault) return
        e.preventDefault()
        if (!dragOver) setDragOver(true)
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragOver(false)
      }}
      onDrop={onDrop}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="page-title !mb-0">{t('nav.vault')}</h1>
        {inVault && (
          <div className="flex flex-wrap gap-2">
            <button className="btn-ghost" onClick={() => setNewFolderOpen(true)}>
              <FolderPlus size={15} /> {t('vault.newFolder')}
            </button>
            <button className="btn-ghost" onClick={() => addFiles(() => window.wist.vault.addFolder(parentId))}>
              <FolderOpen size={15} /> {t('vault.addFolder')}
            </button>
            <button className="btn-accent" onClick={() => addFiles(() => window.wist.vault.pickAndAdd(parentId))}>
              <Plus size={16} /> {t('vault.add')}
            </button>
          </div>
        )}
      </div>

      {/* breadcrumb */}
      <div className="mb-5 flex items-center gap-1 overflow-x-auto text-sm text-zinc-400">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1
          const label = i === 0 ? t('nav.vault') : c.name
          return (
            <span key={i} className="flex shrink-0 items-center gap-1">
              {i > 0 && <ChevronRight size={14} className="text-zinc-600" />}
              <button
                onClick={() => !last && goTo(i)}
                disabled={last}
                className={`max-w-[200px] truncate rounded px-1.5 py-0.5 ${
                  last ? 'font-semibold text-zinc-100' : 'hover:bg-raised hover:text-zinc-200'
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
        <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center border-4 border-dashed border-accent bg-accent/10">
          <span className="rounded-xl bg-surface px-6 py-3 text-lg font-semibold text-accent-bright">{t('vault.dropHere')}</span>
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
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {visible.map((r) => (
            <VaultCard
              key={r.key}
              row={r}
              t={t}
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
  onOpen,
  onReveal,
  onRename,
  onRemove,
}: {
  row: Row
  t: TFn
  onOpen: () => void
  onReveal: () => void
  onRename?: () => void
  onRemove?: () => void
}) {
  const isImage = !r.isFolder && r.kind === 'image' && r.path
  const Icon = r.isFolder ? (r.live ? FolderSymlink : Folder) : KIND_ICONS[r.kind]
  const color = r.isFolder ? 'var(--accent-bright, #a888f0)' : KIND_COLORS[r.kind]

  return (
    <div
      className="group relative flex flex-col overflow-hidden rounded-xl border border-edge/60 bg-surface transition-all hover:-translate-y-0.5 hover:border-edge hover:shadow-lg hover:shadow-black/20"
      draggable={!r.isFolder && !!r.path}
      onDragStart={(e) => {
        if (r.isFolder || !r.path) return
        e.preventDefault()
        window.wist.vault.startDrag(r.path)
      }}
    >
      {/* preview / icon */}
      <button onClick={onOpen} className="relative block aspect-[4/3] w-full overflow-hidden bg-raised/50" title={r.path ?? r.name}>
        {isImage ? (
          <img
            src={window.wist.media.fileUrl(r.path!)}
            alt={r.name}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.04]"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center" style={{ color }}>
            <Icon size={r.isFolder ? 40 : 30} strokeWidth={r.isFolder ? 1.5 : 1.75} />
          </span>
        )}
      </button>

      {/* label */}
      <button onClick={onOpen} className="flex min-w-0 items-center gap-2 px-3 py-2.5 text-left">
        {!isImage && !r.isFolder && (
          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium text-zinc-200 group-hover:text-white">{r.name}</span>
          <span className="block text-[11px] text-zinc-600">
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
      className={`rounded-md bg-black/55 p-1.5 text-zinc-200 backdrop-blur-sm transition-colors hover:bg-black/75 ${danger ? 'hover:text-red-400' : 'hover:text-white'}`}
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
