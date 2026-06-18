import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Frame, Pencil, Plus, Star, Trash2 } from 'lucide-react'
import PageHeader from '../components/ui/PageHeader'
import Button from '../components/ui/Button'
import EmptyState from '../components/ui/EmptyState'
import Spinner from '../components/ui/Spinner'
import Modal from '../components/ui/Modal'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import BoardThumb from '../components/BoardThumb'
import { toast } from '../store/toastStore'
import { useFavoritesStore } from '../store/favoritesStore'
import type { Canvas as CanvasT } from '../types/models'
import { formatRelative } from '../utils/formatters'
import { useI18n } from '../i18n'

export default function Canvas() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [list, setList] = useState<CanvasT[] | null>(null)
  const [renaming, setRenaming] = useState<CanvasT | null>(null)
  const [confirm, setConfirm] = useState<CanvasT | null>(null)
  const loadFavs = useFavoritesStore((s) => s.load)
  const toggleFav = useFavoritesStore((s) => s.toggle)
  const isFav = useFavoritesStore((s) => s.isPinned)

  const load = () => window.wist.canvas.list().then(setList)
  useEffect(() => {
    load()
    loadFavs()
  }, [loadFavs])

  const create = async () => {
    const c = await window.wist.canvas.create(t('canvas.untitled'))
    navigate(`/canvas/${c.id}`)
  }
  const remove = async () => {
    if (!confirm) return
    await window.wist.canvas.remove(confirm.id)
    setConfirm(null)
    load()
    toast(t('canvas.deleted'), 'success')
  }

  if (!list) return <Spinner />

  return (
    <div className="page">
      <PageHeader
        icon={Frame}
        title={t('nav.canvas')}
        actions={
          <Button variant="accent" onClick={create}>
            <Plus size={16} /> {t('canvas.new')}
          </Button>
        }
      />

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
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {/* new-board card (Figma-style) */}
          <button
            onClick={create}
            className="group flex aspect-[4/3] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-edge text-zinc-500 transition-colors hover:border-accent hover:text-accent-bright"
          >
            <Plus size={22} />
            <span className="text-xs font-semibold">{t('canvas.new')}</span>
          </button>

          {list.map((c) => (
            <button
              key={c.id}
              onClick={() => navigate(`/canvas/${c.id}`)}
              className="group relative flex flex-col overflow-hidden rounded-xl border border-edge bg-card text-left transition-all hover:-translate-y-0.5 hover:shadow-[var(--card-shadow-hover)]"
            >
              <div className="aspect-[4/3] overflow-hidden border-b border-edge bg-bg p-2">
                <BoardThumb data={c.data} />
              </div>
              <div className="px-3 py-2.5">
                <div className="truncate text-sm font-semibold text-zinc-100">{c.name || t('canvas.untitled')}</div>
                <div className="mt-0.5 text-[11px] text-zinc-500">
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
      )}

      {renaming && (
        <RenameModal
          initial={renaming.name}
          onClose={() => setRenaming(null)}
          onSave={async (name) => {
            await window.wist.canvas.update(renaming.id, { name })
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
