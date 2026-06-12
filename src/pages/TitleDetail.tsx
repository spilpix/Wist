import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Check,
  ExternalLink,
  FolderOpen,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Star,
  Trash2,
  Youtube,
} from 'lucide-react'
import AddTitleModal from '../components/AddTitleModal'
import CoverImage from '../components/CoverImage'
import MomentCard from '../components/MomentCard'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import Spinner from '../components/ui/Spinner'
import { toast } from '../store/toastStore'
import {
  STATUS_COLORS,
  TITLE_STATUSES,
  type Episode,
  type Moment,
  type Title,
  type TitleStatus,
  type YoutubeSource,
} from '../types/models'
import { formatDate, formatTimestamp } from '../utils/formatters'
import { useI18n, t as tGlobal } from '../i18n'

export default function TitleDetail() {
  const { id } = useParams()
  const titleId = Number(id)
  const navigate = useNavigate()
  const { t } = useI18n()

  const [title, setTitle] = useState<Title | null>(null)
  const [episodes, setEpisodes] = useState<Episode[]>([])
  const [moments, setMoments] = useState<Moment[]>([])
  const [sources, setSources] = useState<YoutubeSource[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [sourceUrl, setSourceUrl] = useState('')
  const [syncing, setSyncing] = useState<number | null>(null)

  const reload = useCallback(async () => {
    const [t, eps, ms, srcs] = await Promise.all([
      window.wist.titles.get(titleId),
      window.wist.episodes.listByTitle(titleId),
      window.wist.moments.list({ titleId }),
      window.wist.youtube.sources(titleId),
    ])
    setTitle(t)
    setEpisodes(eps)
    setMoments(ms)
    setSources(srcs)
    setLoading(false)
  }, [titleId])

  useEffect(() => {
    setLoading(true)
    reload()
  }, [reload])

  const nextEpisode = useMemo(
    () => episodes.find((e) => !e.watched && e.file_path && !e.file_path.startsWith('http')),
    [episodes]
  )

  const setStatus = async (status: TitleStatus) => {
    await window.wist.titles.update(titleId, { status })
    reload()
  }

  const setRating = async (rating: number | null) => {
    await window.wist.titles.update(titleId, { rating })
    reload()
  }

  const toggleWatched = async (ep: Episode) => {
    await window.wist.episodes.markWatched(ep.id, !ep.watched)
    reload()
  }

  const removeEpisode = async (ep: Episode) => {
    await window.wist.episodes.remove(ep.id)
    reload()
  }

  const addSource = async () => {
    const url = sourceUrl.trim()
    if (!/^https?:\/\//i.test(url)) {
      toast(tGlobal('detail.invalidUrl'), 'error')
      return
    }
    await window.wist.youtube.addSource(titleId, url)
    setSourceUrl('')
    reload()
  }

  const syncSource = async (source: YoutubeSource) => {
    setSyncing(source.id)
    try {
      const res = await window.wist.youtube.syncSource(source.id)
      toast(tGlobal('detail.syncResult', { added: res.added, total: res.total }), 'success')
      reload()
    } catch (err: any) {
      toast(String(err?.message ?? err), 'error')
    } finally {
      setSyncing(null)
    }
  }

  const deleteTitle = async () => {
    await window.wist.titles.remove(titleId)
    toast(tGlobal('detail.deleted'))
    navigate('/library')
  }

  if (loading || !title) return <Spinner />

  const total = Math.max(title.total_episodes, episodes.length, 1)
  const watched = episodes.filter((e) => e.watched).length

  return (
    <div className="page">
      <button onClick={() => navigate(-1)} className="mb-5 flex items-center gap-1.5 text-sm text-zinc-500 transition-colors hover:text-zinc-200">
        <ArrowLeft size={15} /> {t('common.back')}
      </button>

      <div className="flex gap-8">
        <div className="w-52 shrink-0">
          <CoverImage
            coverPath={title.cover_path}
            title={title.title}
            type={title.type}
            className="aspect-[2/3] w-full rounded-xl"
            iconSize={44}
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-3">
            <span className="rounded bg-raised px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
              {t(`type.${title.type}`)}
            </span>
            {title.year && <span className="text-sm text-zinc-500">{title.year}</span>}
          </div>
          <h1 className="text-3xl font-bold text-white">{title.title}</h1>
          {title.original_title && <div className="mt-1 text-sm text-zinc-500">{title.original_title}</div>}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <select
              className="select"
              value={title.status}
              onChange={(e) => setStatus(e.target.value as TitleStatus)}
              style={{ color: STATUS_COLORS[title.status] }}
            >
              {TITLE_STATUSES.map((v) => (
                <option key={v} value={v}>{t(`status.${v}`)}</option>
              ))}
            </select>
            <select
              className="select"
              value={title.rating ?? ''}
              onChange={(e) => setRating(e.target.value ? parseInt(e.target.value, 10) : null)}
            >
              <option value="">{t('detail.noRating')}</option>
              {Array.from({ length: 10 }, (_, i) => 10 - i).map((n) => (
                <option key={n} value={n}>★ {n}</option>
              ))}
            </select>
            {nextEpisode && (
              <button className="btn-accent" onClick={() => navigate(`/player/${nextEpisode.id}`)}>
                <Play size={15} className="fill-white" /> {t('detail.playEp', { n: nextEpisode.episode_number })}
              </button>
            )}
            <button className="btn-ghost" onClick={() => setEditing(true)}>
              <Pencil size={14} /> {t('common.edit')}
            </button>
            <button className="btn-danger !px-3" onClick={() => setConfirmDelete(true)} title={t('detail.deleteTitle')}>
              <Trash2 size={14} />
            </button>
          </div>

          <div className="mt-5 grid max-w-md grid-cols-3 gap-3 text-sm">
            <div className="card px-4 py-3">
              <div className="text-lg font-semibold text-white">{watched}/{total}</div>
              <div className="text-xs text-zinc-500">{t('detail.episodes')}</div>
            </div>
            <div className="card px-4 py-3">
              <div className="text-lg font-semibold text-white">{formatDate(title.date_started)}</div>
              <div className="text-xs text-zinc-500">{t('detail.started')}</div>
            </div>
            <div className="card px-4 py-3">
              <div className="text-lg font-semibold text-white">{formatDate(title.date_finished)}</div>
              <div className="text-xs text-zinc-500">{t('detail.finished')}</div>
            </div>
          </div>

          {(title.genres.length > 0 || title.tags.length > 0) && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {title.genres.map((g) => (
                <span key={g} className="rounded-md bg-raised px-2 py-1 text-xs text-zinc-400">{g}</span>
              ))}
              {title.tags.map((t) => (
                <span key={t} className="rounded-md bg-accent/15 px-2 py-1 text-xs text-accent-bright">#{t}</span>
              ))}
            </div>
          )}

          {title.notes && (
            <p className="mt-4 max-w-2xl whitespace-pre-wrap text-sm leading-relaxed text-zinc-400">{title.notes}</p>
          )}
        </div>
      </div>

      {/* episodes */}
      <section className="mt-10">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="section-title !mb-0">{t('detail.sectionEpisodes')}</h2>
          <Link to="/local" className="btn-ghost !py-1.5 text-xs">
            <Plus size={13} /> {t('detail.addFiles')}
          </Link>
        </div>
        {!episodes.length ? (
          <div className="card px-5 py-8 text-center text-sm text-zinc-600">
            {t('detail.noEpisodes')}
          </div>
        ) : (
          <div className="card divide-y divide-edge/50">
            {episodes.map((ep) => {
              const isYoutube = ep.file_path?.startsWith('http')
              const progress =
                ep.duration_seconds && ep.watch_position_seconds > 0
                  ? Math.min(1, ep.watch_position_seconds / ep.duration_seconds)
                  : 0
              return (
                <div key={ep.id} className="group flex items-center gap-3 px-4 py-2.5">
                  <button
                    onClick={() => toggleWatched(ep)}
                    title={ep.watched ? t('detail.markUnwatched') : t('detail.markWatched')}
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                      ep.watched
                        ? 'border-accent bg-accent text-white'
                        : 'border-edge text-transparent hover:border-accent'
                    }`}
                  >
                    <Check size={12} />
                  </button>
                  <span className="w-14 shrink-0 text-sm tabular-nums text-zinc-500">
                    {ep.season > 1 ? `S${ep.season} ` : ''}E{ep.episode_number}
                  </span>
                  <span className={`min-w-0 flex-1 truncate text-sm ${ep.watched ? 'text-zinc-600' : 'text-zinc-300'}`}>
                    {ep.name ?? (ep.file_path ? ep.file_path.split(/[\\/]/).pop() : t('home.episodeN', { n: ep.episode_number }))}
                  </span>
                  {progress > 0 && !ep.watched && (
                    <div className="h-1 w-20 overflow-hidden rounded-full bg-raised">
                      <div className="h-full bg-accent" style={{ width: `${progress * 100}%` }} />
                    </div>
                  )}
                  <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    {isYoutube && (
                      <button
                        className="rounded-lg p-1.5 text-zinc-400 hover:bg-raised hover:text-white"
                        title={t('detail.openOnYoutube')}
                        onClick={() => window.wist.shell.openExternal(ep.file_path!)}
                      >
                        <ExternalLink size={14} />
                      </button>
                    )}
                    {ep.file_path && !isYoutube && (
                      <>
                        <button
                          className="rounded-lg p-1.5 text-zinc-400 hover:bg-raised hover:text-white"
                          title={t('detail.showInFolder')}
                          onClick={() => window.wist.shell.showItemInFolder(ep.file_path!)}
                        >
                          <FolderOpen size={14} />
                        </button>
                        <button
                          className="rounded-lg p-1.5 text-accent-bright hover:bg-raised"
                          title={t('detail.play')}
                          onClick={() => navigate(`/player/${ep.id}`)}
                        >
                          <Play size={14} className="fill-current" />
                        </button>
                      </>
                    )}
                    <button
                      className="rounded-lg p-1.5 text-zinc-500 hover:bg-raised hover:text-red-400"
                      title={t('detail.removeEpisode')}
                      onClick={() => removeEpisode(ep)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* youtube sources */}
      <section className="mt-10">
        <h2 className="section-title">{t('detail.ytSources')}</h2>
        <div className="card p-4">
          <div className="flex gap-2">
            <input
              className="input"
              placeholder={t('detail.ytPlaceholder')}
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addSource()}
            />
            <button className="btn-accent shrink-0" onClick={addSource}>
              <Plus size={15} /> {t('common.add')}
            </button>
          </div>
          {sources.length > 0 && (
            <div className="mt-3 space-y-2">
              {sources.map((s) => {
                const url = s.playlist_url ?? s.channel_url ?? ''
                return (
                  <div key={s.id} className="flex items-center gap-3 rounded-lg bg-raised px-3 py-2">
                    <Youtube size={15} className="shrink-0 text-red-400" />
                    <span className="min-w-0 flex-1 truncate text-sm text-zinc-300">{url}</span>
                    <span className="shrink-0 text-xs text-zinc-600">
                      {s.last_synced ? t('detail.syncedOn', { date: formatDate(s.last_synced) }) : t('detail.neverSynced')}
                    </span>
                    <button
                      className="btn-ghost !p-1.5"
                      title={t('detail.syncTooltip')}
                      disabled={syncing === s.id}
                      onClick={() => syncSource(s)}
                    >
                      <RefreshCw size={14} className={syncing === s.id ? 'animate-spin' : ''} />
                    </button>
                    <button
                      className="btn-ghost !p-1.5"
                      title={t('detail.openInBrowser')}
                      onClick={() => window.wist.shell.openExternal(url)}
                    >
                      <ExternalLink size={14} />
                    </button>
                    <button
                      className="btn-ghost !p-1.5 hover:!text-red-400"
                      title={t('detail.removeSource')}
                      onClick={async () => {
                        await window.wist.youtube.removeSource(s.id)
                        reload()
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </section>

      {/* moments */}
      {moments.length > 0 && (
        <section className="mt-10">
          <h2 className="section-title">{t('detail.sectionMoments')}</h2>
          <div className="grid grid-cols-4 gap-4">
            {moments.slice(0, 8).map((m) => (
              <MomentCard
                key={m.id}
                moment={m}
                onClick={() => m.episode_id && navigate(`/player/${m.episode_id}?t=${Math.floor(m.timestamp_seconds)}`)}
              />
            ))}
          </div>
        </section>
      )}

      {editing && (
        <AddTitleModal existing={title} onClose={() => setEditing(false)} onSaved={() => reload()} />
      )}
      {confirmDelete && (
        <ConfirmDialog
          title={t('detail.deleteConfirmTitle')}
          message={t('detail.deleteConfirmMessage', { title: title.title })}
          confirmLabel={t('common.delete')}
          danger
          onConfirm={deleteTitle}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  )
}
