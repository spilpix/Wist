import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Frame, LayoutGrid, List as ListIcon, Pencil, Plus, Star, Trash2 } from 'lucide-react'
import PageHeader from '../components/ui/PageHeader'
import Button from '../components/ui/Button'
import EmptyState from '../components/ui/EmptyState'
import Spinner from '../components/ui/Spinner'
import Modal from '../components/ui/Modal'
import Select from '../components/ui/Select'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import BoardThumb from '../components/BoardThumb'
import { toast } from '../store/toastStore'
import { listCanvases, createCanvas, removeCanvas, updateCanvas } from '../data/canvas'
import { useFavoritesStore } from '../store/favoritesStore'
import type { Canvas as CanvasT } from '../types/models'
import { formatRelative } from '../utils/formatters'
import { useI18n } from '../i18n'

type SortKey = 'recent' | 'name'
type ViewKey = 'grid' | 'list'

export default function Canvas() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [list, setList] = useState<CanvasT[] | null>(null)
  const [renaming, setRenaming] = useState<CanvasT | null>(null)
  const [confirm, setConfirm] = useState<CanvasT | null>(null)
  const [sort, setSort] = useState<SortKey>(() => (localStorage.getItem('wist.canvasSort') as SortKey) || 'recent')
  const [view, setView] = useState<ViewKey>(() => (localStorage.getItem('wist.canvasView') as ViewKey) || 'grid')
  const loadFavs = useFavoritesStore((s) => s.load)
  const toggleFav = useFavoritesStore((s) => s.toggle)
  const isFav = useFavoritesStore((s) => s.isPinned)

  const load = () => listCanvases().then(setList)
  useEffect(() => {
    load()
    loadFavs()
  }, [loadFavs])

  const changeSort = (s: SortKey) => {
    setSort(s)
    localStorage.setItem('wist.canvasSort', s)
  }
  const changeView = (v: ViewKey) => {
    setView(v)
    localStorage.setItem('wist.canvasView', v)
  }

  const create = async () => {
    const c = await createCanvas(t('canvas.untitled'))
    navigate(`/canvas/${c.id}`)
  }
  const remove = async () => {
    if (!confirm) return
    await removeCanvas(confirm.id)
    setConfirm(null)
    load()
    toast(t('canvas.deleted'), 'success')
  }

  const sorted = useMemo(() => {
    const arr = [...(list ?? [])]
    if (sort === 'name') arr.sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }))
    else arr.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''))
    return arr
  }, [list, sort])

  if (!list) return <Spinner />

  return (
    <div className="page">
      <PageHeader
        icon={Frame}
        title={t('nav.canvas')}
        subtitle={list.length ? t('canvas.count', { n: list.length }) : undefined}
      >
        {!!list.length && (
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-[rgb(var(--ink-400))]">{t('canvas.sortBy')}</span>
              <Select
                value={sort}
                onChange={(v) => changeSort(v as SortKey)}
                size="sm"
                ariaLabel={t('canvas.sortBy')}
                options={[
                  { value: 'recent', label: t('canvas.sortRecent') },
                  { value: 'name', label: t('canvas.sortName') },
                ]}
              />
            </div>
            <div className="flex items-center gap-0.5 rounded-lg border border-edge bg-card p-0.5">
              <button onClick={() => changeView('grid')} className={segCls(view === 'grid')} title={t('canvas.viewGrid')}>
                <LayoutGrid size={16} />
              </button>
              <button onClick={() => changeView('list')} className={segCls(view === 'list')} title={t('canvas.viewList')}>
                <ListIcon size={16} />
              </button>
            </div>
          </div>
        )}
      </PageHeader>

      {!list.length ? (
        <EmptyState
          icon={Frame}
          title={t('canvas.emptyTitle')}
          subtitle={t('canvas.emptySubtitle')}
          action={
            <Button variant="accent" onClick={create}>
              <Plus size={16} /> {t('canvas.new')}
            </Button>
          }
        />
      ) : view === 'grid' ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {/* new-board card */}
          <button
            onClick={create}
            className="group flex min-h-[210px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-edge text-[rgb(var(--ink-400))] transition-colors hover:border-accent hover:bg-accent-subtle/40 hover:text-accent-bright"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-raised transition-colors group-hover:bg-accent-subtle">
              <Plus size={22} />
            </span>
            <span className="text-xs font-semibold">{t('canvas.new')}</span>
          </button>

          {sorted.map((c) => (
            <button
              key={c.id}
              onClick={() => navigate(`/canvas/${c.id}`)}
              className="group relative flex flex-col overflow-hidden rounded-2xl border border-edge bg-card text-left transition-all hover:-translate-y-0.5 hover:border-[color-mix(in_srgb,var(--accent)_40%,rgb(var(--edge)))] hover:shadow-[var(--card-shadow-hover)]"
            >
              <div className="relative aspect-[4/3] w-full overflow-hidden border-b border-edge bg-bg p-3">
                <BoardThumb data={c.data} />
                <span className="absolute bottom-2 left-2 flex h-6 w-6 items-center justify-center rounded-md bg-accent-subtle text-accent-bright ring-1 ring-black/5">
                  <Frame size={13} />
                </span>
              </div>
              <div className="px-3.5 py-2.5">
                <div className="truncate text-sm font-semibold text-[rgb(var(--ink-0))]">{c.name || t('canvas.untitled')}</div>
                <div className="mt-0.5 text-[11px] text-[rgb(var(--ink-400))]">
                  {t('canvas.nodes', { n: c.data.nodes.length })} · {formatRelative(c.updated_at)}
                </div>
              </div>
              <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <span
                  role="button"
                  tabIndex={-1}
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleFav({ kind: 'canvas', ref: c.id, label: c.name, route: `/canvas/${c.id}` })
                  }}
                  className={`rounded-lg bg-black/55 p-1.5 backdrop-blur-sm transition-colors hover:bg-black/75 ${
                    isFav('canvas', c.id) ? 'text-[var(--c-yellow-text)]' : 'text-[#fff]'
                  }`}
                  title={isFav('canvas', c.id) ? t('fav.unpin') : t('fav.pin')}
                >
                  <Star size={13} className={isFav('canvas', c.id) ? 'fill-current' : ''} />
                </span>
                <span
                  role="button"
                  tabIndex={-1}
                  onClick={(e) => {
                    e.stopPropagation()
                    setRenaming(c)
                  }}
                  className="rounded-lg bg-black/55 p-1.5 text-[#fff] backdrop-blur-sm transition-colors hover:bg-black/75"
                  title={t('canvas.rename')}
                >
                  <Pencil size={13} />
                </span>
                <span
                  role="button"
                  tabIndex={-1}
                  onClick={(e) => {
                    e.stopPropagation()
                    setConfirm(c)
                  }}
                  className="rounded-lg bg-black/55 p-1.5 text-[#fff] backdrop-blur-sm transition-colors hover:text-danger"
                  title={t('common.delete')}
                >
                  <Trash2 size={13} />
                </span>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-edge bg-card">
          {/* new-board row */}
          <button
            onClick={create}
            className="flex w-full items-center gap-3 border-b border-edge px-4 py-3 text-left text-[rgb(var(--ink-400))] transition-colors hover:bg-highlight hover:text-accent-bright"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-dashed border-edge">
              <Plus size={16} />
            </span>
            <span className="text-sm font-semibold">{t('canvas.new')}</span>
          </button>

          {sorted.map((c) => (
            <div
              key={c.id}
              onClick={() => navigate(`/canvas/${c.id}`)}
              className="group flex cursor-pointer items-center gap-3 border-b border-edge px-4 py-2.5 transition-colors last:border-0 hover:bg-highlight"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-subtle text-accent-bright">
                <Frame size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-[rgb(var(--ink-0))]">{c.name || t('canvas.untitled')}</div>
                <div className="truncate text-[11px] text-[rgb(var(--ink-400))]">
                  {t('canvas.nodes', { n: c.data.nodes.length })} · {formatRelative(c.updated_at)}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1 text-[rgb(var(--ink-400))]">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleFav({ kind: 'canvas', ref: c.id, label: c.name, route: `/canvas/${c.id}` })
                  }}
                  className={`rounded-lg p-1.5 transition-colors hover:bg-raised hover:text-[rgb(var(--ink-0))] ${
                    isFav('canvas', c.id) ? 'text-[var(--c-yellow-text)]' : ''
                  }`}
                  title={isFav('canvas', c.id) ? t('fav.unpin') : t('fav.pin')}
                >
                  <Star size={15} className={isFav('canvas', c.id) ? 'fill-current' : ''} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setRenaming(c)
                  }}
                  className="rounded-lg p-1.5 opacity-0 transition-all hover:bg-raised hover:text-[rgb(var(--ink-0))] group-hover:opacity-100"
                  title={t('canvas.rename')}
                >
                  <Pencil size={15} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setConfirm(c)
                  }}
                  className="rounded-lg p-1.5 opacity-0 transition-all hover:bg-raised hover:text-danger group-hover:opacity-100"
                  title={t('common.delete')}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {renaming && (
        <RenameModal
          initial={renaming.name}
          onClose={() => setRenaming(null)}
          onSave={async (name) => {
            await updateCanvas(renaming.id, { name })
            setRenaming(null)
            load()
          }}
        />
      )}
      {confirm && (
        <ConfirmDialog
          title={t('canvas.deleteTitle')}
          message={t('canvas.deleteConfirm')}
          confirmLabel={t('common.delete')}
          danger
          onConfirm={remove}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  )
}

// segmented grid/list toggle — same calm active treatment as the canvas chrome
const segCls = (active: boolean) =>
  `flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
    active ? 'bg-accent-subtle text-accent-bright' : 'text-[rgb(var(--ink-300))] hover:bg-highlight hover:text-[rgb(var(--ink-0))]'
  }`

function RenameModal({ initial, onClose, onSave }: { initial: string; onClose: () => void; onSave: (name: string) => void }) {
  const { t } = useI18n()
  const [name, setName] = useState(initial)
  return (
    <Modal title={t('canvas.rename')} onClose={onClose} width="max-w-sm">
      <input
        autoFocus
        className="input mb-4"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && name.trim() && onSave(name.trim())}
      />
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>{t('common.cancel')}</Button>
        <Button variant="accent" disabled={!name.trim()} onClick={() => onSave(name.trim())}>
          {t('common.save')}
        </Button>
      </div>
    </Modal>
  )
}
