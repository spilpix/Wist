import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Archive,
  ChevronDown,
  FileText,
  Folder,
  FolderOpen,
  Image as ImageIcon,
  Music2,
  Package,
  Plus,
  Search,
  Trash2,
  Video,
} from 'lucide-react'
import EmptyState from '../components/ui/EmptyState'
import Spinner from '../components/ui/Spinner'
import { toast } from '../store/toastStore'
import type { VaultFile, VaultKind } from '../types/models'
import { formatDate } from '../utils/formatters'
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

const splitPath = (p: string): string[] => p.split(/[\\/]/).filter(Boolean)
function dirOf(p: string): string {
  const i = Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/'))
  return i > 0 ? p.slice(0, i) : p
}
function baseName(p: string): string {
  const parts = splitPath(p)
  return parts[parts.length - 1] || p
}

export default function Vault() {
  const { t } = useI18n()
  const [files, setFiles] = useState<VaultFile[] | null>(null)
  const [search, setSearch] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const load = useCallback(() => window.wist.vault.list().then(setFiles), [])

  useEffect(() => {
    load()
  }, [load])

  const addFiles = async (fn: () => Promise<number>) => {
    const added = await fn()
    if (added > 0) {
      toast(tnGlobal('count.files', added) + ' ✓', 'success')
      load()
    } else {
      toast(t('vault.noNew'))
    }
  }

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const paths = Array.from(e.dataTransfer.files)
      .map((f) => (f as File & { path?: string }).path)
      .filter((p): p is string => !!p)
    if (!paths.length) return
    addFiles(() => window.wist.vault.addPaths(paths))
  }

  // group by containing folder — added folders show as collapsible folders
  const groups = useMemo(() => {
    const q = search.trim().toLowerCase()
    const visible = (files ?? []).filter((f) => !q || f.name.toLowerCase().includes(q) || f.path.toLowerCase().includes(q))
    const byDir = new Map<string, VaultFile[]>()
    for (const f of visible) {
      const dir = dirOf(f.path)
      if (!byDir.has(dir)) byDir.set(dir, [])
      byDir.get(dir)!.push(f)
    }
    return [...byDir.entries()]
      .map(([dir, items]) => ({ dir, name: baseName(dir), items: items.sort((a, b) => a.name.localeCompare(b.name)) }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [files, search])

  const toggle = (dir: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(dir)) next.delete(dir)
      else next.add(dir)
      return next
    })

  if (!files) return <Spinner />

  return (
    <div
      className="page"
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragOver(false)
      }}
      onDrop={onDrop}
    >
      <div className="mb-6 flex items-center justify-between">
        <h1 className="page-title !mb-0">{t('nav.vault')}</h1>
        <div className="flex gap-2">
          <button className="btn-accent" onClick={() => addFiles(() => window.wist.vault.pickAndAdd())}>
            <Plus size={16} /> {t('vault.add')}
          </button>
          <button className="btn-ghost" onClick={() => addFiles(() => window.wist.vault.addFolder())}>
            <FolderOpen size={15} /> {t('vault.addFolder')}
          </button>
        </div>
      </div>
      <p className="-mt-3 mb-6 max-w-2xl text-sm text-zinc-500">{t('vault.intro')}</p>

      {files.length > 0 && (
        <div className="relative mb-5 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
          <input
            className="input !pl-8"
            placeholder={t('vault.search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      )}

      {dragOver && (
        <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center border-4 border-dashed border-accent bg-accent/10">
          <span className="rounded-xl bg-surface px-6 py-3 text-lg font-semibold text-accent-bright">{t('vault.dropHere')}</span>
        </div>
      )}

      {!groups.length ? (
        <EmptyState
          icon={Archive}
          title={files.length ? t('notes.emptyFiltered') : t('vault.emptyTitle')}
          subtitle={files.length ? undefined : t('vault.emptySubtitle')}
        />
      ) : (
        <div className="space-y-3">
          {groups.map((group) => {
            const isCollapsed = collapsed.has(group.dir)
            return (
              <div key={group.dir} className="card overflow-hidden">
                <div className="flex items-center gap-2 border-b border-edge/40 bg-raised/40 px-3 py-2">
                  <button onClick={() => toggle(group.dir)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                    <ChevronDown size={14} className={`shrink-0 text-zinc-500 transition-transform ${isCollapsed ? '-rotate-90' : ''}`} />
                    <Folder size={15} className="shrink-0 text-accent-bright" />
                    <span className="truncate text-sm font-medium text-zinc-200" title={group.dir}>{group.name}</span>
                    <span className="shrink-0 text-xs text-zinc-600">{group.items.length}</span>
                  </button>
                  <button
                    className="rounded-lg p-1.5 text-zinc-500 hover:bg-raised hover:text-white"
                    title={t('detail.showInFolder')}
                    onClick={() => window.wist.vault.open(group.dir)}
                  >
                    <FolderOpen size={14} />
                  </button>
                </div>

                {!isCollapsed && (
                  <div className="divide-y divide-edge/30">
                    {group.items.map((f) => {
                      const Icon = KIND_ICONS[f.kind]
                      return (
                        <div
                          key={f.id}
                          className="group flex cursor-grab items-center gap-3 px-4 py-2.5 active:cursor-grabbing"
                          draggable
                          onDragStart={(e) => {
                            // hand the OS the real file so it can land on the desktop / in chat
                            e.preventDefault()
                            window.wist.vault.startDrag(f.path)
                          }}
                        >
                          <span
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                            style={{ backgroundColor: `${KIND_COLORS[f.kind]}1f`, color: KIND_COLORS[f.kind] }}
                          >
                            <Icon size={16} />
                          </span>
                          <button
                            className="min-w-0 flex-1 truncate text-left text-sm text-zinc-200 hover:text-white"
                            title={f.path}
                            onClick={() => window.wist.vault.open(f.path)}
                          >
                            {f.name}
                          </button>
                          <span className="w-20 shrink-0 text-right text-xs tabular-nums text-zinc-500">{formatSize(f.size)}</span>
                          <span className="w-24 shrink-0 text-right text-xs text-zinc-600">{formatDate(f.created_at)}</span>
                          <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                            <button
                              className="rounded-lg p-1.5 text-zinc-500 hover:bg-raised hover:text-white"
                              title={t('detail.showInFolder')}
                              onClick={() => window.wist.shell.showItemInFolder(f.path)}
                            >
                              <FolderOpen size={14} />
                            </button>
                            <button
                              className="rounded-lg p-1.5 text-zinc-500 hover:bg-raised hover:text-red-400"
                              onClick={async () => {
                                await window.wist.vault.remove(f.id)
                                load()
                              }}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
