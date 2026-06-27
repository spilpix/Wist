import { type DragEvent } from 'react'
import { ExternalLink, Eye, FileText, FolderOpen, GripVertical, Link2, Trash2 } from 'lucide-react'
import { useI18n } from '../../i18n'
import type { ProjectAsset } from '../../types/models'

type TFn = ReturnType<typeof useI18n>['t']

// Hub asset presentational leaves — extracted from ProjectDetail.tsx (was a 1900-line
// god-file). Pure, prop-driven; the only IPC they touch is low-level OS drag / media URL
// / reveal-in-folder, which stay direct (not data-layer concerns).

// drag a hub file/image OUT to the OS / other apps (native drag)
export function startOsDrag(asset: ProjectAsset, e: DragEvent) {
  if (asset.kind === 'url' || !asset.path) return
  e.preventDefault()
  window.wist.projects.dragOut([asset.path])
}

// the small grip starts an internal (between-sections) move via HTML5 dnd
export function GripHandle({ assetId }: { assetId: number }) {
  return (
    <span
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/asset', String(assetId))
        e.dataTransfer.effectAllowed = 'move'
      }}
      onClick={(e) => e.stopPropagation()}
      className="cursor-grab text-zinc-600 opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing"
      title="Переместить"
    >
      <GripVertical size={14} />
    </span>
  )
}

export function AssetTile({ asset: a, t, onOpen, onRemove }: { asset: ProjectAsset; t: TFn; onOpen: () => void; onRemove: () => void }) {
  return (
    <div
      className="group relative aspect-square overflow-hidden rounded-xl border border-edge bg-raised"
      draggable
      onDragStart={(e) => startOsDrag(a, e)}
      title={t('hub.dragOutHint')}
    >
      {a.path && (
        <img
          src={window.wist.media.fileUrl(a.path)}
          alt={a.label ?? ''}
          loading="lazy"
          onClick={onOpen}
          draggable={false}
          className="h-full w-full cursor-pointer object-cover transition-transform duration-200 group-hover:scale-[1.03]"
        />
      )}
      <div className="absolute left-1.5 top-1.5 rounded bg-black/55 p-0.5 backdrop-blur-sm">
        <GripHandle assetId={a.id} />
      </div>
      <button
        onClick={onRemove}
        className="absolute right-1.5 top-1.5 rounded-lg bg-black/60 p-1 text-zinc-200 opacity-0 transition-all hover:text-danger group-hover:opacity-100"
        title={t('project.removeAsset')}
      >
        <Trash2 size={13} />
      </button>
      {a.label && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/80 to-transparent px-2 pb-1.5 pt-4 text-[10px] text-zinc-200">
          {a.label}
        </div>
      )}
    </div>
  )
}

export function AssetRow({ asset: a, t, onOpen, onRemove }: { asset: ProjectAsset; t: TFn; onOpen: () => void; onRemove: () => void }) {
  const Icon = a.kind === 'folder' ? FolderOpen : a.kind === 'url' ? Link2 : FileText
  const sub = a.kind === 'url' ? a.url : a.path
  const canDragOut = a.kind !== 'url' && !!a.path
  return (
    <div
      className="group flex items-center gap-2 px-3 py-2.5"
      draggable={canDragOut}
      onDragStart={(e) => startOsDrag(a, e)}
      title={canDragOut ? t('hub.dragOutHint') : undefined}
    >
      <GripHandle assetId={a.id} />
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-raised text-zinc-400">
        <Icon size={17} />
      </span>
      <button onClick={onOpen} className="min-w-0 flex-1 text-left">
        <div className="truncate text-sm font-medium text-zinc-200 group-hover:text-white">{a.label || sub}</div>
        {sub && <div className="truncate text-xs text-zinc-600">{sub}</div>}
      </button>
      <button
        onClick={onOpen}
        className="shrink-0 rounded-lg p-1.5 text-zinc-500 opacity-0 transition-all hover:text-zinc-200 group-hover:opacity-100"
        title={t('project.open')}
      >
        {a.kind === 'url' ? <ExternalLink size={15} /> : <FolderOpen size={15} />}
      </button>
      {a.kind !== 'url' && a.path && (
        <button
          onClick={() => window.wist.shell.showItemInFolder(a.path!)}
          className="shrink-0 rounded-lg p-1.5 text-zinc-500 opacity-0 transition-all hover:text-zinc-200 group-hover:opacity-100"
          title={t('project.reveal')}
        >
          <Eye size={15} />
        </button>
      )}
      <button
        onClick={onRemove}
        className="shrink-0 rounded-lg p-1.5 text-zinc-600 opacity-0 transition-all hover:text-danger group-hover:opacity-100"
        title={t('project.removeAsset')}
      >
        <Trash2 size={14} />
      </button>
    </div>
  )
}
