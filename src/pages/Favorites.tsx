import { useEffect, useState } from 'react'
import { Heart } from 'lucide-react'
import TitleCard from '../components/TitleCard'
import EmptyState from '../components/ui/EmptyState'
import Spinner from '../components/ui/Spinner'
import type { Title } from '../types/models'
import { useI18n } from '../i18n'

export default function Favorites() {
  const { t } = useI18n()
  const [titles, setTitles] = useState<Title[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    window.wist.titles
      .list({ minRating: 9, sort: 'rating', sortDir: 'desc' })
      .then(setTitles)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <Spinner />

  return (
    <div className="page">
      <h1 className="page-title">{t('nav.favorites')}</h1>
      <p className="-mt-4 mb-6 text-sm text-zinc-500">{t('fav.subtitle')}</p>
      {!titles.length ? (
        <EmptyState
          icon={Heart}
          title={t('fav.emptyTitle')}
          subtitle={t('fav.emptySubtitle')}
        />
      ) : (
        <div className="grid grid-cols-3 gap-x-5 gap-y-7 lg:grid-cols-4 xl:grid-cols-5">
          {titles.map((t) => (
            <TitleCard key={t.id} title={t} />
          ))}
        </div>
      )}
    </div>
  )
}
