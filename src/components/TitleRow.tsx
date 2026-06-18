import { useNavigate } from 'react-router-dom'
import { Star } from 'lucide-react'
import CoverImage from './CoverImage'
import { setMediaDrag } from '../lib/mediaDrag'
import { progressLabel } from './TitleCard'
import { formatRelative } from '../utils/formatters'
import { STATUS_COLORS, type Title } from '../types/models'
import { useI18n } from '../i18n'

export default function TitleRow({ title }: { title: Title }) {
  const navigate = useNavigate()
  const { t } = useI18n()
  return (
    <button
      onClick={() => navigate(`/title/${title.id}`)}
      draggable
      onDragStart={(e) => setMediaDrag(e, { source: 'library', kind: 'title', title: title.title, path: title.cover_path, cover: title.cover_path }, e.currentTarget)}
      className="flex w-full items-center gap-4 rounded-lg px-3 py-2 text-left transition-colors hover:bg-highlight"
    >
      <CoverImage
        coverPath={title.cover_path}
        title={title.title}
        type={title.type}
        className="h-16 w-11 shrink-0 rounded-xl"
        iconSize={18}
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-zinc-200">{title.title}</div>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-zinc-500">
          <span className="font-semibold uppercase tracking-wide text-zinc-600">{t(`type.${title.type}`)}</span>
          {title.year && <span>{title.year}</span>}
          {title.genres.slice(0, 3).map((g) => (
            <span key={g} className="rounded bg-raised px-1.5 py-px">{g}</span>
          ))}
        </div>
      </div>
      <div className="flex w-24 items-center gap-1.5 text-xs" style={{ color: STATUS_COLORS[title.status] }}>
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: STATUS_COLORS[title.status] }} />
        {t(`status.${title.status}`)}
      </div>
      <div className="w-20 text-xs text-zinc-400">{progressLabel(title, t)}</div>
      <div className="flex w-12 items-center gap-1 text-xs text-[var(--c-yellow-text)]">
        {title.rating != null && (
          <>
            <Star size={11} className="fill-amber-500" /> {title.rating}
          </>
        )}
      </div>
      <div className="w-20 text-right text-xs text-zinc-600">{formatRelative(title.last_watched)}</div>
    </button>
  )
}
