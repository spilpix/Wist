import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, ExternalLink, RefreshCw, Youtube } from 'lucide-react'
import EmptyState from '../components/ui/EmptyState'
import Spinner from '../components/ui/Spinner'
import { toast } from '../store/toastStore'
import type { Episode, YoutubeSource } from '../types/models'
import { formatDurationHuman, formatRelative } from '../utils/formatters'
import { useI18n, t as tGlobal } from '../i18n'

interface SourceBlock {
  source: YoutubeSource
  videos: Episode[]
}

export default function YouTubeSources() {
  const { t } = useI18n()
  const [blocks, setBlocks] = useState<SourceBlock[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState<number | null>(null)
  const navigate = useNavigate()

  const load = useCallback(async () => {
    const sources = await window.wist.youtube.sources()
    const withVideos = await Promise.all(
      sources.map(async (source) => {
        const eps = await window.wist.episodes.listByTitle(source.title_id)
        return {
          source,
          videos: eps.filter((e) => e.file_path?.startsWith('http')),
        }
      })
    )
    setBlocks(withVideos)
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const sync = async (source: YoutubeSource) => {
    setSyncing(source.id)
    try {
      const res = await window.wist.youtube.syncSource(source.id)
      toast(tGlobal('detail.syncResult', { added: res.added, total: res.total }), 'success')
      load()
    } catch (err: any) {
      toast(String(err?.message ?? err), 'error')
    } finally {
      setSyncing(null)
    }
  }

  const toggleWatched = async (video: Episode) => {
    await window.wist.episodes.markWatched(video.id, !video.watched)
    load()
  }

  if (loading) return <Spinner />

  return (
    <div className="page">
      <h1 className="page-title">{t('nav.youtube')}</h1>
      <p className="-mt-4 mb-6 max-w-2xl text-sm text-zinc-500">{t('yt.intro')}</p>

      {!blocks.length ? (
        <EmptyState
          icon={Youtube}
          title={t('yt.emptyTitle')}
          subtitle={t('yt.emptySubtitle')}
        />
      ) : (
        <div className="space-y-6">
          {blocks.map(({ source, videos }) => {
            const url = source.playlist_url ?? source.channel_url ?? ''
            const watchedCount = videos.filter((v) => v.watched).length
            return (
              <div key={source.id} className="card overflow-hidden">
                <div className="flex items-center gap-3 border-b border-edge/60 bg-raised/50 px-4 py-3">
                  <Youtube size={17} className="shrink-0 text-red-400" />
                  <button
                    className="min-w-0 truncate text-left text-sm font-medium text-zinc-200 hover:text-white"
                    onClick={() => navigate(`/title/${source.title_id}`)}
                  >
                    {source.title_name ?? `Title #${source.title_id}`}
                  </button>
                  <span className="shrink-0 text-xs text-zinc-600">
                    {t('yt.watchedOf', { w: watchedCount, t: videos.length })}
                    {source.last_synced && ` · ${t('yt.syncedRel', { rel: formatRelative(source.last_synced) })}`}
                  </span>
                  <div className="ml-auto flex shrink-0 items-center gap-1">
                    <button
                      className="btn-ghost !py-1.5 text-xs"
                      disabled={syncing === source.id}
                      onClick={() => sync(source)}
                    >
                      <RefreshCw size={13} className={syncing === source.id ? 'animate-spin' : ''} />
                      {t('yt.sync')}
                    </button>
                    <button
                      className="btn-ghost !py-1.5 text-xs"
                      onClick={() => window.wist.shell.openExternal(url)}
                    >
                      <ExternalLink size={13} /> {t('detail.openInBrowser')}
                    </button>
                  </div>
                </div>
                {videos.length > 0 ? (
                  <div className="max-h-80 divide-y divide-edge/30 overflow-y-auto">
                    {videos.map((video) => (
                      <div key={video.id} className="flex items-center gap-3 px-4 py-2">
                        <button
                          onClick={() => toggleWatched(video)}
                          title={video.watched ? t('detail.markUnwatched') : t('detail.markWatched')}
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                            video.watched
                              ? 'border-accent bg-accent text-[#fff]'
                              : 'border-edge text-transparent hover:border-accent'
                          }`}
                        >
                          <Check size={12} />
                        </button>
                        <span
                          className={`min-w-0 flex-1 truncate text-sm ${
                            video.watched ? 'text-zinc-600 line-through decoration-zinc-700' : 'text-zinc-300'
                          }`}
                        >
                          {video.name ?? video.file_path}
                        </span>
                        {video.duration_seconds != null && video.duration_seconds > 0 && (
                          <span className="shrink-0 text-xs text-zinc-600">
                            {formatDurationHuman(video.duration_seconds)}
                          </span>
                        )}
                        <button
                          className="shrink-0 rounded-lg p-1.5 text-zinc-500 hover:bg-raised hover:text-white"
                          title={t('yt.watchOnYoutube')}
                          onClick={() => window.wist.shell.openExternal(video.file_path!)}
                        >
                          <ExternalLink size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="px-4 py-6 text-center text-sm text-zinc-600">
                    {t('yt.noVideos')}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
