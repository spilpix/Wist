import { Fragment, useEffect, useRef, useState } from 'react'
import { ChevronRight, FilePlus2, FolderOpen, FolderPlus, GripVertical, ImagePlus, Link2, Pencil, Plus, Trash2 } from 'lucide-react'
import { AssetTile, AssetRow } from './AssetItems'
import { useSortable } from '../../lib/useSortable'
import type { ProjectAsset, ProjectSection } from '../../types/models'
import { useI18n } from '../../i18n'

type TFn = ReturnType<typeof useI18n>['t']

// Hub "files workspace" — extracted from ProjectDetail.tsx (was a ~1900-line god-file).
// FilesWorkspace → SectionBlock → AssetTile/AssetRow (./AssetItems). Prop-driven; every
// data op (add/remove/move/reorder) is delegated to the parent page.

export function FilesWorkspace({
  assets,
  ungrouped,
  sections,
  t,
  onOpen,
  onRemove,
  onMoveAsset,
  onDropPaths,
  onAddFiles,
  onAddFolder,
  onAddImages,
  onAddLink,
  onAddSection,
  onRenameSection,
  onRemoveSection,
  onReorderSections,
}: {
  assets: ProjectAsset[]
  ungrouped: ProjectAsset[]
  sections: ProjectSection[]
  t: TFn
  onOpen: (a: ProjectAsset) => void
  onRemove: (id: number) => void
  onMoveAsset: (assetId: number, sectionId: number | null) => void
  onDropPaths: (sectionId: number | null, e: React.DragEvent) => void
  onAddFiles: (sectionId: number | null) => void
  onAddFolder: (sectionId: number | null) => void
  onAddImages: (sectionId: number | null) => void
  onAddLink: (sectionId: number | null) => void
  onAddSection: () => void
  onRenameSection: (sid: number, name: string) => void
  onRemoveSection: (sid: number) => void
  onReorderSections: (ids: number[]) => void
}) {
  // pointer-drag reorder of the section blocks (the ungrouped block stays pinned on top)
  const { onHandleDown, draggingId, overIndex } = useSortable(
    sections.map((s) => s.id),
    onReorderSections
  )
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">{t('project.references')}</h2>
        <div className="flex flex-wrap items-center gap-1.5">
          <AddMenu t={t} onFiles={() => onAddFiles(null)} onFolder={() => onAddFolder(null)} onImages={() => onAddImages(null)} onLink={() => onAddLink(null)} />
          <button className="btn-ghost !py-1.5 text-xs" onClick={onAddSection}>
            <FolderPlus size={14} /> {t('hub.addSection')}
          </button>
        </div>
      </div>

      {!assets.length && !sections.length ? (
        <div className="rounded-xl border-2 border-dashed border-edge px-6 py-14 text-center">
          <FolderOpen size={32} className="mx-auto mb-3 text-zinc-600" />
          <div className="text-sm font-medium text-zinc-300">{t('project.noAssets')}</div>
          <div className="mt-1 text-xs text-zinc-500">{t('hub.workspaceHint')}</div>
        </div>
      ) : (
        <div className="space-y-4">
          <SectionBlock
            key="ungrouped"
            section={null}
            assets={ungrouped}
            t={t}
            onOpen={onOpen}
            onRemove={onRemove}
            onMoveAsset={onMoveAsset}
            onDropPaths={(e) => onDropPaths(null, e)}
            onAddFiles={() => onAddFiles(null)}
            onAddFolder={() => onAddFolder(null)}
            onAddImages={() => onAddImages(null)}
            onAddLink={() => onAddLink(null)}
            hasSections={sections.length > 0}
          />
          <div data-sortable-container className="space-y-4">
            {sections.map((s, i) => (
              <Fragment key={s.id}>
                {overIndex === i && <div className="insert-line" />}
                <div data-sortable-item className={draggingId === s.id ? 'drag-taken' : ''}>
                  <SectionBlock
                    section={s}
                    assets={assets.filter((a) => a.section_id === s.id)}
                    t={t}
                    onOpen={onOpen}
                    onRemove={onRemove}
                    onMoveAsset={onMoveAsset}
                    onDropPaths={(e) => onDropPaths(s.id, e)}
                    onAddFiles={() => onAddFiles(s.id)}
                    onAddFolder={() => onAddFolder(s.id)}
                    onAddImages={() => onAddImages(s.id)}
                    onAddLink={() => onAddLink(s.id)}
                    onRename={(name) => onRenameSection(s.id, name)}
                    onDelete={() => onRemoveSection(s.id)}
                    onHandleDown={(e) => onHandleDown(e, s.id)}
                    hasSections
                  />
                </div>
              </Fragment>
            ))}
            {overIndex === sections.length && <div className="insert-line" />}
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------- section block ----------------

function SectionBlock({
  section,
  assets,
  t,
  onOpen,
  onRemove,
  onMoveAsset,
  onDropPaths,
  onAddFiles,
  onAddFolder,
  onAddImages,
  onAddLink,
  onRename,
  onDelete,
  onHandleDown,
  hasSections,
}: {
  section: ProjectSection | null
  assets: ProjectAsset[]
  t: TFn
  onOpen: (a: ProjectAsset) => void
  onRemove: (id: number) => void
  onMoveAsset: (assetId: number, sectionId: number | null) => void
  onDropPaths: (e: React.DragEvent) => void
  onAddFiles: () => void
  onAddFolder: () => void
  onAddImages: () => void
  onAddLink: () => void
  onRename?: (name: string) => void
  onDelete?: () => void
  onHandleDown?: (e: React.MouseEvent) => void
  hasSections: boolean
}) {
  const [over, setOver] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const sid = section?.id ?? null

  // an ungrouped block with no assets and no sections at all renders nothing here
  if (!section && !assets.length && !hasSections) return null

  const images = assets.filter((a) => a.kind === 'image')
  const links = assets.filter((a) => a.kind === 'url')
  const files = assets.filter((a) => a.kind === 'file' || a.kind === 'folder')

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setOver(false)
    const assetId = e.dataTransfer.getData('text/asset')
    if (assetId) onMoveAsset(Number(assetId), sid)
    else onDropPaths(e)
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        if (!over) setOver(true)
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setOver(false)
      }}
      onDrop={handleDrop}
      className={`rounded-xl border p-3 transition-colors ${over ? 'border-accent bg-accent/5' : section ? 'border-edge bg-raised' : 'border-transparent'}`}
    >
      {section ? (
        <div className="group/sec mb-2.5 flex items-center gap-2 px-1">
          {onHandleDown && (
            <span
              className="drag-handle -ml-0.5 h-5 w-4 shrink-0 opacity-0 transition-opacity group-hover/sec:opacity-100"
              onMouseDown={(e) => {
                e.stopPropagation()
                onHandleDown(e)
              }}
              title={t('hub.reorderSection')}
            >
              <GripVertical size={14} />
            </span>
          )}
          <button onClick={() => setCollapsed((c) => !c)} className="text-zinc-500 hover:text-zinc-300">
            <ChevronRight size={15} className={`transition-transform ${collapsed ? '' : 'rotate-90'}`} />
          </button>
          {renaming ? (
            <input
              autoFocus
              defaultValue={section.name}
              onBlur={(e) => {
                onRename?.(e.target.value)
                setRenaming(false)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                if (e.key === 'Escape') setRenaming(false)
              }}
              className="input !w-48 !py-1 text-sm"
            />
          ) : (
            <h3 className="cursor-text text-sm font-semibold text-zinc-200" onDoubleClick={() => setRenaming(true)}>
              {section.name}
            </h3>
          )}
          <span className="text-xs text-zinc-600">{assets.length}</span>
          <div className="ml-auto flex items-center gap-0.5 opacity-0 transition-opacity group-hover/sec:opacity-100">
            <AddMenu t={t} onFiles={onAddFiles} onFolder={onAddFolder} onImages={onAddImages} onLink={onAddLink} compact />
            <button onClick={() => setRenaming(true)} className="rounded-lg p-1.5 text-zinc-500 hover:bg-highlight hover:text-white" title={t('common.edit')}>
              <Pencil size={13} />
            </button>
            <button onClick={onDelete} className="rounded-lg p-1.5 text-zinc-500 hover:bg-highlight hover:text-danger" title={t('hub.deleteSection')}>
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      ) : (
        hasSections && assets.length > 0 && (
          <div className="mb-2.5 px-1 text-xs font-semibold uppercase tracking-wide text-zinc-600">{t('hub.ungrouped')}</div>
        )
      )}

      {!collapsed && (
        <>
          {!assets.length ? (
            <div className={`rounded-xl border border-dashed border-edge text-center text-xs text-zinc-600 ${section ? 'px-4 py-6' : 'px-4 py-2.5'}`}>
              {section ? t('hub.sectionEmpty') : t('hub.ungrouped')}
            </div>
          ) : (
            <div className="space-y-3">
              {images.length > 0 && (
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
                  {images.map((a) => (
                    <AssetTile key={a.id} asset={a} t={t} onOpen={() => onOpen(a)} onRemove={() => onRemove(a.id)} />
                  ))}
                </div>
              )}
              {(files.length > 0 || links.length > 0) && (
                <div className="card divide-y divide-edge">
                  {files.map((a) => (
                    <AssetRow key={a.id} asset={a} t={t} onOpen={() => onOpen(a)} onRemove={() => onRemove(a.id)} />
                  ))}
                  {links.map((a) => (
                    <AssetRow key={a.id} asset={a} t={t} onOpen={() => onOpen(a)} onRemove={() => onRemove(a.id)} />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ---------------- add menu (files workspace) ----------------

function AddMenu({
  t,
  onFiles,
  onFolder,
  onImages,
  onLink,
  compact,
}: {
  t: TFn
  onFiles: () => void
  onFolder: () => void
  onImages: () => void
  onLink: () => void
  compact?: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const items: Array<[typeof FilePlus2, string, () => void]> = [
    [FilePlus2, t('project.addFiles'), onFiles],
    [FolderPlus, t('project.addFolder'), onFolder],
    [ImagePlus, t('project.addImages'), onImages],
    [Link2, t('project.addLink'), onLink],
  ]

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={compact ? 'rounded-lg p-1.5 text-zinc-500 hover:bg-highlight hover:text-white' : 'btn-ghost !py-1.5 text-xs'}
        title={t('hub.addRef')}
      >
        <Plus size={compact ? 13 : 14} /> {!compact && t('hub.addRef')}
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-44 overflow-hidden rounded-2xl border border-edge bg-card py-1 shadow-[var(--float-shadow)]">
          {items.map(([Icon, label, fn]) => (
            <button
              key={label}
              onClick={() => {
                setOpen(false)
                fn()
              }}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-zinc-300 hover:bg-raised hover:text-white"
            >
              <Icon size={15} className="text-zinc-500" /> {label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
