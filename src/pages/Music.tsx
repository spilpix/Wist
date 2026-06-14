import { useCallback, useEffect, useState } from 'react'
import { ExternalLink, Music as MusicIcon, Plus, Trash2 } from 'lucide-react'
import EmptyState from '../components/ui/EmptyState'
import Spinner from '../components/ui/Spinner'
import PageHeader from '../components/ui/PageHeader'
import { toast } from '../store/toastStore'
import type { MusicService, Playlist } from '../types/models'
import { useI18n, t as tGlobal } from '../i18n'

const SERVICE_META: Record<MusicService, { label: string; color: string }> = {
  spotify: { label: 'Spotify', color: '#1db954' },
  youtube: { label: 'YouTube', color: '#ff0033' },
  yandex: { label: 'Яндекс Музыка', color: '#ffcc00' },
  soundcloud: { label: 'SoundCloud', color: '#ff5500' },
  apple: { label: 'Apple Music', color: '#fa57c1' },
  other: { label: 'Link', color: '#d4813a' },
}

export default function Music() {
  const { t } = useI18n()
  const [playlists, setPlaylists] = useState<Playlist[] | null>(null)
  const [url, setUrl] = useState('')
  const [adding, setAdding] = useState(false)

  const load = useCallback(
    () =>
      window.wist.playlists
        .list()
        .then(setPlaylists)
        .catch((e) => {
          console.error('music load failed', e)
          setPlaylists((prev) => prev ?? [])
        }),
    []
  )

  useEffect(() => {
    load()
  }, [load])

  const add = async () => {
    const link = url.trim()
    if (!/^https?:\/\//i.test(link)) {
      toast(tGlobal('music.invalidUrl'), 'error')
      return
    }
    setAdding(true)
    try {
      // oEmbed gives us the real playlist title + cover with zero API keys
      const meta = await window.wist.meta.oembed(link)
      let cover: string | null = null
      if (meta.thumbnail) {
        try {
          cover = await window.wist.meta.coverFromUrl(meta.thumbnail)
        } catch {
          cover = null
        }
      }
      await window.wist.playlists.create({ url: link, title: meta.title ?? undefined, cover_path: cover })
      setUrl('')
      load()
    } catch (err) {
      toast(String(err), 'error')
    } finally {
      setAdding(false)
    }
  }

  if (!playlists) return <Spinner />

  return (
    <div className="page">
      <PageHeader icon={MusicIcon} title={t('nav.music')} subtitle={t('music.intro')} />

      <div className="mb-8 flex max-w-2xl gap-2">
        <input
          className="input"
          placeholder={t('music.placeholder')}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <button className="btn-accent shrink-0" onClick={add} disabled={adding}>
          <Plus size={16} /> {t('common.add')}
        </button>
      </div>

      {!playlists.length ? (
        <EmptyState icon={MusicIcon} title={t('music.emptyTitle')} subtitle={t('music.emptySubtitle')} />
      ) : (
        <div className="grid grid-cols-3 gap-5 lg:grid-cols-4 xl:grid-cols-5">
          {playlists.map((p) => {
            const meta = SERVICE_META[p.service] ?? SERVICE_META.other
            return (
              <div key={p.id} className="group">
                <button
                  onClick={() => window.wist.shell.openExternal(p.url)}
                  className="relative block aspect-square w-full overflow-hidden rounded-xl bg-raised text-left transition-transform duration-150 hover:-translate-y-0.5"
                >
                  {p.cover_path ? (
                    <img
                      src={window.wist.media.fileUrl(p.cover_path)}
                      alt={p.title}
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
                    />
                  ) : (
                    <div
                      className="flex h-full w-full items-center justify-center"
                      style={{ background: `linear-gradient(135deg, ${meta.color}33, ${meta.color}0d)` }}
                    >
                      <MusicIcon size={36} style={{ color: meta.color }} />
                    </div>
                  )}
                  <span
                    className="absolute left-2 top-2 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#fff]"
                    style={{ backgroundColor: meta.color }}
                  >
                    {meta.label}
                  </span>
                  <span className="absolute bottom-2 right-2 flex h-9 w-9 items-center justify-center rounded-full bg-black/70 opacity-0 transition-opacity group-hover:opacity-100">
                    <ExternalLink size={15} className="text-[#fff]" />
                  </span>
                </button>
                <div className="mt-2 flex items-start justify-between gap-2">
                  <div className="min-w-0 truncate text-[13px] font-medium text-zinc-200">{p.title}</div>
                  <button
                    className="shrink-0 text-zinc-600 opacity-0 transition-all hover:text-red-400 group-hover:opacity-100"
                    onClick={async () => {
                      await window.wist.playlists.remove(p.id)
                      load()
                    }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
