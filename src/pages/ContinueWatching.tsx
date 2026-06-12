import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Clock, Play } from 'lucide-react'
import CoverImage from '../components/CoverImage'
import EmptyState from '../components/ui/EmptyState'
import Spinner from '../components/ui/Spinner'
import type { ContinueItem } from '../types/models'
import { formatRelative, formatTimestamp } from '../utils/formatters'
import { useI18n } from '../i18n'

export default function ContinueWatching() {
  const { t } = useI18n()
  const [items, setItems] = useState<ContinueItem[]>([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    window.wist.episodes
      .continueWatching()
      .then(setItems)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <Spinner />

  return (
    <div className="page">
      <h1 className="page-title">{t('nav.continue')}</h1>
      {!items.length ? (
        <EmptyState
          icon={Clock}
          title={t('cont.emptyTitle')}
          subtitle={t('cont.emptySubtitle')}
        />
      ) : (
        <div className="max-w-3xl space-y-2">
          {items.map((item) => {
            const duration = item.duration_seconds ?? 0
            const progress = duration > 0 ? Math.min(1, item.watch_position_seconds / duration) : 0
            return (
              <button
                key={item.id}
                onClick={() => navigate(`/player/${item.id}`)}
                className="group flex w-full items-center gap-4 rounded-xl bg-surface px-4 py-3 text-left transition-colors hover:bg-raised"
              >
                <CoverImage
                  coverPath={item.cover_path}
                  title={item.title_name}
                  type={item.title_type}
                  className="h-14 w-10 shrink-0 rounded-md"
                  iconSize={16}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-zinc-200">{item.title_name}</div>
                  <div className="mt-0.5 text-xs text-zinc-500">
                    {t('home.episodeN', { n: item.episode_number })} · {formatRelative(item.watch_date)}
                  </div>
                  <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-raised">
                    <div className="h-full bg-accent" style={{ width: `${progress * 100}%` }} />
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  {duration > 0 && (
                    <div className="text-xs text-zinc-500">
                      {t('home.timeLeft', { time: formatTimestamp(duration - item.watch_position_seconds) })}
                    </div>
                  )}
                  <span className="mt-1 inline-flex h-8 w-8 items-center justify-center rounded-full bg-accent/15 text-accent-bright transition-colors group-hover:bg-accent group-hover:text-white">
                    <Play size={14} className="ml-0.5 fill-current" />
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
