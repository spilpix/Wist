import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Archive,
  ArrowDownAZ,
  ArrowUpAZ,
  ExternalLink,
  File as FileIcon,
  FileText,
  FileVideo,
  Film,
  Folder,
  Image as ImageIcon,
  LayoutGrid,
  Library as LibraryIcon,
  List,
  Music as MusicIcon,
  Music2,
  Plus,
  Search,
  Trash2,
} from 'lucide-react'
import AddTitleModal from '../components/AddTitleModal'
import TitleCard from '../components/TitleCard'
import TitleRow from '../components/TitleRow'
import EmptyState from '../components/ui/EmptyState'
import Spinner from '../components/ui/Spinner'
import { useLibraryStore } from '../store/libraryStore'
import {
  STATUS_COLORS,
  TITLE_STATUSES,
  TITLE_TYPES,
  type MusicService,
  type Playlist,
  type Title,
  type TitleFilters,
  type TitleStatus,
  type TitleType,
  type VaultFile,
  type VaultKind,
} from '../types/models'
import { useI18n, type TKey } from '../i18n'

const SORTS = ['date_added', 'title', 'rating', 'progress', 'last_watched'] as const
type LibTab = 'videos' | 'music' | 'files'

const TABS: Array<{ id: LibTab; key: TKey; icon: typeof Film }> = [
  { id: 'videos', key: 'lib.tabVideos', icon: Film },
  { id: 'music', key: 'lib.tabMusic', icon: Music2 },
  { id: 'files', key: 'lib.tabFiles', icon: Archive },
]

const SERVICE_META: Record<MusicService, { label: string; color: string }> = {
  spotify: { label: 'Spotify', color: '#1db954' },
  youtube: { label: 'YouTube', color: '#ff0033' },
  yandex: { label: 'Яндекс', color: '#ffcc00' },
  soundcloud: { label: 'SoundCloud', color: '#ff5500' },
  apple: { label: 'Apple Music', color: '#fa57c1' },
  other: { label: 'Link', color: '#d4813a' },
}

const KIND_ICON: Record<VaultKind, typeof FileIcon> = {
  image: ImageIcon,
  video: FileVideo,
  audio: MusicIcon,
  doc: FileText,
  archive: Archive,
  other: FileIcon,
}

function formatBytes(n: number): string {
  if (!n) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  let v = n
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${units[i]}`
}

export default function Library() {
  const { t } = useI18n()
  const { titles, loading, filters, view, setFilters, setView, load } = useLibraryStore()
  const [searchParams, setSearchParams] = useSearchParams()
  const [showAdd, setShowAdd] = useState(false)

  const tab = (searchParams.get('tab') as LibTab) || 'videos'
  const setTab = (id: LibTab) => {
    const next = new URLSearchParams(searchParams)
    if (id === 'videos') next.delete('tab')
    else next.set('tab', id)
    setSearchParams(next, { replace: true })
  }

  // command palette deep link: /library?add=1 opens the add-title modal
  useEffect(() => {
    if (searchParams.get('add') === '1') {
      setShowAdd(true)
      searchParams.delete('add')
      setSearchParams(searchParams, { replace: true })
    }
  }, [searchParams, setSearchParams])
  const [genres, setGenres] = useState<string[]>([])
  const [years, setYears] = useState<number[]>([])

  // sidebar links set ?status= (My Lists) and ?type= (Books)
  useEffect(() => {
    const status = (searchParams.get('status') as TitleStatus | null) ?? 'all'
    const type = (searchParams.get('type') as TitleType | null) ?? 'all'
    setFilters({ status, type })
  }, [searchParams]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    window.wist.titles.genres().then(setGenres)
    window.wist.titles.years().then(setYears)
  }, [titles.length])

  const heading = useMemo(() => {
    if (searchParams.get('type') === 'book') return t('nav.books')
    const status = searchParams.get('status') as TitleStatus | null
    return status && TITLE_STATUSES.includes(status) ? t(`status.${status}`) : t('nav.library')
  }, [searchParams, t])

  return (
    <div className="page">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="page-title !mb-0">{heading}</h1>
        {tab === 'videos' && (
          <button className="btn-accent" onClick={() => setShowAdd(true)}>
            <Plus size={16} /> {t('lib.addTitle')}
          </button>
        )}
      </div>

      {/* YouTube-style category chips */}
      <div className="no-scrollbar mb-6 flex gap-2 overflow-x-auto">
        {TABS.map(({ id, key, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
              tab === id
                ? 'bg-accent text-[#fff]'
                : 'bg-raised text-zinc-400 hover:bg-edge hover:text-zinc-200'
            }`}
          >
            <Icon size={14} />
            {t(key)}
          </button>
        ))}
      </div>

      {tab === 'videos' && (
        <VideosTab
          titles={titles}
          loading={loading}
          filters={filters}
          view={view}
          setFilters={setFilters}
          setView={setView}
          genres={genres}
          years={years}
          onAdd={() => setShowAdd(true)}
          t={t}
        />
      )}
      {tab === 'music' && <MusicTab t={t} />}
      {tab === 'files' && <FilesTab t={t} />}

      {showAdd && <AddTitleModal onClose={() => setShowAdd(false)} onSaved={() => load()} />}
    </div>
  )
}

// ---------------- Videos tab (the original library grid) ----------------
type TFn = (key: TKey, params?: Record<string, string | number>) => string

interface VideosProps {
  titles: Title[]
  loading: boolean
  filters: TitleFilters
  view: 'grid' | 'list'
  setFilters: (patch: Partial<TitleFilters>) => void
  setView: (view: 'grid' | 'list') => void
  genres: string[]
  years: number[]
  onAdd: () => void
  t: TFn
}

function VideosTab({ titles, loading, filters, view, setFilters, setView, genres, years, onAdd, t }: VideosProps) {
  return (
    <>
      {/* status chips — the sidebar "My Lists" moved here (Видео tab) */}
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        <button
          onClick={() => setFilters({ status: 'all' })}
          className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
            !filters.status || filters.status === 'all'
              ? 'border-accent/50 bg-accent/15 text-accent-bright'
              : 'border-edge bg-surface text-zinc-400 hover:text-zinc-200'
          }`}
        >
          {t('common.all')}
        </button>
        {TITLE_STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setFilters({ status: filters.status === s ? 'all' : s })}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              filters.status === s
                ? 'border-accent/50 bg-accent/15 text-accent-bright'
                : 'border-edge bg-surface text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: STATUS_COLORS[s] }} />
            {t(`status.${s}`)}
          </button>
        ))}
      </div>

      {/* filter bar */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
          <input
            className="input !w-56 !pl-8"
            placeholder={t('lib.search')}
            value={filters.search ?? ''}
            onChange={(e) => setFilters({ search: e.target.value || undefined })}
          />
        </div>
        <select className="select" value={filters.type ?? 'all'} onChange={(e) => setFilters({ type: e.target.value as TitleType | 'all' })}>
          <option value="all">{t('lib.allTypes')}</option>
          {TITLE_TYPES.map((v) => (
            <option key={v} value={v}>{t(`type.${v}`)}</option>
          ))}
        </select>
        <select className="select" value={filters.genre ?? ''} onChange={(e) => setFilters({ genre: e.target.value || undefined })}>
          <option value="">{t('lib.allGenres')}</option>
          {genres.map((g) => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>
        <select
          className="select"
          value={filters.year ?? ''}
          onChange={(e) => setFilters({ year: e.target.value ? parseInt(e.target.value, 10) : undefined })}
        >
          <option value="">{t('lib.anyYear')}</option>
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <select
          className="select"
          value={filters.minRating ?? ''}
          onChange={(e) => setFilters({ minRating: e.target.value ? parseInt(e.target.value, 10) : undefined })}
        >
          <option value="">{t('lib.anyRating')}</option>
          {[9, 8, 7, 6, 5].map((r) => (
            <option key={r} value={r}>{t('lib.ratingPlus', { n: r })}</option>
          ))}
        </select>

        <div className="ml-auto flex items-center gap-2">
          <select className="select" value={filters.sort} onChange={(e) => setFilters({ sort: e.target.value as typeof filters.sort })}>
            {SORTS.map((s) => (
              <option key={s} value={s}>{t(`lib.sort.${s}`)}</option>
            ))}
          </select>
          <button
            className="btn-ghost !px-2.5"
            title={t('lib.sortDir')}
            onClick={() => setFilters({ sortDir: filters.sortDir === 'asc' ? 'desc' : 'asc' })}
          >
            {filters.sortDir === 'asc' ? <ArrowUpAZ size={15} /> : <ArrowDownAZ size={15} />}
          </button>
          <div className="flex overflow-hidden rounded-lg border border-edge">
            <button
              className={`p-2 transition-colors ${view === 'grid' ? 'bg-accent/20 text-accent-bright' : 'text-zinc-500 hover:text-zinc-300'}`}
              onClick={() => setView('grid')}
            >
              <LayoutGrid size={15} />
            </button>
            <button
              className={`p-2 transition-colors ${view === 'list' ? 'bg-accent/20 text-accent-bright' : 'text-zinc-500 hover:text-zinc-300'}`}
              onClick={() => setView('list')}
            >
              <List size={15} />
            </button>
          </div>
        </div>
      </div>

      {loading && !titles.length ? (
        <Spinner />
      ) : !titles.length ? (
        <EmptyState
          icon={LibraryIcon}
          title={t('lib.emptyTitle')}
          subtitle={t('lib.emptySubtitle')}
          action={
            <button className="btn-accent" onClick={onAdd}>
              <Plus size={16} /> {t('lib.addFirst')}
            </button>
          }
        />
      ) : view === 'grid' ? (
        <div className="grid grid-cols-3 gap-x-5 gap-y-7 lg:grid-cols-4 xl:grid-cols-5">
          {titles.map((title) => (
            <TitleCard key={title.id} title={title} />
          ))}
        </div>
      ) : (
        <div className="space-y-1">
          {titles.map((title) => (
            <TitleRow key={title.id} title={title} />
          ))}
        </div>
      )}
    </>
  )
}

// ---------------- Music tab ----------------
function MusicTab({ t }: { t: TFn }) {
  const [playlists, setPlaylists] = useState<Playlist[] | null>(null)
  const load = useCallback(() => window.wist.playlists.list().then(setPlaylists), [])
  useEffect(() => {
    load()
  }, [load])

  if (!playlists) return <Spinner />
  if (!playlists.length) {
    return <EmptyState icon={MusicIcon} title={t('lib.musicEmpty')} subtitle={t('lib.musicEmptySub')} />
  }

  return (
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
  )
}

// ---------------- Files tab ----------------
function FilesTab({ t }: { t: TFn }) {
  const navigate = useNavigate()
  const [files, setFiles] = useState<VaultFile[] | null>(null)
  const load = useCallback(() => window.wist.vault.list().then(setFiles), [])
  useEffect(() => {
    load()
  }, [load])

  const addFiles = async () => {
    const n = await window.wist.vault.pickAndAdd()
    if (n > 0) load()
  }

  if (!files) return <Spinner />

  return (
    <>
      <div className="mb-5 flex justify-end">
        <button className="btn-ghost" onClick={addFiles}>
          <Plus size={15} /> {t('vault.add')}
        </button>
      </div>
      {!files.length ? (
        <EmptyState icon={Archive} title={t('lib.filesEmpty')} subtitle={t('lib.filesEmptySub')} />
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4">
          {files.map((f) => {
            const isFolder = f.kind === 'folder' || f.kind === 'diskfolder'
            const Icon = isFolder ? Folder : KIND_ICON[f.kind as VaultKind] ?? FileIcon
            return (
              <div key={f.id} className="group flex items-center gap-3 rounded-xl border border-edge/50 bg-surface p-3 transition-colors hover:border-edge">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-raised text-accent-bright">
                  <Icon size={20} />
                </span>
                <button onClick={() => (isFolder ? navigate('/vault') : window.wist.vault.open(f.path))} className="min-w-0 flex-1 text-left">
                  <div className="truncate text-[13px] font-medium text-zinc-200 group-hover:text-white">{f.name}</div>
                  <div className="text-xs text-zinc-500">{isFolder ? t('nav.vault') : formatBytes(f.size)}</div>
                </button>
                <button
                  className="shrink-0 text-zinc-600 opacity-0 transition-all hover:text-red-400 group-hover:opacity-100"
                  onClick={async () => {
                    await window.wist.vault.remove(f.id)
                    load()
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
