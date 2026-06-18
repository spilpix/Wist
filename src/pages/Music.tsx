import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronLeft,
  Clock,
  CornerDownRight,
  Disc3,
  FolderPlus,
  GripVertical,
  Heart,
  ListPlus,
  ListMusic,
  MoreHorizontal,
  Music as MusicIcon,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  Shuffle,
  Trash2,
  User,
  X,
} from 'lucide-react'
import EmptyState from '../components/ui/EmptyState'
import Skeleton, { SkeletonLine } from '../components/ui/Skeleton'
import Tabs from '../components/ui/Tabs'
import Tooltip from '../components/ui/Tooltip'
import Cover, { gradientFor } from '../components/ui/Cover'
import Equalizer from '../components/ui/Equalizer'
import { toast } from '../store/toastStore'
import { setMediaDrag } from '../lib/mediaDrag'
import { useSortable } from '../lib/useSortable'
import { fmtTime, usePlayerStore } from '../store/playerStore'
import type { MusicAlbum, MusicArtist, MusicPlaylist, Track } from '../types/models'
import { useI18n } from '../i18n'

type Tab = 'songs' | 'albums' | 'artists' | 'liked' | 'playlists'
type Detail =
  | { kind: 'album'; album: MusicAlbum }
  | { kind: 'artist'; artist: MusicArtist }
  | { kind: 'playlist'; playlist: MusicPlaylist }
  | null

// ---------------- track list (the song table) ----------------
function TrackList({
  tracks,
  showAlbum = true,
  playlists,
  onLike,
  onRemove,
  onAddToPlaylist,
  onRemoveFromPlaylist,
  onReorder,
}: {
  tracks: Track[]
  showAlbum?: boolean
  playlists: MusicPlaylist[]
  onLike: (t: Track) => void
  onRemove?: (t: Track) => void
  onAddToPlaylist: (playlistId: number, trackId: number) => void
  onRemoveFromPlaylist?: (trackId: number) => void
  onReorder?: (trackIds: number[]) => void
}) {
  const { t } = useI18n()
  const currentId = usePlayerStore((s) => s.current?.id)
  const playing = usePlayerStore((s) => s.playing)
  const [menu, setMenu] = useState<number | null>(null)
  // pointer-drag reorder (playlist view only — onReorder provided)
  const sortable = !!onReorder
  const { onHandleDown, draggingId, overIndex } = useSortable(
    tracks.map((tr) => tr.id),
    onReorder ?? (() => {})
  )

  const play = (i: number) => {
    const tr = tracks[i]
    if (currentId === tr.id) usePlayerStore.getState().toggle()
    else usePlayerStore.getState().playTracks(tracks, i)
  }

  return (
    <div className="select-none" data-sortable-container>
      <div className="grid grid-cols-[28px_1fr_auto] items-center gap-3 border-b border-edge px-3 pb-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500 sm:grid-cols-[28px_1.6fr_1fr_auto]">
        <span className="text-center">#</span>
        <span>{t('music.colTitle')}</span>
        {showAlbum && <span className="hidden sm:block">{t('music.colAlbum')}</span>}
        <span className="flex justify-end pr-8"><Clock size={14} /></span>
      </div>
      {tracks.map((tr, i) => {
        const isCur = currentId === tr.id
        return (
          <Fragment key={tr.id}>
            {sortable && overIndex === i && <div className="insert-line" />}
          <div
            data-sortable-item
            onDoubleClick={() => play(i)}
            draggable
            onDragStart={(e) => setMediaDrag(e, { source: 'music', kind: 'audio', title: tr.title, path: tr.path, cover: tr.cover_path }, e.currentTarget)}
            className={`group relative grid grid-cols-[28px_1fr_auto] items-center gap-3 rounded-lg px-3 py-1.5 text-[13px] sm:grid-cols-[28px_1.6fr_1fr_auto] ${
              isCur ? 'bg-highlight' : 'hover:bg-highlight'
            } ${draggingId === tr.id ? 'drag-taken' : ''}`}
          >
            {sortable && (
              <span
                className="drag-handle absolute left-[-14px] top-1/2 h-6 w-3.5 -translate-y-1/2 opacity-0 group-hover:opacity-100"
                onMouseDown={(e) => onHandleDown(e, tr.id)}
                title={t('fav.reorder')}
              >
                <GripVertical size={12} />
              </span>
            )}
            {/* index / equalizer / play */}
            <button onClick={() => play(i)} className="flex h-7 w-7 items-center justify-center text-zinc-500">
              {isCur ? (
                playing ? (
                  <>
                    <Equalizer className="text-accent-bright group-hover:hidden" />
                    <Pause size={14} className="hidden fill-current text-white group-hover:block" />
                  </>
                ) : (
                  <Play size={14} className="fill-current text-accent-bright" />
                )
              ) : (
                <>
                  <span className="group-hover:hidden">{i + 1}</span>
                  <Play size={14} className="hidden fill-current text-zinc-200 group-hover:block" />
                </>
              )}
            </button>

            {/* cover + title + artist */}
            <button onClick={() => play(i)} className="flex min-w-0 items-center gap-3 text-left">
              <div className="h-9 w-9 shrink-0">
                <Cover path={tr.cover_path} seed={tr.album || tr.title} rounded="rounded-lg" size={16} />
              </div>
              <div className="min-w-0">
                <div className={`truncate font-medium ${isCur ? 'text-accent-bright' : 'text-zinc-100'}`}>{tr.title}</div>
                <div className="truncate text-[12px] text-zinc-500">{tr.artist || t('music.unknownArtist')}</div>
              </div>
            </button>

            {/* album */}
            {showAlbum && <div className="hidden min-w-0 truncate text-[12px] text-zinc-500 sm:block">{tr.album || ''}</div>}

            {/* like · duration · menu */}
            <div className="flex items-center justify-end gap-1.5">
              <button
                onClick={() => onLike(tr)}
                className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
                  tr.liked ? 'text-accent-bright' : 'text-zinc-500 opacity-0 hover:text-zinc-200 group-hover:opacity-100'
                }`}
              >
                <Heart size={15} className={tr.liked ? 'fill-current' : ''} />
              </button>
              <span className="w-10 text-right text-[12px] tabular-nums text-zinc-500">{fmtTime(tr.duration_seconds)}</span>
              <div className="relative">
                <button
                  onClick={() => setMenu(menu === tr.id ? null : tr.id)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-500 opacity-0 hover:text-zinc-200 group-hover:opacity-100"
                >
                  <MoreHorizontal size={16} />
                </button>
                {menu === tr.id && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} />
                    <div className="absolute right-0 top-8 z-50 w-52 overflow-hidden rounded-2xl border border-edge bg-card py-1 animate-scale-in" style={{ boxShadow: 'var(--float-shadow)' }}>
                      <button
                        onClick={() => { usePlayerStore.getState().playNext(tr); toast(t('music.queued'), 'success'); setMenu(null) }}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] text-zinc-200 hover:bg-highlight"
                      >
                        <CornerDownRight size={14} className="shrink-0 text-zinc-500" /> {t('music.playNext')}
                      </button>
                      <button
                        onClick={() => { usePlayerStore.getState().addToQueue(tr); toast(t('music.queued'), 'success'); setMenu(null) }}
                        className="flex w-full items-center gap-2 border-b border-edge px-3 py-1.5 text-left text-[13px] text-zinc-200 hover:bg-highlight"
                      >
                        <ListPlus size={14} className="shrink-0 text-zinc-500" /> {t('music.addToQueue')}
                      </button>
                      <div className="px-3 py-1 pt-2 text-[11px] font-medium uppercase tracking-wider text-zinc-500">{t('music.addToPlaylist')}</div>
                      <div className="max-h-52 overflow-y-auto">
                        {playlists.length === 0 && <div className="px-3 py-1.5 text-[12px] text-zinc-500">{t('music.noPlaylists')}</div>}
                        {playlists.map((pl) => (
                          <button
                            key={pl.id}
                            onClick={() => {
                              onAddToPlaylist(pl.id, tr.id)
                              setMenu(null)
                            }}
                            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] text-zinc-200 hover:bg-highlight"
                          >
                            <ListMusic size={14} className="shrink-0 text-zinc-500" />
                            <span className="min-w-0 truncate">{pl.name}</span>
                          </button>
                        ))}
                      </div>
                      {onRemoveFromPlaylist && (
                        <button onClick={() => { onRemoveFromPlaylist(tr.id); setMenu(null) }} className="mt-1 flex w-full items-center gap-2 border-t border-edge px-3 py-1.5 text-left text-[13px] text-zinc-300 hover:bg-highlight">
                          <X size={14} className="shrink-0 text-zinc-500" /> {t('music.removeFromPlaylist')}
                        </button>
                      )}
                      {onRemove && (
                        <button onClick={() => { onRemove(tr); setMenu(null) }} className="flex w-full items-center gap-2 border-t border-edge px-3 py-1.5 text-left text-[13px] text-danger hover:bg-highlight">
                          <Trash2 size={14} className="shrink-0" /> {t('music.removeTrack')}
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
          </Fragment>
        )
      })}
      {sortable && overIndex === tracks.length && <div className="insert-line" />}
    </div>
  )
}

// big hero with Play + Shuffle (Spotify section header)
function PlayHero({
  kicker,
  title,
  subtitle,
  tracks,
  cover,
  seed,
  round = false,
}: {
  kicker: string
  title: string
  subtitle: string
  tracks: Track[]
  cover: string | null
  seed: string
  round?: boolean
}) {
  const { t } = useI18n()
  const playAll = () => tracks.length && usePlayerStore.getState().playTracks(tracks, 0)
  const shuffleAll = () => {
    if (!tracks.length) return
    usePlayerStore.setState({ shuffle: true })
    usePlayerStore.getState().playTracks(tracks, Math.floor(Math.random() * tracks.length))
  }
  return (
    <div className="mb-6 flex items-end gap-5">
      <div className={`h-36 w-36 shrink-0 ${round ? 'rounded-full' : 'rounded-xl'} overflow-hidden`}>
        <Cover path={cover} seed={seed} rounded={round ? 'rounded-full' : 'rounded-xl'} icon={round ? User : MusicIcon} size={44} />
      </div>
      <div className="min-w-0 flex-1 pb-1">
        <div className="text-[12px] font-semibold uppercase tracking-wider text-zinc-500">{kicker}</div>
        <h1 className="mt-1 truncate text-[2rem] font-bold tracking-tight text-white">{title}</h1>
        <div className="mt-1 text-[13px] text-zinc-500">{subtitle}</div>
        <div className="mt-4 flex items-center gap-2">
          <button onClick={playAll} disabled={!tracks.length} className="btn-accent">
            <Play size={16} className="fill-current" /> {t('music.play')}
          </button>
          <button onClick={shuffleAll} disabled={!tracks.length} className="btn-outline">
            <Shuffle size={15} /> {t('music.shuffle')}
          </button>
        </div>
      </div>
    </div>
  )
}

// green hover-play button overlaid on a card's cover
function PlayFab({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className="absolute bottom-2 right-2 flex h-10 w-10 translate-y-1 items-center justify-center rounded-full bg-accent text-[#fff] opacity-0 transition-all duration-200 hover:bg-accent-hover group-hover:translate-y-0 group-hover:opacity-100"
      style={{ boxShadow: 'var(--float-shadow)' }}
    >
      <Play size={18} className="fill-current pl-0.5" />
    </button>
  )
}

export default function Music() {
  const { t, tn } = useI18n()
  const [tracks, setTracks] = useState<Track[] | null>(null)
  const [albums, setAlbums] = useState<MusicAlbum[]>([])
  const [artists, setArtists] = useState<MusicArtist[]>([])
  const [playlists, setPlaylists] = useState<MusicPlaylist[]>([])
  const [folders, setFolders] = useState<string[]>([])
  const [tab, setTab] = useState<Tab>('songs')
  const [detail, setDetail] = useState<Detail>(null)
  const [detailTracks, setDetailTracks] = useState<Track[]>([])
  const [query, setQuery] = useState('')
  const [scanning, setScanning] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const newRef = useRef<HTMLInputElement>(null)

  // quietly fill in missing track durations in the background (one <audio> probe at
  // a time). Imperative on purpose — a [tracks] effect would tear itself down each
  // time it wrote a duration back into state.
  const prefetchRef = useRef<{ cancelled: boolean } | null>(null)
  const prefetchDurations = useCallback((list: Track[]) => {
    const missing = list.filter((tr) => tr.duration_seconds == null)
    if (!missing.length) return
    if (prefetchRef.current) prefetchRef.current.cancelled = true
    const ctl = { cancelled: false }
    prefetchRef.current = ctl
    const probe = new Audio()
    probe.preload = 'metadata'
    let i = 0
    let curId = -1
    const next = () => {
      if (ctl.cancelled || i >= missing.length) return
      const it = missing[i++]
      curId = it.id
      probe.src = window.wist.media.fileUrl(it.path)
    }
    probe.addEventListener('loadedmetadata', () => {
      const d = probe.duration
      if (Number.isFinite(d) && d > 0) {
        const id = curId
        window.wist.music.setDuration(id, d).catch(() => undefined)
        setTracks((prev) => prev?.map((x) => (x.id === id ? { ...x, duration_seconds: d } : x)) ?? prev)
      }
      next()
    })
    probe.addEventListener('error', () => next())
    next()
  }, [])
  useEffect(() => () => { if (prefetchRef.current) prefetchRef.current.cancelled = true }, [])

  const load = useCallback(async () => {
    try {
      const [tr, al, ar, pl, fo] = await Promise.all([
        window.wist.music.list(),
        window.wist.music.albums(),
        window.wist.music.artists(),
        window.wist.music.playlists(),
        window.wist.music.folders(),
      ])
      setTracks(tr)
      setAlbums(al)
      setArtists(ar)
      setPlaylists(pl)
      setFolders(fo)
      prefetchDurations(tr)
    } catch (e) {
      console.error('music load failed', e)
      setTracks((prev) => prev ?? [])
    }
  }, [prefetchDurations])

  useEffect(() => {
    load()
    return window.wist.events.onDataChanged((kind) => {
      if (kind === 'music') load()
    })
  }, [load])

  // refresh the open detail view's tracks when data changes
  useEffect(() => {
    if (!detail) return
    if (detail.kind === 'playlist') {
      window.wist.music.playlistTracks(detail.playlist.id).then(setDetailTracks).catch(() => setDetailTracks([]))
    } else if (detail.kind === 'album') {
      const a = detail.album
      setDetailTracks((tracks ?? []).filter((tr) => tr.album === a.album && (tr.album_artist || tr.artist || 'Unknown') === a.artist))
    } else {
      setDetailTracks((tracks ?? []).filter((tr) => tr.artist === detail.artist.name))
    }
  }, [detail, tracks])

  const scan = async () => {
    setScanning(true)
    try {
      const res = await window.wist.music.scan()
      toast(res.added ? t('music.addedN', { n: res.added }) : t('music.nothingNew'), res.added ? 'success' : 'info')
    } catch (e) {
      toast(String(e), 'error')
    } finally {
      setScanning(false)
    }
  }

  const addFolder = async () => {
    setScanning(true)
    try {
      const res = await window.wist.music.addFolder()
      if (res) toast(res.added ? t('music.addedN', { n: res.added }) : t('music.nothingNew'), res.added ? 'success' : 'info')
    } catch (e) {
      toast(String(e), 'error')
    } finally {
      setScanning(false)
    }
  }

  const toggleLike = (tr: Track) => {
    const liked = tr.liked ? 0 : 1
    setTracks((prev) => prev?.map((x) => (x.id === tr.id ? { ...x, liked: liked as 0 | 1 } : x)) ?? prev)
    setDetailTracks((prev) => prev.map((x) => (x.id === tr.id ? { ...x, liked: liked as 0 | 1 } : x)))
    usePlayerStore.getState().patchTrack(tr.id, { liked: liked as 0 | 1 })
    window.wist.music.setLiked(tr.id, !!liked).catch(() => undefined)
  }
  const removeTrack = (tr: Track) => {
    setTracks((prev) => prev?.filter((x) => x.id !== tr.id) ?? prev)
    window.wist.music.remove(tr.id).catch(() => undefined)
  }
  const addToPlaylist = (playlistId: number, trackId: number) => {
    window.wist.music.addToPlaylist(playlistId, trackId).then(() => toast(t('music.addToPlaylist'), 'success')).catch(() => undefined)
  }
  const removeFromPlaylist = (trackId: number) => {
    if (detail?.kind !== 'playlist') return
    setDetailTracks((prev) => prev.filter((x) => x.id !== trackId))
    window.wist.music.removeFromPlaylist(detail.playlist.id, trackId).catch(() => undefined)
  }
  const reorderPlaylistTracks = (trackIds: number[]) => {
    if (detail?.kind !== 'playlist') return
    // optimistic local reorder so the list settles instantly, then persist
    setDetailTracks((prev) => {
      const byId = new Map(prev.map((x) => [x.id, x]))
      return trackIds.map((id) => byId.get(id)).filter(Boolean) as Track[]
    })
    window.wist.music.reorderPlaylist(detail.playlist.id, trackIds).catch(() => undefined)
  }

  // play-now straight from a card (no detail navigation)
  const playList = (list: Track[]) => list.length && usePlayerStore.getState().playTracks(list, 0)
  const playAlbum = (a: MusicAlbum) => playList((tracks ?? []).filter((tr) => tr.album === a.album && (tr.album_artist || tr.artist || 'Unknown') === a.artist))
  const playArtist = (a: MusicArtist) => playList((tracks ?? []).filter((tr) => tr.artist === a.name))
  const playPlaylistNow = async (pl: MusicPlaylist) => playList(await window.wist.music.playlistTracks(pl.id))

  const createPlaylist = async () => {
    const name = newName.trim()
    if (!name) return
    setNewName('')
    setCreating(false)
    await window.wist.music.createPlaylist(name)
  }

  // ---- search ----
  const q = query.trim().toLowerCase()
  const filteredTracks = useMemo(() => {
    const base = tracks ?? []
    if (!q) return base
    return base.filter((t) => `${t.title} ${t.artist ?? ''} ${t.album ?? ''}`.toLowerCase().includes(q))
  }, [tracks, q])
  const likedTracks = useMemo(() => (tracks ?? []).filter((t) => t.liked).filter((t) => !q || `${t.title} ${t.artist ?? ''}`.toLowerCase().includes(q)), [tracks, q])
  const filteredAlbums = useMemo(() => albums.filter((a) => !q || `${a.album} ${a.artist}`.toLowerCase().includes(q)), [albums, q])
  const filteredArtists = useMemo(() => artists.filter((a) => !q || a.name.toLowerCase().includes(q)), [artists, q])

  if (!tracks)
    return (
      <div className="px-8 py-8">
        <div className="mb-6 flex items-center gap-3">
          <Skeleton w={36} h={36} radius="12px" />
          <SkeletonLine w={140} className="!h-[20px]" />
        </div>
        <div className="space-y-1.5">
          {['44%', '30%', '52%', '36%', '48%', '28%', '40%', '34%'].map((w, i) => (
            <div key={i} className="flex items-center gap-3 px-2 py-1.5">
              <Skeleton w={40} h={40} radius="8px" className="shrink-0" />
              <div className="flex flex-1 flex-col gap-1.5">
                <SkeletonLine w={w} />
                <SkeletonLine w="20%" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )

  const hasLibrary = tracks.length > 0 || folders.length > 0
  const listProps = { playlists, onLike: toggleLike, onAddToPlaylist: addToPlaylist }

  const TABS: Array<{ id: Tab; label: string; icon: typeof MusicIcon }> = [
    { id: 'songs', label: t('music.tabSongs'), icon: MusicIcon },
    { id: 'albums', label: t('music.tabAlbums'), icon: Disc3 },
    { id: 'artists', label: t('music.tabArtists'), icon: User },
    { id: 'liked', label: t('music.tabLiked'), icon: Heart },
    { id: 'playlists', label: t('music.tabPlaylists'), icon: ListMusic },
  ]

  return (
    <div className="h-full overflow-y-auto">
      {/* sticky header: title + scan actions + search + tabs */}
      <div className="sticky top-0 z-20 border-b border-edge bg-bg/95 px-8 pt-6 backdrop-blur">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-raised text-zinc-300">
            <MusicIcon size={20} />
          </div>
          <h1 className="text-[1.6rem] font-bold tracking-tight text-white">{t('nav.music')}</h1>
          <div className="ml-auto flex items-center gap-2">
            <div className="relative">
              <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('music.searchPh')}
                className="h-9 w-56 rounded-lg border border-edge bg-field pl-8 pr-3 text-[13px] text-zinc-200 outline-none placeholder:text-zinc-500 focus:border-accent"
              />
            </div>
            <Tooltip label={t('music.scan')} side="bottom">
              <button onClick={scan} disabled={scanning} className="flex h-9 w-9 items-center justify-center rounded-lg border border-edge text-zinc-400 transition-colors hover:bg-highlight hover:text-zinc-100 disabled:opacity-50">
                <RefreshCw size={16} className={scanning ? 'animate-spin' : ''} />
              </button>
            </Tooltip>
            <button onClick={addFolder} disabled={scanning} className="btn-accent h-9">
              <FolderPlus size={16} /> {t('music.addFolder')}
            </button>
          </div>
        </div>
        {/* tabs */}
        {hasLibrary && !detail && <Tabs tabs={TABS} active={tab} onChange={(id) => setTab(id as Tab)} />}
        {detail && (
          <button onClick={() => setDetail(null)} className="mb-2 flex items-center gap-1 text-[13px] text-zinc-400 hover:text-zinc-100">
            <ChevronLeft size={16} /> {t('common.back')}
          </button>
        )}
        <div className="h-3" />
      </div>

      <div className="px-8 py-6">
        {/* ---------- empty library ---------- */}
        {!hasLibrary ? (
          <div className="pt-10">
            <EmptyState icon={MusicIcon} title={t('music.emptyLocalTitle')} subtitle={t('music.emptyLocalSub')} />
            <div className="mt-5 flex justify-center">
              <button onClick={addFolder} disabled={scanning} className="btn-accent">
                <FolderPlus size={16} /> {t('music.addFolder')}
              </button>
            </div>
          </div>
        ) : detail ? (
          /* ---------- detail view (album / artist / playlist) ---------- */
          <>
            <PlayHero
              kicker={detail.kind === 'album' ? t('music.tabAlbums') : detail.kind === 'artist' ? t('music.tabArtists') : t('music.tabPlaylists')}
              title={detail.kind === 'album' ? detail.album.album : detail.kind === 'artist' ? detail.artist.name : detail.playlist.name}
              subtitle={
                detail.kind === 'album'
                  ? `${detail.album.artist} · ${tn('count.tracks', detailTracks.length)}`
                  : tn('count.tracks', detailTracks.length)
              }
              tracks={detailTracks}
              cover={detail.kind === 'album' ? detail.album.cover_path : detail.kind === 'artist' ? detail.artist.cover_path : detailTracks[0]?.cover_path ?? null}
              seed={detail.kind === 'album' ? detail.album.key : detail.kind === 'artist' ? detail.artist.name : detail.playlist.name}
              round={detail.kind === 'artist'}
            />
            {detailTracks.length === 0 ? (
              <div className="py-10 text-center text-[13px] text-zinc-500">{t('music.playlistEmpty')}</div>
            ) : (
              <TrackList
                tracks={detailTracks}
                showAlbum={detail.kind !== 'album'}
                {...listProps}
                onRemoveFromPlaylist={detail.kind === 'playlist' ? removeFromPlaylist : undefined}
                onReorder={detail.kind === 'playlist' ? reorderPlaylistTracks : undefined}
              />
            )}
          </>
        ) : tab === 'songs' ? (
          <TrackList tracks={filteredTracks} {...listProps} onRemove={removeTrack} />
        ) : tab === 'liked' ? (
          likedTracks.length ? (
            <>
              <PlayHero kicker={t('music.tabLiked')} title={t('music.likedSongs')} subtitle={tn('count.tracks', likedTracks.length)} tracks={likedTracks} cover={null} seed="liked" />
              <TrackList tracks={likedTracks} {...listProps} />
            </>
          ) : (
            <EmptyState icon={Heart} title={t('music.tabLiked')} subtitle={t('music.noLiked')} />
          )
        ) : tab === 'albums' ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {filteredAlbums.map((a) => (
              <div key={a.key} className="group relative rounded-xl p-3 transition-colors hover:bg-highlight">
                <div className="relative mb-3 aspect-square w-full cursor-pointer overflow-hidden rounded-xl" onClick={() => setDetail({ kind: 'album', album: a })}>
                  <Cover path={a.cover_path} seed={a.key} rounded="rounded-xl" size={32} />
                  <PlayFab onClick={() => playAlbum(a)} />
                </div>
                <div className="cursor-pointer" onClick={() => setDetail({ kind: 'album', album: a })}>
                  <div className="truncate text-[13px] font-semibold text-zinc-100">{a.album}</div>
                  <div className="truncate text-[12px] text-zinc-500">{a.artist}</div>
                </div>
              </div>
            ))}
          </div>
        ) : tab === 'artists' ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {filteredArtists.map((a) => (
              <div key={a.name} className="group relative rounded-xl p-3 text-center transition-colors hover:bg-highlight">
                <div className="relative mx-auto mb-3 aspect-square w-full cursor-pointer overflow-hidden rounded-full" onClick={() => setDetail({ kind: 'artist', artist: a })}>
                  <Cover path={a.cover_path} seed={a.name} rounded="rounded-full" icon={User} size={36} />
                  <PlayFab onClick={() => playArtist(a)} />
                </div>
                <div className="cursor-pointer" onClick={() => setDetail({ kind: 'artist', artist: a })}>
                  <div className="truncate text-[13px] font-semibold text-zinc-100">{a.name}</div>
                  <div className="truncate text-[12px] text-zinc-500">{tn('count.tracks', a.track_count)}</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* ---------- playlists ---------- */
          <div>
            <div className="mb-4 flex items-center gap-2">
              {creating ? (
                <div className="flex items-center gap-2">
                  <input
                    ref={newRef}
                    autoFocus
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') createPlaylist()
                      if (e.key === 'Escape') { setCreating(false); setNewName('') }
                    }}
                    placeholder={t('music.playlistNamePh')}
                    className="h-9 w-56 rounded-lg border border-edge bg-field px-3 text-[13px] text-zinc-200 outline-none focus:border-accent"
                  />
                  <button onClick={createPlaylist} className="btn-accent">{t('common.add')}</button>
                </div>
              ) : (
                <button onClick={() => setCreating(true)} className="btn-outline h-9">
                  <Plus size={16} /> {t('music.createPlaylist')}
                </button>
              )}
            </div>
            {playlists.length === 0 ? (
              <EmptyState icon={ListMusic} title={t('music.tabPlaylists')} subtitle={t('music.noPlaylists')} />
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {playlists.map((pl) => (
                  <div key={pl.id} className="group relative rounded-xl p-3 transition-colors hover:bg-highlight">
                    <div className="relative mb-3 flex aspect-square w-full cursor-pointer items-center justify-center overflow-hidden rounded-xl" style={{ background: gradientFor(pl.name) }} onClick={() => setDetail({ kind: 'playlist', playlist: pl })}>
                      <ListMusic size={34} className="text-[#fff]/85" />
                      {(pl.track_count ?? 0) > 0 && <PlayFab onClick={() => playPlaylistNow(pl)} />}
                    </div>
                    <div className="cursor-pointer" onClick={() => setDetail({ kind: 'playlist', playlist: pl })}>
                      <div className="truncate text-[13px] font-semibold text-zinc-100">{pl.name}</div>
                      <div className="truncate text-[12px] text-zinc-500">{tn('count.tracks', pl.track_count ?? 0)}</div>
                    </div>
                    <button
                      onClick={() => window.wist.music.deletePlaylist(pl.id)}
                      className="absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-lg bg-black/40 text-zinc-300 opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
