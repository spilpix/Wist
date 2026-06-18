import { useEffect } from 'react'
import { Star } from 'lucide-react'
import { useFavoritesStore } from '../../store/favoritesStore'
import { useI18n } from '../../i18n'
import type { FavoriteInput } from '../../types/models'

interface Props extends FavoriteInput {
  size?: number
  className?: string
  /** stop the click from bubbling (e.g. inside a clickable card/row) */
  stop?: boolean
}

/**
 * Universal "pin to Favorites" star — drop it on any entity (note, hub, title,
 * track, canvas, task, file). Reads/writes the shared favoritesStore, so every
 * star for the same entity stays in sync and the sidebar Избранные updates live.
 */
export default function PinButton({ size = 15, className = '', stop = true, ...input }: Props) {
  const { t } = useI18n()
  const loaded = useFavoritesStore((s) => s.loaded)
  const load = useFavoritesStore((s) => s.load)
  const pinned = useFavoritesStore((s) => s.isPinned(input.kind, input.ref))
  const toggle = useFavoritesStore((s) => s.toggle)

  useEffect(() => {
    if (!loaded) load()
  }, [loaded, load])

  return (
    <button
      type="button"
      title={pinned ? t('fav.unpin') : t('fav.pin')}
      aria-pressed={pinned}
      onClick={(e) => {
        if (stop) {
          e.preventDefault()
          e.stopPropagation()
        }
        toggle(input)
      }}
      className={`flex items-center justify-center rounded-lg p-1.5 transition-colors duration-150 ${
        pinned
          ? 'text-[var(--c-yellow-text)] hover:bg-highlight'
          : 'text-zinc-500 hover:bg-highlight hover:text-zinc-200'
      } ${className}`}
    >
      <Star size={size} className={pinned ? 'fill-current' : ''} />
    </button>
  )
}
