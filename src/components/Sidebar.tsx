import { Fragment, useEffect, useRef, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  ArrowUpRight,
  ChevronDown,
  Compass,
  File as FileIcon,
  FileText,
  FolderKanban,
  Frame,
  GripVertical,
  Home,
  ListChecks,
  ListTodo,
  MoreHorizontal,
  PanelLeft,
  Pencil,
  PenLine,
  Plus,
  Search,
  Share2,
  SplitSquareHorizontal,
  Star,
  Trash2,
  Users,
} from 'lucide-react'
import Tooltip from './ui/Tooltip'
import ProfileMenu from './ProfileMenu'
import { useUiStore } from '../store/uiStore'
import { useHistoryStore } from '../store/historyStore'
import { useFavoritesStore } from '../store/favoritesStore'
import { routeMeta } from '../lib/routeMeta'
import { dragHasMedia, readMediaDrag } from '../lib/mediaDrag'
import { useSortable } from '../lib/useSortable'
import { useTreeSort } from '../lib/useTreeSort'
import { toast } from '../store/toastStore'
import { PROJECT_STATUS_COLORS, type Favorite, type FavoriteKind, type Project } from '../types/models'
import { useI18n, type TKey } from '../i18n'

type TFn = ReturnType<typeof useI18n>['t']

interface Link {
  to: string
  key: TKey
  icon: typeof Home
  children?: Link[] // expandable sub-nav (e.g. Библиотека → Видео / Музыка / Книги)
}

// a single context-menu action — built fresh per row, rendered by one shared menu
interface MenuItem {
  label: string
  onClick: () => void
  icon?: typeof Home
  danger?: boolean
}
type MenuState = { x: number; y: number; items: MenuItem[] } | null

// Дом (personal world): productivity + libraries + tools. Each content library is a direct link.
// In the БИБЛИОТЕКИ section the old per-category "Файлы" was repurposed into "Мои файлы" — the
// single entry to the unified /library folder hub (the others still deep-link their category).
const HOME_GROUPS: Array<{ key: TKey; id: string; links: Link[] }> = [
  {
    key: 'nav.productivity',
    id: 'productivity',
    links: [
      { to: '/tasks', key: 'nav.tasks', icon: ListTodo },
      { to: '/notes', key: 'nav.notes', icon: PenLine },
      { to: '/vault', key: 'nav.vault', icon: FileText },
    ],
  },
  {
    key: 'nav.tools',
    id: 'tools',
    links: [
      { to: '/canvas', key: 'nav.canvas', icon: Frame },
      { to: '/tree', key: 'nav.tree', icon: Share2 },
      { to: '/workspace', key: 'nav.workspace', icon: Users },
    ],
  },
]

const FAV_KIND_ICON: Record<FavoriteKind, typeof Home> = {
  note: PenLine,
  project: FolderKanban,
  canvas: ListChecks,
  task: ListTodo,
  vault: FileIcon,
  route: Compass,
}

// a row's resting / active look. Active rows get a soft NEUTRAL fill (Notion-style) — no
// colour at all: the grey ground + brighter primary ink is the whole "you are here" signal
// (black in light theme, white in dark — never blue).
function rowClass(active: boolean): string {
  return [
    'group/i relative flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[14px] font-medium transition-colors duration-200 ease-out',
    active
      ? 'bg-sidebar-active text-zinc-100'
      : 'text-zinc-400 hover:bg-highlight hover:text-zinc-100',
  ].join(' ')
}
function iconClass(active: boolean): string {
  // active icon brightens to the primary ink so it matches the active label — neutral,
  // theme-driven (black/white), never the accent colour
  return active ? 'shrink-0 text-zinc-100' : 'shrink-0 text-zinc-500 group-hover/i:text-zinc-300'
}
function loadCollapsed(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem('wist.sidebarCollapsed') ?? '[]'))
  } catch {
    return new Set()
  }
}

// section header names can be renamed; overrides persist in localStorage.
// Validate the shape so a corrupt/foreign entry can never render a non-string
// label (Sidebar lives outside the route ErrorBoundary).
function loadSectionNames(): Record<string, string> {
  try {
    const raw = JSON.parse(localStorage.getItem('wist.sectionNames') ?? '{}')
    const out: Record<string, string> = {}
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      for (const [k, v] of Object.entries(raw)) if (typeof v === 'string') out[k] = v
    }
    return out
  } catch {
    return {}
  }
}

// user-chosen order of the nav groups (drag to reorder). Persisted as a list of
// group ids; unknown/new groups fall back to their HOME_GROUPS position.
function loadGroupOrder(): string[] {
  const def = HOME_GROUPS.map((g) => g.id)
  try {
    const raw = JSON.parse(localStorage.getItem('wist.groupOrder') ?? '[]')
    if (!Array.isArray(raw)) return def
    const known = raw.filter((id): id is string => typeof id === 'string' && def.includes(id))
    // append any group not covered by the saved order (e.g. a newly added section)
    return [...known, ...def.filter((id) => !known.includes(id))]
  } catch {
    return def
  }
}

function orderGroups(order: string[]): typeof HOME_GROUPS {
  const byId = new Map(HOME_GROUPS.map((g) => [g.id, g]))
  return order.map((id) => byId.get(id)).filter(Boolean) as typeof HOME_GROUPS
}

// ── nav-item layout: which items live in which section + their order. Like the group
// order, this is user-curated (drag a row inside a section OR across to another) and
// persisted. Derived from HOME_GROUPS but resilient to it changing: items that no longer
// exist are dropped, brand-new ones are appended to their home section.
const ALL_ITEMS = HOME_GROUPS.flatMap((g) => g.links.map((link) => ({ link, group: g.id })))
const LINK_BY_TO = new Map(ALL_ITEMS.map(({ link }) => [link.to, link] as const))
const DEFAULT_ITEM_LAYOUT: Record<string, string[]> = Object.fromEntries(HOME_GROUPS.map((g) => [g.id, g.links.map((l) => l.to)]))

function cloneItemLayout(): Record<string, string[]> {
  return Object.fromEntries(Object.entries(DEFAULT_ITEM_LAYOUT).map(([k, v]) => [k, [...v]]))
}

function loadItemLayout(): Record<string, string[]> {
  try {
    const raw = JSON.parse(localStorage.getItem('wist.itemLayout') ?? 'null')
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return cloneItemLayout()
    const out: Record<string, string[]> = {}
    const seen = new Set<string>()
    for (const gid of Object.keys(DEFAULT_ITEM_LAYOUT)) {
      const rawArr = (raw as Record<string, unknown>)[gid]
      out[gid] = Array.isArray(rawArr)
        ? rawArr.filter((to): to is string => typeof to === 'string' && LINK_BY_TO.has(to) && !seen.has(to))
        : []
      out[gid].forEach((to) => seen.add(to))
    }
    // any known item the saved layout didn't place → append to its home section
    for (const { link, group } of ALL_ITEMS) {
      if (!seen.has(link.to)) {
        ;(out[group] ??= []).push(link.to)
        seen.add(link.to)
      }
    }
    return out
  } catch {
    return cloneItemLayout()
  }
}

/**
 * A small Notion-style section header: muted label that can be renamed inline
 * (double-click the label, or the pencil that appears on hover) and, when
 * `collapsible`, toggles its group open/closed. Defined at module scope so its
 * editing state survives parent re-renders.
 */
function SectionHeader({
  id,
  label,
  defaultLabel,
  renameHint,
  onRename,
  collapsible = false,
  isCollapsed = false,
  onToggle,
  right,
  onHandleDown,
}: {
  id: string
  label: string
  defaultLabel: string
  renameHint: string
  onRename: (id: string, value: string) => void
  collapsible?: boolean
  isCollapsed?: boolean
  onToggle?: () => void
  right?: React.ReactNode
  onHandleDown?: (e: React.MouseEvent) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(label)

  const begin = (e: React.MouseEvent) => {
    e.stopPropagation()
    setDraft(label)
    setEditing(true)
  }
  const commit = () => {
    const next = draft.trim()
    // empty, or unchanged-from-default → drop the override so the i18n binding
    // (and language switching) keeps working. Never freeze a translated default.
    onRename(id, next && next !== defaultLabel ? next : '')
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="mb-0.5 px-2 py-0.5">
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') setEditing(false)
          }}
          className="w-full rounded-lg border border-edge bg-field px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-200 outline-none focus:border-accent"
        />
      </div>
    )
  }

  return (
    <div
      onClick={collapsible ? onToggle : undefined}
      role={collapsible ? 'button' : undefined}
      tabIndex={collapsible ? 0 : undefined}
      onKeyDown={
        collapsible
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onToggle?.()
              }
            }
          : undefined
      }
      className={`group/h relative mb-0.5 flex items-center gap-1 rounded-lg px-2 py-1 ${collapsible ? 'cursor-pointer' : ''}`}
    >
      {onHandleDown && (
        <span
          className="drag-handle absolute -left-2 top-1/2 flex h-5 w-4 -translate-y-1/2 cursor-grab items-center justify-center text-zinc-600 opacity-0 transition-opacity hover:text-zinc-300 group-hover/h:opacity-100"
          onMouseDown={(e) => {
            e.stopPropagation()
            onHandleDown(e)
          }}
          onClick={(e) => e.stopPropagation()}
          title={renameHint}
        >
          <GripVertical size={11} />
        </span>
      )}
      <span
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={begin}
        title={renameHint}
        className="min-w-0 select-none truncate text-[11px] font-semibold uppercase tracking-wider text-zinc-600 transition-colors group-hover/h:text-zinc-500"
      >
        {label}
      </span>
      <div className="ml-auto flex items-center gap-0.5">
        <button
          onClick={begin}
          title={renameHint}
          className="rounded-lg p-0.5 text-zinc-500 opacity-0 transition-all duration-200 hover:bg-highlight hover:text-zinc-200 group-hover/h:opacity-100"
        >
          <Pencil size={12} />
        </button>
        {right}
        {collapsible && (
          <ChevronDown
            size={12}
            className={`text-zinc-600 transition-all duration-200 ${isCollapsed ? '-rotate-90 opacity-100' : 'opacity-0 group-hover/h:opacity-100'}`}
          />
        )}
      </div>
    </div>
  )
}

// a small square thumbnail for a pinned row: its cover if any, else a tinted kind icon
function FavThumb({ fav }: { fav: Favorite }) {
  if (fav.cover_path) {
    return (
      <img
        src={window.wist.media.fileUrl(fav.cover_path)}
        alt=""
        loading="lazy"
        draggable={false}
        className="h-[18px] w-[18px] shrink-0 overflow-hidden rounded object-cover"
      />
    )
  }
  const Icon = FAV_KIND_ICON[fav.kind] ?? Star
  return <Icon size={16} className="shrink-0 text-zinc-500 group-hover/i:text-zinc-300" />
}

/**
 * The inline "Избранное" list — always-visible pinned shortcuts (Notion's Favorites).
 * Rows reorder by drag (a thin accent line marks the drop slot) and reveal a `•••`
 * menu + a one-tap unpin star on hover. Module-scope so its drag state is isolated.
 */
function FavoritesList({
  favorites,
  t,
  onOpen,
  onUnpin,
  onReorder,
  onMenu,
}: {
  favorites: Favorite[]
  t: TFn
  onOpen: (route: string | null) => void
  onUnpin: (kind: FavoriteKind, ref: string) => void
  onReorder: (ids: number[]) => void
  onMenu: (e: React.MouseEvent, fav: Favorite) => void
}) {
  const [dragId, setDragId] = useState<number | null>(null)
  const [overId, setOverId] = useState<number | null>(null)

  const finishDrop = (targetId: number) => {
    if (dragId != null && dragId !== targetId) {
      const ids = favorites.map((f) => f.id)
      const from = ids.indexOf(dragId)
      const to = ids.indexOf(targetId)
      if (from >= 0 && to >= 0) {
        ids.splice(to, 0, ids.splice(from, 1)[0])
        onReorder(ids)
      }
    }
    setDragId(null)
    setOverId(null)
  }

  return (
    <div className="space-y-px">
      {favorites.map((f) => (
        <div
          key={f.id}
          draggable
          onDragStart={(e) => {
            setDragId(f.id)
            e.dataTransfer.effectAllowed = 'move'
          }}
          onDragOver={(e) => {
            if (dragId == null) return
            e.preventDefault()
            if (overId !== f.id) setOverId(f.id)
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverId((x) => (x === f.id ? null : x))
          }}
          onDrop={(e) => {
            e.preventDefault()
            finishDrop(f.id)
          }}
          onDragEnd={() => {
            setDragId(null)
            setOverId(null)
          }}
          role="button"
          tabIndex={0}
          onClick={() => onOpen(f.route)}
          onKeyDown={(e) => e.key === 'Enter' && onOpen(f.route)}
          onContextMenu={(e) => onMenu(e, f)}
          className={`group/i relative flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-[14px] font-medium text-zinc-400 transition-colors hover:bg-highlight hover:text-zinc-100 ${
            dragId === f.id ? 'opacity-40' : ''
          } ${
            overId === f.id && dragId !== f.id
              ? "before:absolute before:inset-x-1 before:top-0 before:h-0.5 before:rounded-full before:bg-accent before:content-['']"
              : ''
          }`}
        >
          <FavThumb fav={f} />
          <span className="min-w-0 flex-1 truncate text-left">{f.label.trim() || t('fav.untitled')}</span>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onMenu(e, f)
            }}
            className="shrink-0 rounded p-0.5 text-zinc-500 opacity-0 transition-all hover:bg-highlight hover:text-zinc-200 group-hover/i:opacity-100"
          >
            <MoreHorizontal size={14} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onUnpin(f.kind, f.ref)
            }}
            title={t('fav.unpin')}
            className="shrink-0 rounded p-0.5 text-[var(--c-yellow-text)] opacity-0 transition-all hover:bg-highlight group-hover/i:opacity-100"
          >
            <Star size={13} className="fill-current" />
          </button>
        </div>
      ))}
    </div>
  )
}

export default function Sidebar() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const pathname = useLocation().pathname
  const historyEntries = useHistoryStore((s) => s.entries)
  const removeHistory = useHistoryStore((s) => s.remove)
  const compact = useUiStore((s) => s.sidebarCollapsed)
  const setPalette = useUiStore((s) => s.setPalette)
  const toggleSidebar = useUiStore((s) => s.toggleSidebar)
  const sidebarWidth = useUiStore((s) => s.sidebarWidth)
  const setSidebarWidth = useUiStore((s) => s.setSidebarWidth)
  const setSplit = useUiStore((s) => s.setSplit)
  const resizeCleanup = useRef<(() => void) | null>(null)
  useEffect(() => () => resizeCleanup.current?.(), []) // tear down a drag if we unmount mid-resize
  const [collapsed, setCollapsed] = useState<Set<string>>(loadCollapsed)
  const [sectionNames, setSectionNames] = useState<Record<string, string>>(loadSectionNames)
  const [groupOrder, setGroupOrder] = useState<string[]>(loadGroupOrder)
  const [taskCount, setTaskCount] = useState(0)
  const [hubProjects, setHubProjects] = useState<Project[]>([])
  const [dropProject, setDropProject] = useState<number | null>(null) // hub link lit as a drop target
  const [renamingProject, setRenamingProject] = useState<{ id: number; value: string } | null>(null)
  const [menu, setMenu] = useState<MenuState>(null) // shared right-click / ••• context menu
  // collapsed-rail hover preview: hovering the 56px rail slides the full sidebar
  // out over the content (auto-hides on mouse-out) — one-handed nav without giving
  // up canvas space. A short open-delay avoids firing when the cursor just grazes it.
  const [peek, setPeek] = useState(false)
  const peekTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const openPeek = () => {
    if (peekTimer.current) clearTimeout(peekTimer.current)
    peekTimer.current = setTimeout(() => setPeek(true), 130)
  }
  const closePeek = () => {
    if (peekTimer.current) clearTimeout(peekTimer.current)
    setPeek(false)
  }
  useEffect(
    () => () => {
      if (peekTimer.current) clearTimeout(peekTimer.current)
    },
    []
  )
  useEffect(() => {
    if (!compact) setPeek(false) // expanding clears any pending peek so it never auto-opens later
  }, [compact])
  // true while dragging the resize edge — suppresses the collapse/expand width-morph
  // transition so the edge tracks the cursor 1:1 instead of rubber-banding behind it
  const [resizing, setResizing] = useState(false)

  // universal favorites — the always-visible pinned section
  const favorites = useFavoritesStore((s) => s.favorites)
  const favLoaded = useFavoritesStore((s) => s.loaded)
  const loadFavs = useFavoritesStore((s) => s.load)
  const reorderFavs = useFavoritesStore((s) => s.reorder)
  const removeFav = useFavoritesStore((s) => s.remove)
  const toggleFav = useFavoritesStore((s) => s.toggle)
  useEffect(() => {
    loadFavs()
  }, [loadFavs])

  // drop a media item (Library title / playlist / track / Vault file) straight onto a hub
  // in the sidebar to file it there — no need to open the hub first
  const addMediaToProject = async (pid: number, name: string, e: React.DragEvent) => {
    const items = readMediaDrag(e)
    if (!items) return
    let n = 0
    const paths: string[] = []
    for (const it of items) {
      if ((it.kind === 'url' || it.kind === 'playlist') && it.url) n += (await window.wist.projects.addUrl(pid, it.url, it.title || null, null)) || 0
      else {
        const p = it.path || it.cover
        if (p) paths.push(p)
      }
    }
    if (paths.length) n += (await window.wist.projects.addPaths(pid, paths, null)) || 0
    if (n) toast(`${t('dnd.added')} → ${name}`, 'success')
  }

  // which "world" are we in? Хаб = the projects list; Дом = the personal world
  // (which owns the productivity + tools nav: notes, canvas, graph).
  const inHub = pathname.startsWith('/project') || pathname.startsWith('/vault')
  const onTrash = pathname === '/trash'
  const onProfile = pathname === '/profile'
  const onFavorites = pathname === '/favorites'
  const onHistory = pathname === '/history'
  const inHome = !inHub && !onTrash && !onProfile && !onFavorites && !onHistory && pathname !== '/settings'

  // recent deep items (a specific hub / title / canvas) for one-click return. The flat
  // top-level pages already live in the nav, so we only surface detail routes here.
  const deepRecents = historyEntries
    .filter((e) => /^\/(project|canvas)\//.test(e.path) && e.path.split('?')[0] !== pathname)
    .slice(0, 4)

  // close the context menu + collapse the hover-peek on navigation
  useEffect(() => {
    setMenu(null)
    setPeek(false)
  }, [pathname])
  useEffect(() => {
    if (!menu) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menu])

  useEffect(() => {
    const load = () =>
      window.wist.tasks
        .list({ done: false })
        .then((ts) => setTaskCount(ts.length))
        .catch(() => undefined)
    load()
    return window.wist.events.onDataChanged((kind) => {
      if (kind === 'tasks') load()
    })
  }, [])

  useEffect(() => {
    const load = () =>
      window.wist.projects
        .list()
        .then(setHubProjects)
        .catch(() => undefined)
    load()
    return window.wist.events.onDataChanged((kind) => {
      if (kind === 'projects') load()
    })
  }, [])

  const isLinkActive = (to: string, routeActive: boolean): boolean => {
    return routeActive
  }

  const toggleGroup = (id: string) => {
    const next = new Set(collapsed)
    next.has(id) ? next.delete(id) : next.add(id)
    setCollapsed(next)
    try {
      localStorage.setItem('wist.sidebarCollapsed', JSON.stringify([...next]))
    } catch {
      /* storage unavailable */
    }
  }

  const renameSection = (id: string, value: string) => {
    setSectionNames((prev) => {
      const next = { ...prev }
      if (value) next[id] = value
      else delete next[id] // empty → fall back to the default i18n name
      try {
        localStorage.setItem('wist.sectionNames', JSON.stringify(next))
      } catch {
        /* storage unavailable */
      }
      return next
    })
  }
  const sectionLabel = (id: string, key: TKey) => sectionNames[id] ?? t(key)

  const reorderGroups = (ids: string[]) => {
    setGroupOrder(ids)
    try {
      localStorage.setItem('wist.groupOrder', JSON.stringify(ids))
    } catch {
      /* storage unavailable */
    }
  }
  const orderedGroups = orderGroups(groupOrder)
  const groupDrag = useSortable(
    orderedGroups.map((g) => g.id),
    reorderGroups
  )

  // nav-item reorder (within a section or across to another). The multi-container
  // pointer drag resolves the section under the cursor; `moveItem` rewrites + persists.
  const [itemLayout, setItemLayout] = useState<Record<string, string[]>>(loadItemLayout)
  const moveItem = (itemId: string, toGroup: string, toIndex: number) => {
    setItemLayout((prev) => {
      if (!prev[toGroup]) return prev
      const next: Record<string, string[]> = {}
      for (const k of Object.keys(prev)) next[k] = prev[k].slice()
      let fromGroup = ''
      for (const k of Object.keys(next)) if (next[k].includes(itemId)) { fromGroup = k; break }
      if (!fromGroup) return prev
      const fromIndex = next[fromGroup].indexOf(itemId)
      next[fromGroup].splice(fromIndex, 1)
      // index was measured with the source still in place → shift when moving down in-section
      let idx = fromGroup === toGroup && fromIndex < toIndex ? toIndex - 1 : toIndex
      idx = Math.max(0, Math.min(next[toGroup].length, idx))
      next[toGroup].splice(idx, 0, itemId)
      try {
        localStorage.setItem('wist.itemLayout', JSON.stringify(next))
      } catch {
        /* storage unavailable */
      }
      return next
    })
  }
  const itemSort = useTreeSort(moveItem)
  const groupItems = (gid: string): Link[] =>
    (itemLayout[gid] ?? []).map((to) => LINK_BY_TO.get(to)).filter((l): l is Link => !!l)

  // ---- shared context menu (right-click a row, or click its •••) ----
  const openMenu = (e: React.MouseEvent, items: MenuItem[]) => {
    e.preventDefault()
    e.stopPropagation()
    setMenu({ x: e.clientX, y: e.clientY, items })
  }
  const openItem = (route: string): MenuItem => ({ label: t('sidebar.open'), icon: ArrowUpRight, onClick: () => navigate(route) })
  const splitItem = (route: string): MenuItem => ({ label: t('sidebar.openInSplit'), icon: SplitSquareHorizontal, onClick: () => setSplit(route) })

  // menu for a plain nav link (library / tool / productivity item)
  const navMenu = (e: React.MouseEvent, link: Link) => {
    const pinned = useFavoritesStore.getState().isPinned('route', link.to)
    openMenu(e, [
      openItem(link.to),
      splitItem(link.to),
      {
        label: pinned ? t('fav.unpin') : t('fav.pin'),
        icon: Star,
        onClick: () => (pinned ? removeFav('route', link.to) : toggleFav({ kind: 'route', ref: link.to, label: t(link.key), route: link.to })),
      },
    ])
  }

  // menu for a hub row — adds rename + soft-delete (recoverable from Корзина)
  const projectMenu = (e: React.MouseEvent, p: Project) => {
    const route = `/project/${p.id}`
    const pinned = useFavoritesStore.getState().isPinned('project', p.id)
    openMenu(e, [
      openItem(route),
      splitItem(route),
      {
        label: pinned ? t('fav.unpin') : t('fav.pin'),
        icon: Star,
        onClick: () =>
          pinned ? removeFav('project', p.id) : toggleFav({ kind: 'project', ref: p.id, label: p.name, route, cover_path: p.cover_path }),
      },
      { label: t('sidebar.rename'), icon: Pencil, onClick: () => setRenamingProject({ id: p.id, value: p.name }) },
      { label: t('sidebar.delete'), icon: Trash2, danger: true, onClick: () => deleteProject(p.id) },
    ])
  }

  // menu for a pinned favorite row
  const favMenu = (e: React.MouseEvent, f: Favorite) => {
    openMenu(e, [
      ...(f.route ? [openItem(f.route), splitItem(f.route)] : []),
      { label: t('fav.unpin'), icon: Star, onClick: () => removeFav(f.kind, f.ref) },
    ])
  }

  const deleteProject = async (id: number) => {
    await window.wist.projects.remove(id)
    if (pathname === `/project/${id}`) navigate('/projects')
    toast(t('sidebar.deleted'), 'success')
  }

  const commitRenameProject = async () => {
    if (!renamingProject) return
    const { id, value } = renamingProject
    const name = value.trim()
    setRenamingProject(null)
    if (name) await window.wist.projects.update(id, { name })
  }

  const navRow = (link: Link) => {
    const { to, key, icon: Icon } = link
    return (
      <NavLink key={to} to={to} draggable={false} onContextMenu={(e) => navMenu(e, link)} className={({ isActive }) => rowClass(isLinkActive(to, isActive))}>
        {({ isActive }) => {
          const active = isLinkActive(to, isActive)
          return (
            <>
              <Icon size={17} className={iconClass(active)} />
              <span className="min-w-0 flex-1 truncate">{t(key)}</span>
              {to === '/tasks' && taskCount > 0 && <span className="shrink-0 text-[11px] font-medium text-zinc-500">{taskCount}</span>}
              <button
                onClick={(e) => navMenu(e, link)}
                className="shrink-0 rounded p-0.5 text-zinc-500 opacity-0 transition-all hover:bg-highlight hover:text-zinc-200 group-hover/i:opacity-100"
              >
                <MoreHorizontal size={14} />
              </button>
            </>
          )
        }}
      </NavLink>
    )
  }

  // drag the right edge to resize; a click without drag collapses (Claude-style)
  const onResizeStart = (e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startW = sidebarWidth
    let moved = false
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'
    setResizing(true)
    const onMove = (ev: MouseEvent) => {
      if (Math.abs(ev.clientX - startX) > 3) moved = true
      if (moved) setSidebarWidth(startW + (ev.clientX - startX)) // don't drift width on a collapse-click
    }
    const cleanup = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
      resizeCleanup.current = null
      setResizing(false)
    }
    const onUp = () => {
      cleanup()
      if (!moved) toggleSidebar() // a click without drag collapses
    }
    resizeCleanup.current = cleanup
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  const resizeHandle = (
    <div
      onMouseDown={onResizeStart}
      title={t('sidebar.resizeHint')}
      data-tip-cursor=""
      className="group/rz app-no-drag absolute right-0 top-0 z-20 h-full w-1.5 cursor-col-resize"
    >
      <div className="absolute right-0 top-0 h-full w-px bg-transparent transition-colors duration-150 group-hover/rz:bg-accent/60" />
    </div>
  )

  // the shared context menu — fixed-positioned off the click, dismissed by a transparent backdrop
  const contextMenu = menu ? (
    <>
      <div
        className="fixed inset-0 z-40"
        onClick={() => setMenu(null)}
        onContextMenu={(e) => {
          e.preventDefault()
          setMenu(null)
        }}
      />
      <div
        style={{
          position: 'fixed',
          left: Math.min(menu.x, window.innerWidth - 200),
          top: Math.min(menu.y, window.innerHeight - (menu.items.length * 34 + 14)),
          zIndex: 50,
          boxShadow: 'var(--float-shadow)',
        }}
        className="w-48 overflow-hidden rounded-xl border border-edge bg-card p-1"
      >
        {menu.items.map((it, i) => (
          <button
            key={i}
            onClick={() => {
              setMenu(null)
              it.onClick()
            }}
            className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-left text-[13px] transition-colors hover:bg-highlight ${
              it.danger ? 'text-danger' : 'text-zinc-200'
            }`}
          >
            {it.icon && <it.icon size={14} className={`shrink-0 ${it.danger ? 'text-danger' : 'text-zinc-500'}`} />}
            {it.label}
          </button>
        ))}
      </div>
    </>
  ) : null

  // ================= full sidebar (in-flow when expanded, or a hover-peek overlay) =================
  // a round tab pill whose label width animates open/closed (.tab-morph) instead
  // of snapping — gives the soft Notion-style transition between Дом / Хаб.
  // Дом / Хаб — a two-up segmented switch. BOTH labels always show so the Хаб (the
  // projects world, a core part of Bard) is never hidden behind a bare icon. The active
  // section gets a NEUTRAL filled pill (grey ground + primary ink) — no accent colour, so
  // it reads black in light theme / white in dark, exactly like Notion's nav.
  const tabBtn = (active: boolean) =>
    `flex h-9 flex-1 items-center justify-center gap-2 rounded-lg text-[13px] font-semibold transition-colors duration-200 ease-out ${
      active
        ? 'bg-sidebar-active text-zinc-100 shadow-[var(--card-shadow)]'
        : 'text-zinc-400 hover:bg-highlight hover:text-zinc-100'
    }`

  // One panel, two render modes:
  //  • in-flow (overlay=false) — ALWAYS mounted (see the return), so React keeps the same
  //    <aside> node across collapse/expand and its width MORPHS 0 ↔ full with a soft
  //    transition instead of snapping. (Suppressed while resizing or peeking — see below.)
  //  • hover-peek (overlay=true) — floats over the canvas; slides in SOLID from the left
  //    edge with a soft shadow (no opacity fade — that read as an eye-straining "ghost"),
  //    driven by `peek`. pointer-events drop while hidden so it never blocks the canvas.
  const fullAside = (overlay: boolean) => (
    <aside
      style={{
        width: overlay || !compact ? sidebarWidth : 0,
        transition: overlay || resizing || peek ? undefined : 'width 340ms cubic-bezier(0.65, 0, 0.35, 1)',
      }}
      className={
        overlay
          ? `absolute left-0 top-0 z-40 flex h-full flex-col overflow-hidden border-r border-edge bg-sidebar transition-[transform,box-shadow] duration-[210ms] ease-[cubic-bezier(0.33,1,0.68,1)] ${peek ? 'translate-x-0 shadow-[var(--float-shadow)]' : 'pointer-events-none -translate-x-full'}`
          : `relative flex h-full shrink-0 flex-col overflow-hidden bg-sidebar ${compact ? '' : 'border-r border-edge'}`
      }
    >
      {/* top: collapse toggle (drag region) + a search field. h-[42px] + border-b matches the
          content TopBar (and the native window controls) so the search field sits exactly
          level with the workspace tabs and the whole top edge reads as one straight line. */}
      <div className="app-drag flex h-[42px] shrink-0 items-center gap-1 border-b border-edge px-2">
        <Tooltip label={t('app.toggleSidebar')} shortcut="Ctrl B" side="bottom">
          <button
            onClick={toggleSidebar}
            className="app-no-drag shrink-0 rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-raised hover:text-zinc-200"
          >
            <PanelLeft size={16} />
          </button>
        </Tooltip>
        <button
          onClick={() => setPalette(true)}
          className="app-no-drag flex h-7 min-w-0 flex-1 items-center gap-2 rounded-lg border border-edge bg-field px-2.5 text-[13px] text-zinc-500 transition-colors hover:bg-highlight hover:text-zinc-300"
        >
          <Search size={14} className="shrink-0" />
          <span className="min-w-0 flex-1 truncate text-left">{t('sidebar.search')}</span>
          <span className="kbd shrink-0">Ctrl K</span>
        </button>
      </div>

      {/* tab bar — Дом / Хаб (the context switch). Trash + Favorites are no longer tabs:
          Favorites is an always-visible section below, Trash a quiet row at the bottom. */}
      <div className="flex items-center gap-1.5 px-2.5 pb-3 pt-3">
        <button onClick={() => navigate('/')} className={tabBtn(inHome)}>
          <Home size={16} className="shrink-0" />
          <span className="leading-none">{t('nav.home')}</span>
        </button>
        <button onClick={() => navigate('/projects')} className={tabBtn(inHub)}>
          <FolderKanban size={16} className="shrink-0" />
          <span className="leading-none">{t('nav.hub')}</span>
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-2.5 pb-4 pt-1">
        {/* Избранное — always-visible pinned shortcuts (header stays even when empty so the
            full Favorites page is always reachable and new users discover pinning) */}
        <div>
          <SectionHeader
            id="favorites"
            label={sectionLabel('favorites', 'nav.favorites')}
            defaultLabel={t('nav.favorites')}
            renameHint={t('sidebar.renameHint')}
            onRename={renameSection}
            collapsible
            isCollapsed={collapsed.has('favorites')}
            onToggle={() => toggleGroup('favorites')}
            right={
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  navigate('/favorites')
                }}
                title={t('sidebar.openFavorites')}
                className="rounded-lg p-0.5 text-zinc-500 opacity-0 transition-all duration-200 hover:bg-highlight hover:text-zinc-200 group-hover/h:opacity-100"
              >
                <ArrowUpRight size={13} />
              </button>
            }
          />
          <div className={`collapse-morph ${collapsed.has('favorites') ? '' : 'is-open'}`}>
            <div>
              {!favLoaded ? null : favorites.length > 0 ? (
                <FavoritesList
                  favorites={favorites}
                  t={t}
                  onOpen={(route) => route && navigate(route)}
                  onUnpin={removeFav}
                  onReorder={reorderFavs}
                  onMenu={favMenu}
                />
              ) : (
                <button
                  onClick={() => navigate('/favorites')}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] text-zinc-600 transition-colors hover:bg-highlight hover:text-zinc-400"
                >
                  <Star size={13} className="shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{t('fav.pinsEmpty')}</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* recent deep items — one-click return to a hub / title / canvas you were just in */}
        {deepRecents.length > 0 && (
          <div className="mt-4 border-t border-edge pt-4">
            <div className="group/recent mb-0.5 flex items-center gap-1 px-2 py-1">
              <span className="min-w-0 flex-1 select-none truncate text-[11px] font-semibold uppercase tracking-wider text-zinc-600">
                {t('nav.recent')}
              </span>
              <button
                onClick={() => removeHistory((e) => /^\/(project|canvas)\//.test(e.path))}
                title={t('nav.recentClear')}
                className="select-none text-[11px] font-medium text-zinc-600 opacity-0 transition-opacity duration-200 hover:text-zinc-300 group-hover/recent:opacity-100"
              >
                {t('nav.recentClear')}
              </button>
            </div>
            <div className="space-y-px">
              {deepRecents.map((e) => {
                const { icon: Icon, label } = routeMeta(e.path, t)
                const active = e.path.split('?')[0] === pathname
                return (
                  <button key={e.path} onClick={() => navigate(e.path)} className={`${rowClass(active)} w-full`}>
                    <Icon size={16} className={iconClass(active)} />
                    <span className="min-w-0 flex-1 truncate text-left">{e.title || label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {inHub ? (
          <div className="mt-4 border-t border-edge pt-4">
            <SectionHeader
              id="projects"
              label={sectionLabel('projects', 'nav.projects')}
              defaultLabel={t('nav.projects')}
              renameHint={t('sidebar.renameHint')}
              onRename={renameSection}
              right={
                <button
                  onClick={() => navigate('/projects?new=1')}
                  title={t('hub.new')}
                  className="rounded-lg p-0.5 text-zinc-500 transition-colors duration-200 hover:bg-highlight hover:text-zinc-200"
                >
                  <Plus size={14} />
                </button>
              }
            />
            <div className="space-y-px">
              {hubProjects
                .filter((p) => p.status !== 'archived')
                .map((p) => {
                  const active = pathname === `/project/${p.id}`
                  const isRenaming = renamingProject?.id === p.id
                  return (
                    <div
                      key={p.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => !isRenaming && navigate(`/project/${p.id}`)}
                      onKeyDown={(e) => e.key === 'Enter' && !isRenaming && navigate(`/project/${p.id}`)}
                      onContextMenu={(e) => projectMenu(e, p)}
                      className={`${rowClass(active)} cursor-pointer ${dropProject === p.id ? '!bg-accent/10 ring-1 ring-accent/70' : ''}`}
                      onDragOver={(e) => {
                        if (!dragHasMedia(e)) return
                        e.preventDefault()
                        e.dataTransfer.dropEffect = 'copy'
                        if (dropProject !== p.id) setDropProject(p.id)
                      }}
                      onDragLeave={(e) => {
                        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropProject((x) => (x === p.id ? null : x))
                      }}
                      onDrop={(e) => {
                        if (!dragHasMedia(e)) return
                        e.preventDefault()
                        setDropProject(null)
                        addMediaToProject(p.id, p.name, e)
                      }}
                    >
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: p.color || PROJECT_STATUS_COLORS[p.status] }} />
                      {isRenaming ? (
                        <input
                          autoFocus
                          value={renamingProject!.value}
                          onChange={(ev) => setRenamingProject({ id: p.id, value: ev.target.value })}
                          onClick={(ev) => ev.stopPropagation()}
                          onBlur={commitRenameProject}
                          onKeyDown={(ev) => {
                            ev.stopPropagation()
                            if (ev.key === 'Enter') commitRenameProject()
                            if (ev.key === 'Escape') setRenamingProject(null)
                          }}
                          className="min-w-0 flex-1 rounded border border-edge bg-field px-1 py-0.5 text-[13px] text-zinc-100 outline-none focus:border-accent"
                        />
                      ) : (
                        <>
                          <span className="min-w-0 flex-1 truncate">{p.name}</span>
                          <button
                            onClick={(e) => projectMenu(e, p)}
                            className="shrink-0 rounded p-0.5 text-zinc-500 opacity-0 transition-all hover:bg-highlight hover:text-zinc-200 group-hover/i:opacity-100"
                          >
                            <MoreHorizontal size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  )
                })}
            </div>
          </div>
        ) : (
          <div data-sortable-container className="mt-4 border-t border-edge pt-4">
            {orderedGroups.map((group, gi) => {
              const isCollapsed = collapsed.has(group.id)
              const items = groupItems(group.id)
              return (
                <Fragment key={group.id}>
                  {groupDrag.overIndex === gi && <div className="insert-line" />}
                  <div
                    data-sortable-item
                    className={`${gi > 0 ? 'mt-4 border-t border-edge pt-4' : ''} ${groupDrag.draggingId === group.id ? 'drag-taken' : ''}`}
                  >
                    <SectionHeader
                      id={group.id}
                      label={sectionLabel(group.id, group.key)}
                      defaultLabel={t(group.key)}
                      renameHint={t('sidebar.renameHint')}
                      onRename={renameSection}
                      collapsible
                      isCollapsed={isCollapsed}
                      onToggle={() => toggleGroup(group.id)}
                      onHandleDown={(e) => groupDrag.onHandleDown(e, group.id)}
                    />
                    <div className={`collapse-morph ${isCollapsed ? '' : 'is-open'}`}>
                      <div>
                        <div data-treesort-group={overlay ? undefined : group.id} className="space-y-px">
                          {items.map((link, i) =>
                            overlay ? (
                              navRow(link)
                            ) : (
                              <Fragment key={link.to}>
                                {itemSort.over?.group === group.id && itemSort.over.index === i && <div className="insert-line" />}
                                <div
                                  data-treesort-item={link.to}
                                  onMouseDown={(e) => itemSort.onPointerDown(e, link.to)}
                                  className={itemSort.dragId === link.to ? 'drag-taken' : ''}
                                >
                                  {navRow(link)}
                                </div>
                              </Fragment>
                            )
                          )}
                          {!overlay && itemSort.over?.group === group.id && itemSort.over.index === items.length && (
                            <div className="insert-line" />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </Fragment>
              )
            })}
            {groupDrag.overIndex === orderedGroups.length && <div className="insert-line" />}
          </div>
        )}
      </nav>

      {/* bottom: a quiet Корзина utility row + the Claude-style profile pill (Settings,
          Profile, Language, History, Statistics live in the profile menu) */}
      <div className="space-y-1 border-t border-edge px-2 py-2">
        <NavLink to="/trash" className={({ isActive }) => `${rowClass(isActive)} text-[13px]`}>
          <Trash2 size={16} className={iconClass(onTrash)} />
          <span className="min-w-0 flex-1 truncate">{t('nav.trash')}</span>
        </NavLink>
        <ProfileMenu active={onProfile} />
      </div>

      {!overlay && resizeHandle}
      {contextMenu}
    </aside>
  )

  // collapsed → just the rail, with the full sidebar sliding over content on hover.
  // The wrapper's onMouseLeave closes the peek (the overlay is its descendant, so
  // staying over the overlay keeps it open; moving onto the content closes it).
  // collapsed → the sidebar fully hides (Notion-style), giving the page the whole width
  // (a big win on Graph/Canvas, which carry their own sidebar). A thin strip at the very
  // left edge summons it as a hover-peek; the always-visible toggle in the content TopBar
  // (Layout) re-opens it for keeps. Ctrl+B toggles too.
  // The in-flow panel is ALWAYS mounted (first child) so React keeps the same <aside>
  // node across collapse/expand — its width then morphs 0 ↔ full with a soft transition
  // instead of snapping. Collapsed it rests at width 0 (clipped, no border); a thin
  // left-edge strip summons the hover-peek overlay, which floats over the canvas.
  return (
    <>
      {fullAside(false)}
      {compact && (
        <div className="relative h-full w-0 shrink-0" onMouseLeave={closePeek}>
          <div
            onMouseEnter={openPeek}
            onClick={toggleSidebar}
            title={`${t('app.toggleSidebar')} · Ctrl+B`}
            data-tip-cursor=""
            className="group/peek absolute left-0 top-0 z-30 h-full w-2 cursor-pointer"
          >
            <div className="absolute left-0 top-0 h-full w-px bg-transparent transition-colors duration-200 group-hover/peek:bg-accent/50" />
          </div>
          {fullAside(true)}
        </div>
      )}
    </>
  )
}
