import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowDownAZ,
  ArrowLeft,
  ArrowUpAZ,
  BookOpen,
  Check,
  Eye,
  FileText,
  Film,
  Filter,
  Folder,
  FolderArchive,
  FolderPlus,
  Image as ImageIcon,
  LayoutGrid,
  Library as LibraryIcon,
  List,
  Music as MusicIcon,
  Music2,
  Network,
  Pencil,
  Play,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import AddTitleModal from '../components/AddTitleModal'
import TitleCard from '../components/TitleCard'
import TitleRow from '../components/TitleRow'
import CoverImage from '../components/CoverImage'
import EmptyState from '../components/ui/EmptyState'
import Chip from '../components/ui/Chip'
import Spinner from '../components/ui/Spinner'
import Modal from '../components/ui/Modal'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import { SkeletonTiles } from '../components/ui/Skeleton'
import Vault from './Vault'
import { dragHasMedia, readMediaDrag, setMediaDrag } from '../lib/mediaDrag'
import { useLibraryStore } from '../store/libraryStore'
import { usePlayerStore } from '../store/playerStore'
import { toast } from '../store/toastStore'
import {
  STATUS_COLORS,
  TITLE_STATUSES,
  TITLE_TYPES,
  type Collection,
  type CollectionItem,
  type CollectionItemKind,
  type ContinueItem,
  type LibrarySummary,
  type MusicService,
  type Playlist,
  type Title,
  type TitleFilters,
  type TitleStatus,
  type TitleType,
  type Track,
  type VaultFile,
} from '../types/models'
import { formatTimestamp } from '../utils/formatters'
import { useI18n, t as tGlobal, type TKey } from '../i18n'

const SORTS = ['date_added', 'title', 'rating', 'progress', 'last_watched'] as const
type Cat = 'videos' | 'books' | 'documents' | 'music' | 'images' | 'files'
type TFn = (key: TKey, params?: Record<string, string | number>) => string

// the five top-level "folders" of the unified Library hub
const CATS: Array<{ id: Cat; key: TKey; icon: typeof Film }> = [
  { id: 'videos', key: 'lib.cat.videos', icon: Film },
  { id: 'books', key: 'lib.cat.books', icon: BookOpen },
  { id: 'documents', key: 'lib.cat.documents', icon: FileText },
  { id: 'music', key: 'lib.cat.music', icon: Music2 },
  { id: 'images', key: 'lib.cat.images', icon: ImageIcon },
  { id: 'files', key: 'lib.cat.files', icon: FolderArchive },
]

// each category's signature colour — cover-less items in a folder preview render as a
// vivid app-icon tile (white glyph on this hue) instead of a flat grey icon
const CAT_TINT: Record<Cat, string> = {
  videos: '#EF5C4C', // coral
  books: '#E9A23B', // amber
  documents: '#14B8A6', // teal
  music: '#3B82F6', // blue (matches the iOS-style note the user showed)
  images: '#34A853', // green
  files: '#8B5CF6', // violet
}

const SERVICE_META: Record<MusicService, { label: string; color: string }> = {
  spotify: { label: 'Spotify', color: '#1db954' },
  youtube: { label: 'YouTube', color: '#ff0033' },
  yandex: { label: 'Яндекс', color: '#ffcc00' },
  soundcloud: { label: 'SoundCloud', color: '#ff5500' },
  apple: { label: 'Apple Music', color: '#fa57c1' },
  other: { label: 'Link', color: '#2383e1' },
}

// folder accent swatches (Notion-ish) offered when creating/editing a collection
const FOLDER_COLORS = ['#2383E1', '#E0533D', '#E9A23B', '#3F9E69', '#9A6DD7', '#E1559E', '#6B7280']

// fallback icon for a collection item that has no cover, by entity kind
const KIND_ICON: Record<string, typeof Film> = {
  title: Film,
  vault: FileText,
  playlist: Music2,
  track: Music2,
  note: FileText,
  canvas: ImageIcon,
}

// a cover thumbnail, or a kind-appropriate icon box when the entity has no cover
function ItemThumb({ cover, kind, className = '', iconSize = 20 }: { cover: string | null; kind: string; className?: string; iconSize?: number }) {
  if (cover) {
    return <img src={window.wist.media.fileUrl(cover)} alt="" loading="lazy" className={`object-cover ${className}`} draggable={false} />
  }
  const Icon = KIND_ICON[kind] ?? Film
  return (
    <div className={`flex items-center justify-center bg-raised ${className}`}>
      <Icon size={iconSize} className="text-zinc-500" />
    </div>
  )
}

export default function Library() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const { titles, loading, filters, view, setFilters, setView, load } = useLibraryStore()
  const [searchParams, setSearchParams] = useSearchParams()
  const [showAdd, setShowAdd] = useState(false)
  const [genres, setGenres] = useState<string[]>([])
  const [years, setYears] = useState<number[]>([])
  const [continueItems, setContinueItems] = useState<ContinueItem[]>([])

  // resolve the active category — back-compat with old ?type=book / ?tab=music / ?status= deep links
  const rawCat = searchParams.get('cat')
  const typeBook = searchParams.get('type') === 'book'
  const legacyMusic = searchParams.get('tab') === 'music'
  const legacyFiles = searchParams.get('tab') === 'files'
  const hasMediaFilter = !!searchParams.get('status') || (!!searchParams.get('type') && !typeBook)
  const cat: Cat | null =
    rawCat && CATS.some((c) => c.id === rawCat)
      ? (rawCat as Cat)
      : typeBook
        ? 'books'
        : legacyMusic
          ? 'music'
          : legacyFiles
            ? 'files'
            : hasMediaFilter
              ? 'videos'
              : null

  // an open user folder (collection) is its own view, keyed by ?collection=<id>
  const collectionId = searchParams.get('collection')

  // every category opens IN-PLACE inside the hub (Мои файлы is a self-contained file
  // manager) — no bouncing off to the dedicated /video or /music app pages.
  const goCat = (c: Cat | null) => {
    const next = new URLSearchParams()
    if (c) next.set('cat', c)
    setSearchParams(next, { replace: false })
  }

  const goCollection = (id: number | null) => {
    const next = new URLSearchParams()
    if (id != null) next.set('collection', String(id))
    setSearchParams(next, { replace: false })
  }

  // command palette deep link: /library?add=1 opens the add-title modal
  useEffect(() => {
    if (searchParams.get('add') === '1') {
      setShowAdd(true)
      searchParams.delete('add')
      setSearchParams(searchParams, { replace: true })
    }
  }, [searchParams, setSearchParams])

  // keep the title store in sync with the active media category
  useEffect(() => {
    if (cat === 'books') setFilters({ type: 'book' })
    else if (cat === 'videos') setFilters({ type: (searchParams.get('type') as TitleType) || 'all' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cat])

  // The in-place Видео/Книги views read from the library store. setFilters above is a
  // no-op when the type is unchanged (e.g. opening Видео with the default type='all'),
  // so it can leave the store unloaded → the grid looks empty while the tile counts N.
  // Force a load whenever a media category is opened.
  useEffect(() => {
    if (cat === 'videos' || cat === 'books') load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cat])

  // seed status from a ?status= deep link once
  const seededStatus = useRef(false)
  useEffect(() => {
    if (seededStatus.current) return
    seededStatus.current = true
    const s = searchParams.get('status') as TitleStatus | null
    if (s && TITLE_STATUSES.includes(s)) setFilters({ status: s })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    window.wist.titles.genres().then(setGenres).catch(() => undefined)
    window.wist.titles.years().then(setYears).catch(() => undefined)
  }, [titles.length])

  useEffect(() => {
    window.wist.episodes.continueWatching().then(setContinueItems).catch(() => undefined)
  }, [])

  // ── an opened user folder (collection) ──────────────────────────────────────
  if (collectionId) {
    return (
      <div className="page">
        <div className="mx-auto max-w-6xl">
          <CollectionView id={Number(collectionId)} onBack={() => goCollection(null)} t={t} />
        </div>
      </div>
    )
  }

  // ── landing: the folder grid ────────────────────────────────────────────────
  if (!cat) {
    return (
      <div className="page">
        <div className="mx-auto max-w-6xl">
          <div className="mb-7 flex items-center justify-between gap-3">
            <h1 className="page-title !mb-0">{t('nav.library')}</h1>
            <div className="flex items-center gap-2">
              <button className="btn-ghost" onClick={() => navigate('/tree')} title={t('lib.graphHint')}>
                <Network size={16} /> {t('lib.graph')}
              </button>
              <AddMenu t={t} onAddTitle={() => setShowAdd(true)} onGoCat={goCat} onReload={load} />
            </div>
          </div>
          <Landing t={t} onOpen={goCat} onOpenCollection={goCollection} />
        </div>
        {showAdd && <AddTitleModal onClose={() => setShowAdd(false)} onSaved={() => load()} />}
      </div>
    )
  }

  const meta = CATS.find((c) => c.id === cat)!
  const isMedia = cat === 'videos' || cat === 'books'

  return (
    <div className="page">
      <div className="mx-auto max-w-6xl">
        {/* category header: back · title · add */}
        <div className="mb-6 flex items-center gap-3">
          <button className="btn-ghost !h-9 !w-9 !px-0" onClick={() => goCat(null)} title={t('nav.library')}>
            <ArrowLeft size={17} />
          </button>
          <h1 className="page-title !mb-0 flex items-center gap-2.5">
            <meta.icon size={22} className="text-zinc-400" />
            {t(meta.key)}
          </h1>
          {isMedia && (
            <button className="btn-accent ml-auto" onClick={() => setShowAdd(true)}>
              <Plus size={16} /> {t('common.add')}
            </button>
          )}
        </div>

        {isMedia && (
          <MediaView
            kind={cat as 'videos' | 'books'}
            titles={titles}
            loading={loading}
            filters={filters}
            view={view}
            setFilters={setFilters}
            setView={setView}
            genres={genres}
            years={years}
            continueItems={continueItems}
            onAdd={() => setShowAdd(true)}
            t={t}
          />
        )}
        {cat === 'music' && <MusicManager t={t} />}
        {cat === 'documents' && <Vault embedded kindFilter="doc" />}
        {cat === 'images' && <Vault embedded kindFilter="image" />}
        {cat === 'files' && <Vault embedded kindFilter="file" />}
      </div>

      {showAdd && <AddTitleModal onClose={() => setShowAdd(false)} onSaved={() => load()} />}
    </div>
  )
}

// ============ Landing (compact desktop-style "folder" grid) ============
function Landing({
  t,
  onOpen,
  onOpenCollection,
}: {
  t: TFn
  onOpen: (c: Cat) => void
  onOpenCollection: (id: number) => void
}) {
  const [summary, setSummary] = useState<LibrarySummary | null>(null)
  const [collections, setCollections] = useState<Collection[]>([])
  const [ready, setReady] = useState(false)
  const [showCreate, setShowCreate] = useState(false)

  // ONE authoritative roll-up of everything in Bard (counts + cover previews per
  // category), read straight from the DB — so the hub mirrors ALL content no matter
  // where it was added (music → Музыка, video → Видео, images, books, files …).
  const reload = useCallback(() => {
    Promise.all([
      window.wist.library.summary().catch(() => null),
      window.wist.collections.list().catch(() => [] as Collection[]),
    ])
      .then(([sum, cols]) => {
        if (sum) setSummary(sum)
        setCollections(cols)
        setReady(true)
      })
      .catch(() => setReady(true))
  }, [])

  useEffect(() => {
    reload()
  }, [reload])
  // keep the grid live: adding music/video/files or a new folder anywhere reflects here
  useEffect(
    () =>
      window.wist.events.onDataChanged((k) => {
        if (k === 'music' || k === 'titles' || k === 'collections' || k === 'all') reload()
      }),
    [reload]
  )

  const fileUrl = window.wist.media.fileUrl
  const coverImgs = (paths: string[]) =>
    paths.map((p, i) => <img key={i} src={fileUrl(p)} alt="" loading="lazy" className="h-full w-full object-cover" />)

  const counts: Record<Cat, number> = {
    videos: summary?.videos.count ?? 0,
    books: summary?.books.count ?? 0,
    documents: summary?.documents.count ?? 0,
    music: summary?.music.count ?? 0,
    images: summary?.images.count ?? 0,
    files: summary?.files.count ?? 0,
  }
  const previews: Record<Cat, React.ReactNode[]> = {
    videos: coverImgs(summary?.videos.covers ?? []),
    books: coverImgs(summary?.books.covers ?? []),
    documents: [],
    music: coverImgs(summary?.music.covers ?? []),
    images: coverImgs(summary?.images.covers ?? []),
    files: [],
  }

  if (!ready) return <SkeletonTiles count={6} />

  return (
    <>
      <h2 className="section-title">{t('lib.categories')}</h2>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
        {CATS.map((c) => (
          <FolderTile key={c.id} name={t(c.key)} icon={c.icon} previews={previews[c.id]} count={counts[c.id]} tint={CAT_TINT[c.id]} sub={t('lib.items', { n: counts[c.id] })} onClick={() => onOpen(c.id)} />
        ))}
      </div>

      <h2 className="section-title mt-9">{t('lib.myFolders')}</h2>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
        {collections.map((col) => (
          <CollectionFolderTile key={col.id} col={col} t={t} onOpen={() => onOpenCollection(col.id)} onChanged={reload} />
        ))}
        <FolderTile dashed name={t('lib.newFolder')} icon={Plus} onClick={() => setShowCreate(true)} />
      </div>

      {showCreate && (
        <FolderModal
          t={t}
          onClose={() => setShowCreate(false)}
          onSaved={(c) => {
            reload()
            if (c) onOpenCollection(c.id)
          }}
        />
      )}
    </>
  )
}

// the brief's compact app-folder. A NON-EMPTY folder always shows the Windows-style
// 2×2 contents grid — cover thumbnails where items have art, the category/type icon
// in any remaining cells (so e.g. 52 cover-less tracks still read as a full folder).
// Only a truly empty folder (count 0, no previews) shows a single centered icon.
function FolderTile({
  name,
  sub,
  count,
  icon: Icon,
  previews,
  color,
  tint,
  dashed,
  dropActive,
  onClick,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  name: string
  sub?: string
  count?: number
  icon: typeof Film
  previews?: React.ReactNode[]
  color?: string | null
  tint?: string | null // signature colour for cover-less content tiles
  dashed?: boolean
  dropActive?: boolean
  onClick: () => void
  onDragOver?: React.DragEventHandler
  onDragLeave?: React.DragEventHandler
  onDrop?: React.DragEventHandler
}) {
  const tiles = (previews ?? []).filter(Boolean).slice(0, 4)
  // how many of the 4 cells represent REAL items: covers first, then type-icon tiles,
  // capped at the actual item count (so 1 image fills 1 cell — never padded to 4) and at 4
  const itemN = count ?? tiles.length
  const shown = Math.min(Math.max(itemN, tiles.length), 4)
  const filled = shown > 0
  const cellTint = tint ?? color ?? null // colour for the app-icon placeholder cells
  return (
    <button
      onClick={onClick}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className="group flex flex-col items-center gap-2 rounded-2xl p-2 text-center outline-none transition-colors hover:bg-highlight"
    >
      <div
        className={`relative aspect-square w-full overflow-hidden rounded-2xl border bg-raised p-1.5 transition-all ${
          dashed ? 'border-dashed border-zinc-700' : 'border-edge'
        } ${dropActive ? '!border-accent ring-2 ring-accent/40' : ''}`}
      >
        {color && <div className="pointer-events-none absolute inset-0" style={{ backgroundColor: color, opacity: 0.16 }} />}
        <div className="relative h-full w-full">
          {!filled ? (
            <div className="flex h-full w-full items-center justify-center">
              <Icon size={30} strokeWidth={1.6} style={color ? { color } : undefined} className={color ? '' : 'text-zinc-500'} />
            </div>
          ) : (
            <div className="grid h-full w-full grid-cols-2 grid-rows-2 gap-1">
              {Array.from({ length: 4 }).map((_, i) => {
                const node = tiles[i]
                const isItem = i < shown // this cell stands for a real item
                // cover → its image; a real cover-less item → a vivid app-icon tile (white
                // glyph on the category hue); a cell beyond the item count → empty (no fake icon)
                return (
                  <div
                    key={i}
                    className="flex items-center justify-center overflow-hidden rounded-lg bg-card"
                    style={!node && isItem && cellTint ? { background: `linear-gradient(150deg, ${cellTint}, ${cellTint}cc)` } : undefined}
                  >
                    {node ??
                      (isItem ? (
                        <Icon
                          size={17}
                          strokeWidth={2}
                          className={cellTint ? 'text-white' : 'text-zinc-600'}
                          style={cellTint ? { filter: 'drop-shadow(0 1px 1px rgb(0 0 0 / 0.25))' } : undefined}
                        />
                      ) : null)}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
      <div className="w-full px-0.5">
        <div className="truncate text-[13px] font-medium text-zinc-200 group-hover:text-white">{name}</div>
        {sub && <div className="text-[11px] text-zinc-500">{sub}</div>}
      </div>
    </button>
  )
}

// a user folder on the landing — same tile, but it accepts dropped library items
function CollectionFolderTile({ col, onOpen, onChanged, t }: { col: Collection; onOpen: () => void; onChanged: () => void; t: TFn }) {
  const [over, setOver] = useState(false)
  const fileUrl = window.wist.media.fileUrl
  const previews = col.covers.map((c, i) => <img key={i} src={fileUrl(c)} alt="" loading="lazy" className="h-full w-full object-cover" />)

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setOver(false)
    const items = readMediaDrag(e)
    if (!items) return
    const refs = items.map((i) => i.ref).filter((r): r is { kind: string; id: number } => !!r && typeof r.id === 'number')
    if (!refs.length) return
    for (const r of refs) await window.wist.collections.addItem(col.id, r.kind, r.id)
    toast(t('lib.itemAddedTo', { name: col.name }), 'success')
    onChanged()
  }

  return (
    <FolderTile
      name={col.name}
      sub={t('lib.items', { n: col.item_count })}
      count={col.item_count}
      icon={Folder}
      color={col.color}
      previews={previews}
      dropActive={over}
      onClick={onOpen}
      onDragOver={(e) => {
        if (dragHasMedia(e)) {
          e.preventDefault()
          setOver(true)
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
    />
  )
}

// create / rename+recolor a folder (+ delete, in edit mode)
function FolderModal({
  initial,
  onClose,
  onSaved,
  onDeleted,
  t,
}: {
  initial?: Collection | null
  onClose: () => void
  onSaved: (c: Collection | null) => void
  onDeleted?: () => void
  t: TFn
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [color, setColor] = useState<string | null>(initial?.color ?? null)
  const [confirmDel, setConfirmDel] = useState(false)

  const save = async () => {
    const n = name.trim()
    if (!n) return
    const c = initial
      ? await window.wist.collections.update(initial.id, { name: n, color })
      : await window.wist.collections.create({ name: n, color })
    onSaved(c)
    onClose()
  }

  return (
    <Modal title={t(initial ? 'lib.renameFolder' : 'lib.createFolder')} onClose={onClose} width="max-w-md">
      <div className="space-y-4">
        <div className="field">
          <label className="mb-1.5 block text-xs font-medium text-zinc-400">{t('lib.folderName')}</label>
          <input
            autoFocus
            className="input"
            value={name}
            placeholder={t('lib.newFolder')}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && save()}
          />
        </div>
        <div>
          <div className="mb-2 text-xs font-medium text-zinc-400">{t('lib.folderColor')}</div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              title={t('lib.noColor')}
              onClick={() => setColor(null)}
              className={`flex h-7 w-7 items-center justify-center rounded-full border bg-raised transition ${!color ? 'border-white' : 'border-edge'}`}
            >
              <X size={13} className="text-zinc-500" />
            </button>
            {FOLDER_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`flex h-7 w-7 items-center justify-center rounded-full border-2 transition ${color === c ? 'scale-110 border-white' : 'border-transparent'}`}
                style={{ backgroundColor: c }}
              >
                {color === c && <Check size={13} className="text-[#fff]" />}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 pt-1">
          {initial && onDeleted ? (
            <button className="btn-ghost !text-danger" onClick={() => setConfirmDel(true)}>
              <Trash2 size={15} /> {t('common.delete')}
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button className="btn-ghost" onClick={onClose}>
              {t('common.cancel')}
            </button>
            <button className="btn-accent" onClick={save} disabled={!name.trim()}>
              {t(initial ? 'common.save' : 'lib.create')}
            </button>
          </div>
        </div>
      </div>

      {confirmDel && initial && onDeleted && (
        <ConfirmDialog
          title={t('lib.deleteFolder')}
          message={t('lib.deleteFolderMsg')}
          danger
          confirmLabel={t('common.delete')}
          onCancel={() => setConfirmDel(false)}
          onConfirm={async () => {
            await window.wist.collections.remove(initial.id)
            setConfirmDel(false)
            onClose()
            onDeleted()
          }}
        />
      )}
    </Modal>
  )
}

// ============ An opened folder (collection) ============
function CollectionView({ id, onBack, t }: { id: number; onBack: () => void; t: TFn }) {
  const navigate = useNavigate()
  const [col, setCol] = useState<Collection | null>(null)
  const [items, setItems] = useState<CollectionItem[] | null>(null)
  const [showPicker, setShowPicker] = useState(false)
  const [editing, setEditing] = useState(false)

  const load = useCallback(() => {
    Promise.all([window.wist.collections.get(id), window.wist.collections.items(id)])
      .then(([c, its]) => {
        setCol(c)
        setItems(its)
      })
      .catch(() => setItems([]))
  }, [id])
  useEffect(() => {
    load()
  }, [load])
  useEffect(() => window.wist.events.onDataChanged((k) => (k === 'collections' || k === 'all') && load()), [load])

  const openItem = (it: CollectionItem) => {
    if (!it.route) return
    if (/^https?:\/\//i.test(it.route)) window.wist.shell.openExternal(it.route)
    else navigate(it.route)
  }
  const removeItem = async (it: CollectionItem) => {
    await window.wist.collections.removeItem(id, it.kind, it.ref)
    load()
  }

  return (
    <>
      <div className="mb-6 flex items-center gap-3">
        <button className="btn-ghost !h-9 !w-9 !px-0" onClick={onBack} title={t('nav.library')}>
          <ArrowLeft size={17} />
        </button>
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-raised"
          style={col?.color ? { color: col.color } : undefined}
        >
          <Folder size={19} className={col?.color ? '' : 'text-zinc-400'} />
        </span>
        <h1 className="page-title !mb-0 min-w-0 truncate">{col?.name ?? ''}</h1>
        {col && <span className="shrink-0 text-sm text-zinc-500">{t('lib.items', { n: col.item_count })}</span>}
        <div className="ml-auto flex items-center gap-2">
          {col && (
            <button className="btn-ghost" onClick={() => setEditing(true)}>
              <Pencil size={15} /> {t('common.edit')}
            </button>
          )}
          <button className="btn-accent" onClick={() => setShowPicker(true)}>
            <Plus size={16} /> {t('lib.addItems')}
          </button>
        </div>
      </div>

      {items === null ? (
        <Spinner />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Folder}
          title={t('lib.folderEmpty')}
          subtitle={t('lib.folderEmptySub')}
          action={
            <button className="btn-accent" onClick={() => setShowPicker(true)}>
              <Plus size={16} /> {t('lib.addItems')}
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-3 gap-x-4 gap-y-7 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {items.map((it) => (
            <div key={it.id} className="group relative">
              <button onClick={() => openItem(it)} className="block w-full text-left transition-transform duration-150 hover:-translate-y-0.5">
                <div className="aspect-[2/3] overflow-hidden rounded-xl bg-raised">
                  <ItemThumb cover={it.cover_path} kind={it.kind} className="h-full w-full" iconSize={34} />
                </div>
                <div className="mt-2 truncate text-[13px] font-medium text-zinc-200 group-hover:text-white">{it.label}</div>
                <div className="text-xs text-zinc-500">{t(`lib.kind.${it.kind}` as TKey)}</div>
              </button>
              <button
                onClick={() => removeItem(it)}
                title={t('common.delete')}
                className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-zinc-300 opacity-0 transition-opacity hover:text-white group-hover:opacity-100"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {showPicker && col && <AddItemsModal collection={col} onClose={() => setShowPicker(false)} onChanged={load} t={t} />}
      {editing && col && (
        <FolderModal
          initial={col}
          t={t}
          onClose={() => setEditing(false)}
          onSaved={() => load()}
          onDeleted={onBack}
        />
      )}
    </>
  )
}

// pick library entities to add/remove from a folder (works across every kind)
type PickEntity = { kind: CollectionItemKind; ref: number; label: string; sublabel?: string; cover: string | null }

function AddItemsModal({ collection, onClose, onChanged, t }: { collection: Collection; onClose: () => void; onChanged: () => void; t: TFn }) {
  const [entities, setEntities] = useState<PickEntity[] | null>(null)
  const [member, setMember] = useState<Set<string>>(new Set())
  const [q, setQ] = useState('')

  useEffect(() => {
    let alive = true
    Promise.all([
      window.wist.titles.list().catch(() => [] as Title[]),
      window.wist.vault.list(null).catch(() => [] as VaultFile[]),
      window.wist.playlists.list().catch(() => [] as Playlist[]),
      window.wist.music.list().catch(() => [] as Track[]),
      window.wist.collections.items(collection.id).catch(() => [] as CollectionItem[]),
    ]).then(([titles, vault, playlists, tracks, current]) => {
      if (!alive) return
      const ents: PickEntity[] = []
      for (const x of titles) ents.push({ kind: 'title', ref: x.id, label: x.title, sublabel: t(`type.${x.type}` as TKey), cover: x.cover_path })
      for (const f of vault.filter((v) => v.kind !== 'folder' && v.kind !== 'diskfolder'))
        ents.push({ kind: 'vault', ref: f.id, label: f.name, sublabel: t('lib.kind.vault'), cover: f.kind === 'image' ? f.path : null })
      for (const p of playlists) ents.push({ kind: 'playlist', ref: p.id, label: p.title, sublabel: (SERVICE_META[p.service] ?? SERVICE_META.other).label, cover: p.cover_path })
      for (const tr of tracks) ents.push({ kind: 'track', ref: tr.id, label: tr.title, sublabel: tr.artist ?? t('lib.kind.track'), cover: tr.cover_path })
      setEntities(ents)
      setMember(new Set(current.map((i) => `${i.kind}:${i.ref}`)))
    })
    return () => {
      alive = false
    }
  }, [collection.id, t])

  const toggle = async (e: PickEntity) => {
    const key = `${e.kind}:${e.ref}`
    const next = new Set(member)
    if (next.has(key)) {
      next.delete(key)
      setMember(next)
      await window.wist.collections.removeItem(collection.id, e.kind, e.ref)
    } else {
      next.add(key)
      setMember(next)
      await window.wist.collections.addItem(collection.id, e.kind, e.ref)
    }
    onChanged()
  }

  const needle = q.trim().toLowerCase()
  const filtered = (entities ?? []).filter((e) => !needle || e.label.toLowerCase().includes(needle))

  return (
    <Modal title={t('lib.pickerTitle', { name: collection.name })} onClose={onClose} width="max-w-lg">
      <div className="relative mb-3">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
        <input autoFocus className="input !pl-8" placeholder={t('lib.pickerSearch')} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {entities === null ? (
        <Spinner />
      ) : entities.length === 0 ? (
        <p className="py-8 text-center text-sm text-zinc-500">{t('lib.pickerEmpty')}</p>
      ) : filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-zinc-500">{t('common.noResults')}</p>
      ) : (
        <div className="-mx-1 max-h-[52vh] space-y-0.5 overflow-y-auto px-1">
          {filtered.map((e) => {
            const active = member.has(`${e.kind}:${e.ref}`)
            return (
              <button
                key={`${e.kind}:${e.ref}`}
                onClick={() => toggle(e)}
                className="flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-highlight"
              >
                <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg">
                  <ItemThumb cover={e.cover} kind={e.kind} className="h-full w-full" iconSize={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium text-zinc-200">{e.label}</div>
                  {e.sublabel && <div className="truncate text-xs text-zinc-500">{e.sublabel}</div>}
                </div>
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors ${
                    active ? 'border-accent bg-accent text-[#fff]' : 'border-edge text-transparent'
                  }`}
                >
                  <Check size={14} />
                </span>
              </button>
            )
          })}
        </div>
      )}

      <div className="mt-4 flex justify-end">
        <button className="btn-accent" onClick={onClose}>
          {t('common.done')}
        </button>
      </div>
    </Modal>
  )
}

// category-aware "Add" — a single button whose menu adapts to context
function AddMenu({ t, onAddTitle, onGoCat, onReload }: { t: TFn; onAddTitle: () => void; onGoCat: (c: Cat) => void; onReload: () => void }) {
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)
  const addFiles = async (folder: boolean) => {
    close()
    if (folder) {
      const r = await window.wist.vault.addFolder(null)
      if (r.folders > 0) onReload()
    } else {
      const n = await window.wist.vault.pickAndAdd(null)
      if (n > 0) onReload()
    }
    onGoCat('files')
  }
  const Item = ({ icon: Icon, label, onClick }: { icon: typeof Plus; label: string; onClick: () => void }) => (
    <button className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-zinc-300 transition-colors hover:bg-highlight hover:text-white" onClick={onClick}>
      <Icon size={15} className="text-zinc-500" /> {label}
    </button>
  )
  return (
    <div className="relative">
      <button className="btn-accent" onClick={() => setOpen((v) => !v)}>
        <Plus size={16} /> {t('common.add')}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={close} />
          <div className="absolute right-0 top-[calc(100%+6px)] z-50 w-52 rounded-xl border border-edge bg-card p-1 animate-scale-in" style={{ boxShadow: 'var(--float-shadow)' }}>
            <Item icon={Film} label={t('lib.addVideo')} onClick={() => { close(); onAddTitle() }} />
            <Item icon={Music2} label={t('lib.cat.music')} onClick={() => { close(); onGoCat('music') }} />
            <Item icon={ImageIcon} label={t('lib.addImages')} onClick={() => addFiles(false)} />
            <Item icon={FolderPlus} label={t('lib.addFolder')} onClick={() => addFiles(true)} />
          </div>
        </>
      )}
    </div>
  )
}

// ============ Videos / Books ============
interface MediaProps {
  kind: 'videos' | 'books'
  titles: Title[]
  loading: boolean
  filters: TitleFilters
  view: 'grid' | 'list'
  setFilters: (patch: Partial<TitleFilters>) => void
  setView: (view: 'grid' | 'list') => void
  genres: string[]
  years: number[]
  continueItems: ContinueItem[]
  onAdd: () => void
  t: TFn
}

function MediaView({ kind, titles, loading, filters, view, setFilters, setView, genres, years, continueItems, onAdd, t }: MediaProps) {
  const [filterOpen, setFilterOpen] = useState(false)

  // videos tab shows everything except books; books tab shows only books
  const items = kind === 'books' ? titles : titles.filter((x) => x.type !== 'book')
  // on the Books tab type='book' IS the tab, not a user filter — don't count it
  const typeFilter = kind === 'videos' && filters.type && filters.type !== 'all' ? filters.type : null
  const hasFilter = !!typeFilter || !!filters.genre || !!filters.year || !!filters.minRating
  const activeCount = [typeFilter, filters.genre, filters.year, filters.minRating].filter(Boolean).length
  const statusAll = !filters.status || filters.status === 'all'
  const discover = !filters.search && statusAll && !hasFilter
  const blankSlate = discover && !items.length && !loading // fresh library → just the empty state

  // shelves shown only on the unfiltered "discover" view
  const reading = kind === 'books' ? items.filter((b) => (b.reading_progress ?? 0) > 0) : []
  const [hero, ...restContinue] = continueItems.filter((c) => c.title_type !== 'book')

  const clearFilters = () => {
    setFilters({ type: kind === 'books' ? 'book' : 'all', genre: undefined, year: undefined, minRating: undefined })
    setFilterOpen(false)
  }

  return (
    <>
      {discover && kind === 'videos' && hero && <Hero item={hero} t={t} />}

      {discover && kind === 'videos' && restContinue.length > 0 && (
        <Rail title={t('home.continueWatching')}>
          {restContinue.map((item) => (
            <ContinueCard key={item.id} item={item} t={t} />
          ))}
        </Rail>
      )}
      {discover && kind === 'books' && reading.length > 0 && (
        <Rail title={t('lib.continueReading')}>
          {reading.map((b) => (
            <div key={b.id} className="w-[132px] shrink-0">
              <TitleCard title={b} />
            </div>
          ))}
        </Rail>
      )}

      {!blankSlate && (
        <>
          {/* status chips */}
          <div className="no-scrollbar mb-3 flex items-center gap-1.5 overflow-x-auto">
            <Chip active={statusAll} onClick={() => setFilters({ status: 'all' })}>
              {t('common.all')}
            </Chip>
            {TITLE_STATUSES.map((s) => (
              <Chip
                key={s}
                active={filters.status === s}
                dotColor={filters.status === s ? undefined : STATUS_COLORS[s]}
                onClick={() => setFilters({ status: filters.status === s ? 'all' : s })}
              >
                {t(`status.${s}`)}
              </Chip>
            ))}
          </div>

          {/* toolbar: search · filters · sort · view */}
          <div className="mb-6 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                className="input !pl-8"
                placeholder={t('lib.search')}
                value={filters.search ?? ''}
                onChange={(e) => setFilters({ search: e.target.value || undefined })}
              />
            </div>

            <div className="relative">
              <button onClick={() => setFilterOpen((v) => !v)} className={`btn-ghost ${activeCount ? '!text-zinc-100' : ''}`}>
                <Filter size={15} /> {t('lib.filters')}
                {activeCount > 0 && <span className="ml-0.5 rounded-full bg-accent px-1.5 text-[10px] font-bold text-[#fff]">{activeCount}</span>}
              </button>
              {filterOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setFilterOpen(false)} />
                  <div className="absolute left-0 top-[calc(100%+6px)] z-50 w-64 space-y-2 rounded-xl border border-edge bg-card p-3 animate-scale-in" style={{ boxShadow: 'var(--float-shadow)' }}>
                    {kind === 'videos' && (
                      <select className="select w-full" value={filters.type ?? 'all'} onChange={(e) => setFilters({ type: e.target.value as TitleType | 'all' })}>
                        <option value="all">{t('lib.allTypes')}</option>
                        {TITLE_TYPES.filter((v) => v !== 'book').map((v) => (
                          <option key={v} value={v}>{t(`type.${v}`)}</option>
                        ))}
                      </select>
                    )}
                    <select className="select w-full" value={filters.genre ?? ''} onChange={(e) => setFilters({ genre: e.target.value || undefined })}>
                      <option value="">{t('lib.allGenres')}</option>
                      {genres.map((g) => (
                        <option key={g} value={g}>{g}</option>
                      ))}
                    </select>
                    <select className="select w-full" value={filters.year ?? ''} onChange={(e) => setFilters({ year: e.target.value ? parseInt(e.target.value, 10) : undefined })}>
                      <option value="">{t('lib.anyYear')}</option>
                      {years.map((y) => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                    <select className="select w-full" value={filters.minRating ?? ''} onChange={(e) => setFilters({ minRating: e.target.value ? parseInt(e.target.value, 10) : undefined })}>
                      <option value="">{t('lib.anyRating')}</option>
                      {[9, 8, 7, 6, 5].map((r) => (
                        <option key={r} value={r}>{t('lib.ratingPlus', { n: r })}</option>
                      ))}
                    </select>
                    {activeCount > 0 && (
                      <button onClick={clearFilters} className="btn-ghost w-full !justify-center">
                        <X size={14} /> {t('lib.clearFilters')}
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>

            <div className="flex items-center gap-2 sm:ml-auto">
              <select className="select" value={filters.sort} onChange={(e) => setFilters({ sort: e.target.value as typeof filters.sort })}>
                {SORTS.map((s) => (
                  <option key={s} value={s}>{t(`lib.sort.${s}`)}</option>
                ))}
              </select>
              <button className="btn-ghost !px-2.5" title={t('lib.sortDir')} onClick={() => setFilters({ sortDir: filters.sortDir === 'asc' ? 'desc' : 'asc' })}>
                {filters.sortDir === 'asc' ? <ArrowUpAZ size={15} /> : <ArrowDownAZ size={15} />}
              </button>
              <div className="flex overflow-hidden rounded-lg border border-edge">
                <button className={`p-2 transition-colors ${view === 'grid' ? 'bg-highlight text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'}`} onClick={() => setView('grid')}>
                  <LayoutGrid size={15} />
                </button>
                <button className={`p-2 transition-colors ${view === 'list' ? 'bg-highlight text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'}`} onClick={() => setView('list')}>
                  <List size={15} />
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {discover && items.length > 0 && <h2 className="section-title">{t('lib.allLibrary')}</h2>}

      {loading && !items.length ? (
        <Spinner />
      ) : !items.length ? (
        <EmptyState
          icon={kind === 'books' ? BookOpen : LibraryIcon}
          title={t(kind === 'books' ? 'lib.booksEmpty' : 'lib.emptyTitle')}
          subtitle={t(kind === 'books' ? 'lib.booksEmptySub' : 'lib.emptySubtitle')}
          action={
            <button className="btn-accent" onClick={onAdd}>
              <Plus size={16} /> {t('lib.addFirst')}
            </button>
          }
        />
      ) : view === 'grid' ? (
        <div className="grid grid-cols-3 gap-x-4 gap-y-7 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {items.map((title) => (
            <TitleCard key={title.id} title={title} />
          ))}
        </div>
      ) : (
        <div className="space-y-1">
          {items.map((title) => (
            <TitleRow key={title.id} title={title} />
          ))}
        </div>
      )}
    </>
  )
}

function Rail({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-7">
      <h2 className="section-title">{title}</h2>
      <div className="no-scrollbar flex gap-4 overflow-x-auto pb-1">{children}</div>
    </section>
  )
}

function Hero({ item, t }: { item: ContinueItem; t: TFn }) {
  const navigate = useNavigate()
  const duration = item.duration_seconds ?? 0
  const progress = duration > 0 ? Math.min(1, item.watch_position_seconds / duration) : 0
  const remaining = duration > 0 ? duration - item.watch_position_seconds : null

  return (
    <button onClick={() => navigate(`/player/${item.id}`)} className="force-dark group relative mb-7 block h-56 w-full overflow-hidden rounded-xl text-left">
      <CoverImage coverPath={item.cover_path} title={item.title_name} type={item.title_type} className="absolute inset-0 h-full w-full transition-transform duration-300 group-hover:scale-[1.02]" iconSize={56} />
      <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/55 to-black/20" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
      <div className="absolute inset-0 flex max-w-2xl flex-col justify-end p-7">
        <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#fff]/75">{t('home.continueWatching')}</span>
        <h2 className="mt-1 truncate text-3xl font-bold text-white">{item.title_name}</h2>
        <p className="mt-1 text-sm text-zinc-300">
          {t('home.episodeN', { n: item.episode_number })}
          {remaining != null && <span className="text-zinc-400"> · {t('home.timeLeft', { time: formatTimestamp(remaining) })}</span>}
        </p>
        <div className="mt-3 inline-flex w-fit items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-[#fff] transition-colors group-hover:bg-accent-hover">
          <Play size={16} className="fill-[#fff]" /> {t('lib.resume')}
        </div>
        <div className="mt-3 h-1 w-full max-w-md overflow-hidden rounded-full bg-white/15">
          <div className="h-full rounded-full bg-accent" style={{ width: `${progress * 100}%` }} />
        </div>
      </div>
    </button>
  )
}

function ContinueCard({ item, t }: { item: ContinueItem; t: TFn }) {
  const navigate = useNavigate()
  const duration = item.duration_seconds ?? 0
  const progress = duration > 0 ? Math.min(1, item.watch_position_seconds / duration) : 0

  return (
    <button onClick={() => navigate(`/player/${item.id}`)} className="group w-56 shrink-0 overflow-hidden rounded-xl bg-surface text-left transition-transform duration-150 hover:-translate-y-0.5">
      <div className="relative h-32 overflow-hidden bg-raised">
        <CoverImage coverPath={item.cover_path} title={item.title_name} type={item.title_type} className="h-full w-full transition-transform duration-200 group-hover:scale-[1.03]" iconSize={26} />
        <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:bg-black/40 group-hover:opacity-100">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent">
            <Play size={18} className="ml-0.5 fill-[#fff] text-[#fff]" />
          </span>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/60">
          <div className="h-full bg-accent" style={{ width: `${progress * 100}%` }} />
        </div>
      </div>
      <div className="px-3.5 py-2.5">
        <div className="truncate text-[13px] font-medium text-zinc-200">{item.title_name}</div>
        <div className="mt-0.5 text-xs text-zinc-500">{t('home.episodeN', { n: item.episode_number })}</div>
      </div>
    </button>
  )
}

// ============ Music — in-place local-track manager (no bounce to /music) ============
function MusicManager({ t }: { t: TFn }) {
  const [tracks, setTracks] = useState<Track[] | null>(null)
  const [q, setQ] = useState('')
  const [adding, setAdding] = useState(false)

  const load = useCallback(() => {
    window.wist.music.list().then(setTracks).catch(() => setTracks([]))
  }, [])
  useEffect(() => {
    load()
  }, [load])
  useEffect(() => window.wist.events.onDataChanged((k) => (k === 'music' || k === 'all') && load()), [load])

  const needle = q.trim().toLowerCase()
  const filtered = (tracks ?? []).filter(
    (x) => !needle || x.title.toLowerCase().includes(needle) || (x.artist ?? '').toLowerCase().includes(needle)
  )

  // play the clicked track within the current (filtered) list as the queue
  const play = (id: number) => {
    const i = filtered.findIndex((x) => x.id === id)
    usePlayerStore.getState().playTracks(filtered, Math.max(0, i))
  }
  const remove = async (id: number) => {
    await window.wist.music.remove(id)
    load()
  }
  const addMusic = async () => {
    setAdding(true)
    try {
      const r = await window.wist.music.addFolder()
      if (r && r.added > 0) {
        toast(t('vault.syncedTracks', { n: r.added }), 'success')
        load()
      } else if (r) {
        toast(t('vault.noNew'))
      }
    } finally {
      setAdding(false)
    }
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input className="input !pl-8" placeholder={t('common.search')} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <button className="btn-accent" onClick={addMusic} disabled={adding}>
          <Plus size={16} /> {t('common.add')}
        </button>
      </div>

      {tracks === null ? (
        <Spinner />
      ) : !filtered.length ? (
        <EmptyState
          icon={MusicIcon}
          title={t('lib.musicEmpty')}
          subtitle={t('lib.musicEmptySub')}
          action={
            <button className="btn-accent" onClick={addMusic} disabled={adding}>
              <Plus size={16} /> {t('common.add')}
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-3 gap-x-4 gap-y-7 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {filtered.map((tr) => (
            <div key={tr.id} className="group relative">
              <button onClick={() => play(tr.id)} className="block w-full text-left transition-transform duration-150 hover:-translate-y-0.5">
                <div className="relative aspect-square overflow-hidden rounded-xl bg-raised">
                  <ItemThumb cover={tr.cover_path} kind="track" className="h-full w-full" iconSize={32} />
                  <span className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:bg-black/35 group-hover:opacity-100">
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent">
                      <Play size={18} className="ml-0.5 fill-[#fff] text-[#fff]" />
                    </span>
                  </span>
                </div>
                <div className="mt-2 truncate text-[13px] font-medium text-zinc-200 group-hover:text-white">{tr.title}</div>
                <div className="truncate text-xs text-zinc-500">{tr.artist || '—'}</div>
              </button>
              <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  onClick={() => tr.path && window.wist.shell.showItemInFolder(tr.path)}
                  title={t('detail.showInFolder')}
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-zinc-300 transition-colors hover:text-white"
                >
                  <Eye size={13} />
                </button>
                <button
                  onClick={() => remove(tr.id)}
                  title={t('common.delete')}
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-zinc-300 transition-colors hover:text-danger"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
