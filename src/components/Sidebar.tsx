import { useEffect, useState } from 'react'
import { NavLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import {
  Archive,
  BarChart3,
  BookOpen,
  Bookmark,
  CalendarDays,
  Check,
  ChevronDown,
  FolderKanban,
  Frame,
  Gamepad2,
  Home,
  Library,
  ListTodo,
  Music,
  PenLine,
  Pin,
  Search,
  Settings,
  Share2,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import BardLogo from './BardLogo'
import { useUiStore } from '../store/uiStore'
import { useI18n, type TKey } from '../i18n'

interface Link {
  to: string
  key: TKey
  icon: typeof Home
}

const GROUPS: Array<{ key: TKey; id: string; links: Link[] }> = [
  {
    key: 'nav.life',
    id: 'life',
    links: [
      { to: '/journal', key: 'nav.journal', icon: CalendarDays },
      { to: '/tasks', key: 'nav.tasks', icon: ListTodo },
      { to: '/moments', key: 'nav.moments', icon: Bookmark },
    ],
  },
  {
    key: 'nav.content',
    id: 'content',
    links: [
      { to: '/library', key: 'nav.library', icon: Library },
      { to: '/library?type=book', key: 'nav.books', icon: BookOpen },
      { to: '/music', key: 'nav.music', icon: Music },
      { to: '/games', key: 'nav.games', icon: Gamepad2 },
    ],
  },
  {
    key: 'nav.work',
    id: 'work',
    links: [
      { to: '/projects', key: 'nav.projects', icon: FolderKanban },
      { to: '/notes', key: 'nav.notes', icon: PenLine },
      { to: '/canvas', key: 'nav.canvas', icon: Frame },
      { to: '/vault', key: 'nav.vault', icon: Archive },
      { to: '/tree', key: 'nav.tree', icon: Share2 },
    ],
  },
]

// flat lookup of every pinnable page → its icon/label
const ALL_LINKS: Record<string, Link> = {}
for (const g of GROUPS) for (const l of g.links) ALL_LINKS[l.to] = l

const bottomLinks: Link[] = [
  { to: '/stats', key: 'nav.statistics', icon: BarChart3 },
  { to: '/settings', key: 'nav.settings', icon: Settings },
]

/** Row style for a navigation item (full sidebar). */
function rowClass(active: boolean): string {
  return [
    'group/i relative flex items-center rounded-md text-[14px] transition-colors duration-150',
    active ? 'bg-zinc-500/[0.18] font-medium text-zinc-100' : 'text-zinc-300 hover:bg-zinc-500/[0.12] hover:text-zinc-100',
  ].join(' ')
}

function iconClass(active: boolean): string {
  return active ? 'shrink-0 text-zinc-200' : 'shrink-0 text-zinc-500 group-hover/i:text-zinc-300'
}

function railClass(active: boolean): string {
  return [
    'group/i relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors',
    active ? 'bg-zinc-500/[0.22] text-zinc-100' : 'text-zinc-400 hover:bg-zinc-500/[0.12] hover:text-zinc-100',
  ].join(' ')
}

function loadSet(key: string, fallback: string[]): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? 'null')
    if (Array.isArray(v)) return v.filter((x) => typeof x === 'string')
  } catch {
    /* ignore */
  }
  return fallback
}

export default function Sidebar() {
  const [searchParams] = useSearchParams()
  const activeType = searchParams.get('type')
  const { t } = useI18n()
  const navigate = useNavigate()
  const pathname = useLocation().pathname
  const onLibrary = pathname === '/library'
  const compact = useUiStore((s) => s.sidebarCollapsed)
  const setPalette = useUiStore((s) => s.setPalette)
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(loadSet('wist.sidebarCollapsed', [])))
  // normalize once at load: de-dupe + drop any route that isn't a real pinnable page,
  // so the tab bar and the left-nav dedup never disagree (a phantom entry could hide a link)
  const [pinned, setPinned] = useState<string[]>(() =>
    [...new Set(loadSet('wist.pinnedTabs', ['/journal', '/tasks']))].filter((to) => ALL_LINKS[to])
  )
  const [taskCount, setTaskCount] = useState(0)
  const [customizeOpen, setCustomizeOpen] = useState(false)

  // live open-task count → Notion-style inbox badge on the Tasks tab
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

  const isLinkActive = (to: string, routeActive: boolean): boolean => {
    if (to === '/library') return onLibrary && activeType !== 'book'
    if (to === '/library?type=book') return onLibrary && activeType === 'book'
    return routeActive
  }

  const persist = (key: string, next: string[]) => {
    try {
      localStorage.setItem(key, JSON.stringify(next))
    } catch {
      /* storage unavailable */
    }
  }

  const toggleGroup = (id: string) => {
    const next = new Set(collapsed)
    next.has(id) ? next.delete(id) : next.add(id)
    setCollapsed(next)
    persist('wist.sidebarCollapsed', [...next])
  }

  const pin = (to: string) =>
    setPinned((prev) => {
      if (prev.includes(to)) return prev
      const next = [...prev, to]
      persist('wist.pinnedTabs', next)
      return next
    })
  const unpin = (to: string) =>
    setPinned((prev) => {
      const next = prev.filter((x) => x !== to)
      persist('wist.pinnedTabs', next)
      return next
    })
  const togglePin = (to: string) => (pinned.includes(to) ? unpin(to) : pin(to))

  // pinned tabs (resolved to real links), and groups with pinned items removed
  const pinnedLinks = pinned.map((to) => ALL_LINKS[to]).filter(Boolean) as Link[]
  const navGroups = GROUPS.map((g) => ({ ...g, links: g.links.filter((l) => !pinned.includes(l.to)) })).filter((g) => g.links.length)

  // ================= compact icon rail =================
  if (compact) {
    const railItem = ({ to, key, icon: Icon }: Link) => (
      <NavLink key={to} to={to} title={t(key)} className={({ isActive }) => railClass(isLinkActive(to, isActive))}>
        <Icon size={18} />
        {to === '/tasks' && taskCount > 0 && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-accent ring-2 ring-surface" />}
      </NavLink>
    )
    return (
      <aside className="flex h-full w-[56px] shrink-0 flex-col border-r border-edge/60 bg-surface transition-all duration-200">
        <div className="flex h-12 items-center justify-center border-b border-edge/50">
          <BardLogo size={20} />
        </div>
        <nav className="flex flex-1 flex-col items-center gap-1 overflow-y-auto px-2 pb-4 pt-3">
          <NavLink to="/" end title={t('nav.home')} className={({ isActive }) => railClass(isActive)}>
            <Home size={18} />
          </NavLink>
          <button title={t('cmdk.searchHint')} onClick={() => setPalette(true)} className={railClass(false)}>
            <Search size={18} />
          </button>
          {pinnedLinks.length > 0 && (
            <div className="flex w-full flex-col items-center gap-1 border-t border-edge/50 pt-2">{pinnedLinks.map(railItem)}</div>
          )}
          {navGroups.map((group) => (
            <div key={group.id} className="mt-1 flex w-full flex-col items-center gap-1 border-t border-edge/50 pt-2">
              {group.links.map(railItem)}
            </div>
          ))}
        </nav>
        <div className="flex flex-col items-center gap-1 border-t border-edge/60 px-2 py-3">
          {bottomLinks.map(({ to, key, icon: Icon }) => (
            <NavLink key={to} to={to} title={t(key)} className={({ isActive }) => railClass(isActive)}>
              <Icon size={18} />
            </NavLink>
          ))}
        </div>
      </aside>
    )
  }

  // ================= full sidebar =================
  return (
    <aside className="flex h-full w-[240px] shrink-0 flex-col border-r border-edge/60 bg-surface transition-all duration-200">
      {/* workspace brand (no search — search lives in the tab bar + Ctrl+K) */}
      <div className="flex items-center gap-2 px-4 pb-1 pt-3">
        <BardLogo size={20} />
        <span className="text-[14px] font-semibold tracking-tight text-zinc-100">Bard</span>
      </div>

      {/* quick tab bar — active tab shows icon+label (pill), the rest are icons.
          Home is fixed; pinned pages follow; Search sits apart on the right. */}
      <div className="flex items-center gap-1 px-2.5 pb-1.5 pt-1">
        <div className="no-scrollbar flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {/* Home (fixed) */}
          <button
            title={t('nav.home')}
            onClick={() => navigate('/')}
            className={`flex h-9 shrink-0 items-center gap-2 rounded-lg transition-colors ${
              pathname === '/' ? 'bg-zinc-500/[0.22] px-2.5 font-medium text-zinc-100' : 'w-9 justify-center text-zinc-400 hover:bg-zinc-500/[0.12] hover:text-zinc-100'
            }`}
          >
            <Home size={17} className="shrink-0" />
            {pathname === '/' && <span className="text-[13px]">{t('nav.home')}</span>}
          </button>

          {/* pinned pages */}
          {pinnedLinks.map(({ to, key, icon: Icon }) => {
            const base = to.split('?')[0]
            const active = isLinkActive(to, pathname === base || pathname.startsWith(base + '/'))
            return (
              <div key={to} className="group/tab relative shrink-0">
                <button
                  title={t(key)}
                  onClick={() => navigate(to)}
                  className={`flex h-9 items-center gap-2 rounded-lg transition-colors ${
                    active ? 'bg-zinc-500/[0.22] px-2.5 font-medium text-zinc-100' : 'w-9 justify-center text-zinc-400 hover:bg-zinc-500/[0.12] hover:text-zinc-100'
                  }`}
                >
                  <Icon size={17} className="shrink-0" />
                  {active && <span className="whitespace-nowrap text-[13px]">{t(key)}</span>}
                  {to === '/tasks' && taskCount > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold leading-none text-[#fff] ring-2 ring-surface transition-opacity group-hover/tab:opacity-0">
                      {taskCount > 99 ? '99+' : taskCount}
                    </span>
                  )}
                </button>
                <button
                  title={t('nav.unpinTab')}
                  onClick={() => unpin(to)}
                  className="absolute -right-1.5 -top-1.5 hidden h-4 w-4 items-center justify-center rounded-full bg-edge text-zinc-300 ring-2 ring-surface hover:bg-red-500/30 hover:text-red-300 group-hover/tab:flex"
                >
                  <X size={9} />
                </button>
              </div>
            )
          })}
        </div>

        {/* customize the tab bar */}
        <div className="relative shrink-0">
          <button
            title={t('nav.customizeTabs')}
            onClick={() => setCustomizeOpen((v) => !v)}
            className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
              customizeOpen ? 'bg-zinc-500/[0.22] text-zinc-100' : 'text-zinc-400 hover:bg-zinc-500/[0.12] hover:text-zinc-100'
            }`}
          >
            <SlidersHorizontal size={16} />
          </button>
          {customizeOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setCustomizeOpen(false)} />
              <div
                className="absolute right-0 top-[calc(100%+6px)] z-50 max-h-[60vh] w-[212px] overflow-y-auto rounded-xl border border-edge bg-card p-1.5"
                style={{ boxShadow: 'var(--palette-shadow)' }}
              >
                <div className="px-2 pb-1 pt-0.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{t('nav.customizeTabs')}</div>
                {Object.values(ALL_LINKS).map(({ to, key, icon: Icon }) => {
                  const on = pinned.includes(to)
                  return (
                    <button
                      key={to}
                      onClick={() => togglePin(to)}
                      className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[13px] text-zinc-300 transition-colors hover:bg-zinc-500/[0.12]"
                    >
                      <Icon size={15} className="shrink-0 text-zinc-500" />
                      <span className="min-w-0 flex-1 truncate">{t(key)}</span>
                      {on ? <Check size={14} className="shrink-0 text-accent-bright" /> : <Pin size={12} className="shrink-0 text-zinc-600" />}
                    </button>
                  )
                })}
              </div>
            </>
          )}
        </div>

        {/* search — sits apart on the right */}
        <button
          title={t('cmdk.searchHint')}
          onClick={() => setPalette(true)}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-500/[0.12] hover:text-zinc-100"
        >
          <Search size={17} />
        </button>
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto px-2.5 pb-4 pt-2">
        {navGroups.map((group) => {
          const isCollapsed = collapsed.has(group.id)
          return (
            <div key={group.id}>
              <button
                onClick={() => toggleGroup(group.id)}
                className="group/h mb-0.5 flex w-full items-center gap-1 rounded px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-zinc-500 transition-colors hover:text-zinc-300"
              >
                {t(group.key)}
                <ChevronDown
                  size={12}
                  className={`ml-auto text-zinc-600 transition-all duration-150 ${
                    isCollapsed ? '-rotate-90 opacity-100' : 'opacity-0 group-hover/h:opacity-100'
                  }`}
                />
              </button>
              {!isCollapsed && (
                <div className="space-y-px">
                  {group.links.map(({ to, key, icon: Icon }) => (
                    <div key={to} className={rowClass(false)}>
                      <NavLink to={to} className="flex min-w-0 flex-1 items-center gap-2.5 px-2 py-1">
                        {({ isActive }) => {
                          const active = isLinkActive(to, isActive)
                          return (
                            <>
                              <Icon size={17} className={iconClass(active)} />
                              <span className="min-w-0 flex-1 truncate">{t(key)}</span>
                              {to === '/tasks' && taskCount > 0 && <span className="shrink-0 text-[11px] font-medium text-zinc-500">{taskCount}</span>}
                            </>
                          )
                        }}
                      </NavLink>
                      <button
                        title={t('nav.pinTab')}
                        onClick={() => pin(to)}
                        className="mr-1 hidden shrink-0 rounded p-1 text-zinc-500 hover:bg-zinc-500/20 hover:text-zinc-200 group-hover/i:block"
                      >
                        <Pin size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </nav>

      <div className="space-y-px border-t border-edge/60 px-2.5 py-2.5">
        {bottomLinks.map(({ to, key, icon: Icon }) => (
          <NavLink key={to} to={to} className={({ isActive }) => `${rowClass(isActive)} px-2 py-1`}>
            {({ isActive }) => (
              <>
                <Icon size={17} className={iconClass(isActive)} />
                <span className="truncate">{t(key)}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </aside>
  )
}
