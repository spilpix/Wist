import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Compass,
  File as FileIcon,
  FolderKanban,
  ListChecks,
  ListTodo,
  PenLine,
  Star,
} from 'lucide-react'
import EmptyState from '../components/ui/EmptyState'
import Spinner from '../components/ui/Spinner'
import { useFavoritesStore } from '../store/favoritesStore'
import type { Favorite, FavoriteKind } from '../types/models'
import { useI18n } from '../i18n'

const KIND_ICON: Record<FavoriteKind, typeof Star> = {
  note: PenLine,
  project: FolderKanban,
  canvas: ListChecks,
  task: ListTodo,
  vault: FileIcon,
  route: Compass,
}

function PinCard({ fav, onOpen, onUnpin }: { fav: Favorite; onOpen: () => void; onUnpin: () => void }) {
  const { t } = useI18n()
  const Icon = KIND_ICON[fav.kind] ?? Star
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}
      className="group relative flex cursor-pointer items-center gap-3 rounded-xl border border-edge bg-raised/40 p-3 transition-colors hover:bg-highlight"
    >
      {fav.cover_path ? (
        <img
          src={window.wist.media.fileUrl(fav.cover_path)}
          alt=""
          loading="lazy"
          draggable={false}
          className="h-11 w-11 shrink-0 overflow-hidden rounded-lg object-cover"
        />
      ) : (
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-raised text-zinc-400">
          <Icon size={20} />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13.5px] font-medium text-zinc-200 group-hover:text-white">
          {fav.label.trim() || t('fav.untitled')}
        </div>
        <div className="mt-0.5 truncate text-[11px] text-zinc-500">
          {fav.sublabel?.trim() || t(`fav.kind.${fav.kind}` as Parameters<typeof t>[0])}
        </div>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation()
          onUnpin()
        }}
        title={t('fav.unpin')}
        className="absolute right-2 top-2 rounded-lg p-1 text-[var(--c-yellow-text)] opacity-0 transition-all hover:bg-highlight group-hover:opacity-100"
      >
        <Star size={14} className="fill-current" />
      </button>
    </div>
  )
}

export default function Favorites() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const favorites = useFavoritesStore((s) => s.favorites)
  const loadFavs = useFavoritesStore((s) => s.load)
  const removeFav = useFavoritesStore((s) => s.remove)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadFavs().finally(() => setLoading(false))
  }, [loadFavs])

  if (loading) return <Spinner />

  return (
    <div className="page">
      <h1 className="page-title">{t('nav.favorites')}</h1>
      <p className="-mt-4 mb-6 text-sm text-zinc-500">{t('fav.pinsEmpty')}</p>

      {!favorites.length ? (
        <EmptyState icon={Star} title={t('fav.emptyTitle')} subtitle={t('fav.pinsEmpty')} />
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4">
          {favorites.map((f) => (
            <PinCard
              key={f.id}
              fav={f}
              onOpen={() => f.route && navigate(f.route)}
              onUnpin={() => removeFav(f.kind, f.ref)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
