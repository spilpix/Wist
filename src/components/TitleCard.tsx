import { useNavigate } from 'react-router-dom'
import { Star } from 'lucide-react'
import CoverImage from './CoverImage'
import { STATUS_COLORS, type Title } from '../types/models'
import { useI18n, type TKey, type TParams } from '../i18n'

type Translate = (key: TKey, params?: TParams) => string

export function progressLabel(title: Title, t: Translate): string {
  if (title.type === 'movie') {
    return (title.watched_count ?? 0) > 0 ? t('card.watched') : t('card.notWatched')
  }
  if (title.type === 'book') {
    return t('card.chProgress', { w: title.reading_progress ?? 0, t: title.total_episodes || '?' })
  }
  const total = Math.max(title.total_episodes, title.episode_count ?? 0)
  return t('card.epProgress', { w: title.watched_count ?? 0, t: total || '?' })
}

export default function TitleCard({ title }: { title: Title }) {
  const navigate = useNavigate()
  const { t } = useI18n()
  const isBook = title.type === 'book'
  const total = Math.max(title.total_episodes, isBook ? 0 : title.episode_count ?? 0, 1)
  const done = isBook ? title.reading_progress ?? 0 : title.watched_count ?? 0
  const progress = Math.min(1, done / total)

  return (
    <button
      onClick={() => navigate(`/title/${title.id}`)}
      className="group w-full text-left transition-transform duration-150 hover:-translate-y-0.5"
    >
      <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-raised">
        <CoverImage
          coverPath={title.cover_path}
          title={title.title}
          type={title.type}
          className="h-full w-full transition-transform duration-200 group-hover:scale-[1.03]"
        />
        <span
          className="absolute left-2 top-2 h-2.5 w-2.5 rounded-full ring-2 ring-black/50"
          style={{ backgroundColor: STATUS_COLORS[title.status] }}
          title={t(`status.${title.status}`)}
        />
        {title.rating != null && (
          <span className="absolute right-2 top-2 flex items-center gap-1 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-semibold text-amber-300">
            <Star size={10} className="fill-amber-300" />
            {title.rating}
          </span>
        )}
        <span className="absolute bottom-2 left-2 rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#d4d4d8]">
          {t(`type.${title.type}`)}
        </span>
        {progress > 0 && progress < 1 && (
          <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-black/60">
            <div className="h-full bg-accent" style={{ width: `${progress * 100}%` }} />
          </div>
        )}
      </div>
      <div className="mt-2 truncate text-[13px] font-medium text-zinc-200 group-hover:text-white">
        {title.title}
      </div>
      <div className="text-xs text-zinc-500">{progressLabel(title, t)}</div>
    </button>
  )
}
