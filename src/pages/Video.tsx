import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ChevronLeft,
  ChevronRight,
  Film,
  FolderPlus,
  Info,
  Play,
  RefreshCw,
  Search,
  Sliders,
  Star,
} from 'lucide-react'
import CoverImage from '../components/CoverImage'
import Chip from '../components/ui/Chip'
import EmptyState from '../components/ui/EmptyState'
import PageHeader from '../components/ui/PageHeader'
import { SkeletonTiles } from '../components/ui/Skeleton'
import Tooltip from '../components/ui/Tooltip'
import { toast } from '../store/toastStore'
import { useSettingsStore } from '../store/settingsStore'
import { parseFilename, similarity } from '../utils/filenameParser'
import {
  TITLE_TYPES,
  type ContinueItem,
  type ParsedFile,
  type Title,
  type TitleType,
} from '../types/models'
import { useI18n } from '../i18n'

// ─────────────────────────────────────────────────────────────────────────────
// Auto-import: group freshly-scanned files into titles + episodes with no manual
// mapping step (the "Netflix" one-click ingest). Single file → movie, many → series.
// ─────────────────────────────────────────────────────────────────────────────
function autoGroups(files: ParsedFile[], library: Title[]) {
  const byTitle = new Map<string, ParsedFile[]>()
  for (const f of files) {
    const key = f.parsedTitle.toLowerCase()
    if (!byTitle.has(key)) byTitle.set(key, [])
    byTitle.get(key)!.push(f)
  }
  return [...byTitle.values()].map((group) => {
    const suggested = group[0].parsedTitle
    let best: Title | null = null
    let bestScore = 0
    for (const tt of library) {
      const s = Math.max(similarity(suggested, tt.title), similarity(suggested, tt.original_title ?? ''))
      if (s > bestScore) {
        bestScore = s
        best = tt
      }
    }
    const sorted = [...group].sort((a, b) => (a.episode ?? 0) - (b.episode ?? 0))
    const matched = best && bestScore >= 0.6 ? best : null
    return {
      titleId: matched?.id,
      newTitle: matched ? undefined : { title: suggested, type: (sorted.length > 1 ? 'series' : 'movie') as TitleType },
      episodes: sorted.map((f) => ({ path: f.path, episode: f.episode, season: f.season })),
    }
  })
}

export default function Video() {
  const { t, tn } = useI18n()
  const navigate = useNavigate()
  const [titles, setTitles] = useState<Title[] | null>(null)
  const [continueItems, setContinueItems] = useState<ContinueItem[]>([])
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<TitleType | 'all'>('all')
  const [scanning, setScanning] = useState(false)

  const mediaFolders = useSettingsStore((s) => s.settings?.mediaFolders ?? [])
  const updateSettings = useSettingsStore((s) => s.update)

  const load = useCallback(async () => {
    try {
      const [tl, ci] = await Promise.all([
        window.wist.titles.list({ sort: 'date_added', sortDir: 'desc' }),
        window.wist.episodes.continueWatching(),
      ])
      setTitles(tl)
      setContinueItems(ci)
    } catch (e) {
      console.error('video load failed', e)
      setTitles((prev) => prev ?? [])
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // ── ingest ────────────────────────────────────────────────────────────────
  const importPaths = useCallback(
    async (paths: string[]): Promise<number> => {
      const lib = await window.wist.titles.list({})
      const existing = await window.wist.files.existingPaths()
      const known = new Set(existing.map((p) => p.toLowerCase()))
      const fresh = paths.filter((p) => !known.has(p.toLowerCase()))
      if (!fresh.length) return 0
      const groups = autoGroups(fresh.map(parseFilename), lib)
      const res = await window.wist.files.importEpisodes(groups)
      return res.createdEpisodes
    },
    []
  )

  const addFolder = async () => {
    setScanning(true)
    try {
      const folder = await window.wist.files.pickFolder()
      if (!folder) return
      if (!mediaFolders.includes(folder)) await updateSettings({ mediaFolders: [...mediaFolders, folder] })
      const vids = await window.wist.files.listVideosInFolder(folder)
      const added = await importPaths(vids)
      toast(added ? t('video.importedN', { n: added }) : t('video.nothingNew'), added ? 'success' : 'info')
      if (added) await load()
    } catch (e) {
      toast(String(e), 'error')
    } finally {
      setScanning(false)
    }
  }

  const scan = async () => {
    setScanning(true)
    try {
      const vids = await window.wist.files.scanMediaFolders()
      const added = await importPaths(vids)
      toast(added ? t('video.importedN', { n: added }) : t('video.nothingNew'), added ? 'success' : 'info')
      if (added) await load()
    } catch (e) {
      toast(String(e), 'error')
    } finally {
      setScanning(false)
    }
  }

  // ── playback helpers ────────────────────────────────────────────────────────
  const playTitle = useCallback(
    async (titleId: number) => {
      try {
        const eps = await window.wist.episodes.listByTitle(titleId)
        const local = eps.filter((e) => e.file_path && !e.file_path.startsWith('http'))
        const next = local.find((e) => !e.watched) ?? local[0]
        if (next) navigate(`/player/${next.id}`)
        else navigate(`/title/${titleId}`)
      } catch {
        navigate(`/title/${titleId}`)
      }
    },
    [navigate]
  )
  const openTitle = useCallback((id: number) => navigate(`/title/${id}`), [navigate])

  // ── derived collections ─────────────────────────────────────────────────────
  const videos = useMemo(() => (titles ?? []).filter((x) => x.type !== 'book'), [titles])
  const continueVideos = useMemo(() => continueItems.filter((c) => c.title_type !== 'book'), [continueItems])

  // titleId → resume progress (0..1), so posters of in-progress shows get a bar too
  const progressByTitle = useMemo(() => {
    const m = new Map<number, number>()
    for (const c of continueVideos) {
      const p = c.duration_seconds ? Math.min(1, c.watch_position_seconds / c.duration_seconds) : 0
      if (p > 0) m.set(c.title_id, Math.max(m.get(c.title_id) ?? 0, p))
    }
    return m
  }, [continueVideos])

  const presentTypes = useMemo(
    () => TITLE_TYPES.filter((ty) => ty !== 'book' && videos.some((v) => v.type === ty)),
    [videos]
  )

  const featured = useMemo(() => {
    const ci = continueVideos[0]
    if (ci) {
      const tt = videos.find((v) => v.id === ci.title_id)
      if (tt) {
        const progress = ci.duration_seconds ? Math.min(1, ci.watch_position_seconds / ci.duration_seconds) : 0
        return { title: tt, resumeEpId: ci.id, episodeLabel: t('home.episodeN', { n: ci.episode_number }), progress, resume: true as const }
      }
    }
    const rated = videos.filter((v) => v.rating != null).sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
    const pick = rated[0] ?? videos[0]
    return pick ? { title: pick, resume: false as const } : null
  }, [videos, continueVideos, t])

  const topGenres = useMemo(() => {
    const counts = new Map<string, number>()
    for (const v of videos) for (const g of v.genres) counts.set(g, (counts.get(g) ?? 0) + 1)
    return [...counts.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([g]) => g)
  }, [videos])

  const q = query.trim().toLowerCase()
  const searchResults = useMemo(() => {
    if (!q) return []
    return videos.filter((v) => `${v.title} ${v.original_title ?? ''} ${v.genres.join(' ')}`.toLowerCase().includes(q))
  }, [videos, q])

  if (!titles)
    return (
      <div className="page">
        <SkeletonTiles count={12} className="grid grid-cols-3 gap-x-3 gap-y-6 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7" />
      </div>
    )

  // ── header: search + import controls (Notion/Library toolbar idiom) ──────────
  const headerActions = (
    <>
      <div className="relative">
        <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('video.searchPh')}
          className="h-9 w-56 rounded-lg border border-edge bg-field pl-8 pr-3 text-[13px] text-zinc-200 outline-none transition-all placeholder:text-zinc-500 focus:border-accent"
        />
      </div>
      <Tooltip label={t('video.manualImport')} side="bottom">
        <button onClick={() => navigate('/local')} className="btn-ghost !h-9 !w-9 !px-0">
          <Sliders size={16} />
        </button>
      </Tooltip>
      <Tooltip label={t('video.scan')} side="bottom">
        <button onClick={scan} disabled={scanning} className="btn-ghost !h-9 !w-9 !px-0">
          <RefreshCw size={16} className={scanning ? 'animate-spin' : ''} />
        </button>
      </Tooltip>
      <button onClick={addFolder} disabled={scanning} className="btn-accent h-9">
        <FolderPlus size={16} /> {t('video.addFolder')}
      </button>
    </>
  )

  const typeChips =
    videos.length > 0 && !q && presentTypes.length > 0 ? (
      <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto">
        <Chip active={typeFilter === 'all'} onClick={() => setTypeFilter('all')}>
          {t('common.all')}
        </Chip>
        {presentTypes.map((ty) => (
          <Chip key={ty} active={typeFilter === ty} onClick={() => setTypeFilter(ty)}>
            {t(`type.${ty}`)}
          </Chip>
        ))}
      </div>
    ) : undefined

  return (
    <div className="page">
      <PageHeader
        icon={Film}
        title={t('video.title')}
        subtitle={videos.length > 0 ? tn('count.titles', videos.length) : undefined}
        actions={headerActions}
      >
        {typeChips}
      </PageHeader>

      {videos.length === 0 ? (
        <EmptyState
          icon={Film}
          title={t('video.emptyTitle')}
          subtitle={t('video.emptySub')}
          action={
            <div className="flex items-center gap-2">
              <button onClick={addFolder} disabled={scanning} className="btn-accent">
                <FolderPlus size={16} /> {t('video.addFolder')}
              </button>
              {mediaFolders.length > 0 && (
                <button onClick={scan} disabled={scanning} className="btn-ghost">
                  <RefreshCw size={16} className={scanning ? 'animate-spin' : ''} /> {t('video.scan')}
                </button>
              )}
            </div>
          }
        />
      ) : q ? (
        // ── search results ──
        searchResults.length === 0 ? (
          <EmptyState icon={Search} title={t('video.noResults')} subtitle={t('video.noResultsSub')} />
        ) : (
          <>
            <h2 className="section-title">{tn('count.titles', searchResults.length)}</h2>
            <PosterGrid items={searchResults} progressByTitle={progressByTitle} onOpen={openTitle} onPlay={playTitle} />
          </>
        )
      ) : typeFilter !== 'all' ? (
        // ── single type, poster grid ──
        <PosterGrid
          items={videos.filter((v) => v.type === typeFilter)}
          progressByTitle={progressByTitle}
          onOpen={openTitle}
          onPlay={playTitle}
        />
      ) : (
        // ── the cinematic browse: billboard + rails ──
        <>
          {featured && (
            <Billboard
              title={featured.title}
              kicker={featured.resume ? t('home.continueWatching') : t('video.featured')}
              episodeLabel={featured.resume ? featured.episodeLabel : undefined}
              progress={featured.resume ? featured.progress : undefined}
              playLabel={featured.resume ? t('lib.resume') : t('video.play')}
              onPlay={() => (featured.resume ? navigate(`/player/${featured.resumeEpId}`) : playTitle(featured.title.id))}
              onInfo={() => openTitle(featured.title.id)}
              t={t}
            />
          )}

          {continueVideos.length > 0 && (
            <Rail title={t('home.continueWatching')}>
              {continueVideos.map((c) => (
                <div key={c.id} className="w-[260px] shrink-0">
                  <ContinueCard item={c} onResume={() => navigate(`/player/${c.id}`)} t={t} />
                </div>
              ))}
            </Rail>
          )}

          <RailOf title={t('video.recentlyAdded')} items={videos.slice(0, 24)} {...{ progressByTitle, onOpen: openTitle, onPlay: playTitle }} />
          <RailOf title={t('video.myList')} items={videos.filter((v) => v.status === 'planned')} {...{ progressByTitle, onOpen: openTitle, onPlay: playTitle }} />
          <RailOf
            title={t('video.topRated')}
            items={videos.filter((v) => (v.rating ?? 0) >= 8).sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))}
            {...{ progressByTitle, onOpen: openTitle, onPlay: playTitle }}
          />
          {topGenres.map((g) => (
            <RailOf
              key={g}
              title={g}
              items={videos.filter((v) => v.genres.includes(g))}
              {...{ progressByTitle, onOpen: openTitle, onPlay: playTitle }}
            />
          ))}
        </>
      )}
    </div>
  )
}

// ───────────────────────────── building blocks ──────────────────────────────

type PlayHandlers = {
  progressByTitle: Map<number, number>
  onOpen: (id: number) => void
  onPlay: (id: number) => void
}

function RailOf({ title, items, ...h }: { title: string; items: Title[] } & PlayHandlers) {
  if (!items.length) return null
  return (
    <Rail title={title}>
      {items.map((tt) => (
        <div key={tt.id} className="w-[152px] shrink-0">
          <PosterCard title={tt} progress={h.progressByTitle.get(tt.id) ?? 0} onOpen={() => h.onOpen(tt.id)} onPlay={() => h.onPlay(tt.id)} />
        </div>
      ))}
    </Rail>
  )
}

function PosterGrid({ items, ...h }: { items: Title[] } & PlayHandlers) {
  return (
    <div className="grid grid-cols-3 gap-x-3 gap-y-6 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
      {items.map((tt) => (
        <PosterCard key={tt.id} title={tt} progress={h.progressByTitle.get(tt.id) ?? 0} onOpen={() => h.onOpen(tt.id)} onPlay={() => h.onPlay(tt.id)} />
      ))}
    </div>
  )
}

function Rail({ title, children }: { title: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const by = (d: number) => ref.current?.scrollBy({ left: d, behavior: 'smooth' })
  return (
    <section className="group/rail relative mb-9">
      <h2 className="section-title">{title}</h2>
      <button
        onClick={() => by(-640)}
        style={{ boxShadow: 'var(--float-shadow)' }}
        className="absolute left-[-14px] top-[calc(50%+10px)] z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg border border-edge bg-card text-zinc-300 opacity-0 transition-opacity hover:text-white group-hover/rail:opacity-100"
      >
        <ChevronLeft size={18} />
      </button>
      <div ref={ref} className="no-scrollbar flex gap-3 overflow-x-auto pb-1">
        {children}
      </div>
      <button
        onClick={() => by(640)}
        style={{ boxShadow: 'var(--float-shadow)' }}
        className="absolute right-[-14px] top-[calc(50%+10px)] z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg border border-edge bg-card text-zinc-300 opacity-0 transition-opacity hover:text-white group-hover/rail:opacity-100"
      >
        <ChevronRight size={18} />
      </button>
    </section>
  )
}

function PosterCard({ title, progress, onOpen, onPlay }: { title: Title; progress: number; onOpen: () => void; onPlay: () => void }) {
  return (
    <div className="group/card w-full">
      <button
        onClick={onOpen}
        style={{ boxShadow: 'var(--card-shadow)' }}
        className="relative block aspect-[2/3] w-full overflow-hidden rounded-xl border border-edge bg-raised transition-transform duration-200 group-hover/card:-translate-y-1"
      >
        <CoverImage coverPath={title.cover_path} title={title.title} type={title.type} className="h-full w-full transition-transform duration-300 group-hover/card:scale-105" iconSize={30} />
        {title.rating != null && (
          <span className="absolute left-1.5 top-1.5 flex items-center gap-0.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-[#fff]">
            <Star size={9} className="fill-[var(--c-yellow-text)] text-[var(--c-yellow-text)]" /> {title.rating}
          </span>
        )}
        <span
          onClick={(e) => {
            e.stopPropagation()
            onPlay()
          }}
          style={{ boxShadow: 'var(--float-shadow)' }}
          className="absolute bottom-2 right-2 flex h-9 w-9 translate-y-1 items-center justify-center rounded-full bg-accent text-[#fff] opacity-0 transition-all duration-200 hover:scale-105 group-hover/card:translate-y-0 group-hover/card:opacity-100"
        >
          <Play size={16} className="fill-current pl-0.5" />
        </span>
        {progress > 0 && (
          <div className="absolute inset-x-0 bottom-0 h-1 bg-black/50">
            <div className="h-full bg-accent" style={{ width: `${progress * 100}%` }} />
          </div>
        )}
      </button>
      <div className="mt-1.5 truncate text-[12.5px] font-medium text-zinc-200">{title.title}</div>
      <div className="truncate text-[11px] text-zinc-500">{title.year ?? ' '}</div>
    </div>
  )
}

function ContinueCard({ item, onResume, t }: { item: ContinueItem; onResume: () => void; t: (k: any, p?: any) => string }) {
  const dur = item.duration_seconds ?? 0
  const progress = dur > 0 ? Math.min(1, item.watch_position_seconds / dur) : 0
  return (
    <div className="group/card w-full">
      <button
        onClick={onResume}
        style={{ boxShadow: 'var(--card-shadow)' }}
        className="relative block aspect-video w-full overflow-hidden rounded-xl border border-edge bg-raised"
      >
        <CoverImage coverPath={item.cover_path} title={item.title_name} type={item.title_type} className="h-full w-full transition-transform duration-300 group-hover/card:scale-105" iconSize={26} />
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity group-hover/card:opacity-100">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent text-[#fff]">
            <Play size={18} className="fill-current pl-0.5" />
          </span>
        </div>
        <div className="absolute inset-x-0 bottom-0 h-1 bg-black/50">
          <div className="h-full bg-accent" style={{ width: `${progress * 100}%` }} />
        </div>
      </button>
      <div className="mt-1.5 truncate text-[12.5px] font-medium text-zinc-200">{item.title_name}</div>
      <div className="truncate text-[11px] text-zinc-500">{t('home.episodeN', { n: item.episode_number })}</div>
    </div>
  )
}

function Billboard({
  title,
  kicker,
  episodeLabel,
  progress,
  playLabel,
  onPlay,
  onInfo,
  t,
}: {
  title: Title
  kicker: string
  episodeLabel?: string
  progress?: number
  playLabel: string
  onPlay: () => void
  onInfo: () => void
  t: (k: any, p?: any) => string
}) {
  const meta = [
    title.year,
    t(`type.${title.type}`),
    title.rating != null ? `★ ${title.rating}` : null,
    (title.episode_count ?? 0) > 1 ? t('video.episodeCount', { n: title.episode_count ?? 0 }) : null,
  ].filter(Boolean)

  return (
    <div className="force-dark relative mb-9 h-[360px] w-full overflow-hidden rounded-2xl border border-edge bg-black">
      {/* blurred backdrop fill from the poster */}
      <CoverImage coverPath={title.cover_path} title={title.title} type={title.type} className="absolute inset-0 h-full w-full scale-110 opacity-50 blur-2xl" iconSize={80} />
      <div className="absolute inset-0 bg-gradient-to-r from-black/92 via-black/65 to-black/25" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-transparent" />

      <div className="relative flex h-full items-center gap-7 p-8">
        {/* sharp poster */}
        <button
          onClick={onInfo}
          style={{ boxShadow: 'var(--float-shadow)' }}
          className="hidden h-[296px] w-[198px] shrink-0 overflow-hidden rounded-xl ring-1 ring-white/10 transition-transform hover:scale-[1.02] sm:block"
        >
          <CoverImage coverPath={title.cover_path} title={title.title} type={title.type} className="h-full w-full" iconSize={48} />
        </button>

        <div className="min-w-0 max-w-xl">
          <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-400">{kicker}</span>
          <h2 className="mt-1 line-clamp-2 text-[2.4rem] font-bold leading-tight text-white">{title.title}</h2>
          <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-zinc-300">
            {episodeLabel && <span className="text-zinc-200">{episodeLabel}</span>}
            {meta.map((m, i) => (
              <span key={i} className="flex items-center gap-2.5">
                {(i > 0 || episodeLabel) && <span className="text-zinc-600">·</span>}
                {m}
              </span>
            ))}
          </div>
          {title.notes && <p className="mt-3 line-clamp-3 max-w-lg text-[13px] leading-relaxed text-zinc-300/90">{title.notes}</p>}

          <div className="mt-5 flex items-center gap-2.5">
            <button onClick={onPlay} className="btn-accent h-11 !rounded-lg !px-5 !text-sm">
              <Play size={17} className="fill-current" /> {playLabel}
            </button>
            <button
              onClick={onInfo}
              className="flex h-11 items-center gap-2 rounded-lg bg-white/15 px-4 text-sm font-medium text-white backdrop-blur transition-transform hover:scale-[1.03] active:scale-[0.97]"
            >
              <Info size={17} /> {t('video.moreInfo')}
            </button>
          </div>

          {progress != null && progress > 0 && (
            <div className="mt-4 h-1 w-full max-w-md overflow-hidden rounded-full bg-white/20">
              <div className="h-full rounded-full bg-accent" style={{ width: `${progress * 100}%` }} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
