import { useEffect, useState } from 'react'
import { NavLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import {
  Archive,
  BarChart3,
  BookOpen,
  Bookmark,
  CalendarDays,
  ChevronDown,
  ChevronsUpDown,
  FolderKanban,
  Frame,
  Gamepad2,
  Home,
  Library,
  ListTodo,
  Music,
  PenLine,
  Search,
  Settings,
  Share2,
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

const bottomLinks: Link[] = [
  { to: '/stats', key: 'nav.statistics', icon: BarChart3 },
  { to: '/settings', key: 'nav.settings', icon: Settings },
]

/** Row style for a navigation item (full sidebar). Monochrome, Notion-style:
 *  a quiet neutral highlight when active — the accent is reserved for signals. */
function rowClass(active: boolean): string {
  return [
    'group/i flex items-center gap-2.5 rounded-md px-2 py-1 text-[14px] transition-colors duration-150',
    // zinc-500 alpha flips with the theme (lightens on dark, darkens on light) so the
    // neutral highlight stays perceptible in BOTH themes — unlike a fixed white alpha.
    active ? 'bg-zinc-500/[0.18] font-medium text-zinc-100' : 'text-zinc-300 hover:bg-zinc-500/[0.12] hover:text-zinc-100',
  ].join(' ')
}

/** Icon style inside a row / rail item. */
function iconClass(active: boolean): string {
  return active ? 'shrink-0 text-zinc-200' : 'shrink-0 text-zinc-500 group-hover/i:text-zinc-300'
}

/** Square icon button for the collapsed rail. */
function railClass(active: boolean): string {
  return [
    'group/i relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors',
    active ? 'bg-zinc-500/[0.22] text-zinc-100' : 'text-zinc-400 hover:bg-zinc-500/[0.12] hover:text-zinc-100',
  ].join(' ')
}

function loadCollapsed(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem('wist.sidebarCollapsed') ?? '[]'))
  } catch {
    return new Set()
  }
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
  const [collapsed, setCollapsed] = useState<Set<string>>(loadCollapsed)
  const [taskCount, setTaskCount] = useState(0)

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

  // resolve the "real" active state (library shares one path between titles & books)
  const isLinkActive = (to: string, routeActive: boolean): boolean => {
    if (to === '/library') return onLibrary && activeType !== 'book'
    if (to === '/library?type=book') return onLibrary && activeType === 'book'
    return routeActive
  }

  const toggleGroup = (id: string) => {
    const next = new Set(collapsed)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setCollapsed(next)
    try {
      localStorage.setItem('wist.sidebarCollapsed', JSON.stringify([...next]))
    } catch {
      /* storage unavailable */
    }
  }

  // ---- quick tab bar (Notion's app-level row: Home · Search · Calendar · Inbox) ----
  const tabs: Array<{ icon: typeof Home; label: string; to?: string; action?: () => void; active?: boolean; badge?: number }> = [
    { icon: Home, label: t('nav.home'), to: '/', active: pathname === '/' },
    { icon: Search, label: t('cmdk.searchHint'), action: () => setPalette(true) },
    { icon: CalendarDays, label: t('nav.journal'), to: '/journal', active: pathname.startsWith('/journal') },
    { icon: ListTodo, label: t('nav.tasks'), to: '/tasks', active: pathname.startsWith('/tasks'), badge: taskCount },
  ]

  // ================= compact icon rail =================
  if (compact) {
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
          {GROUPS.map((group) => (
            <div key={group.id} className="mt-1 flex w-full flex-col items-center gap-1 border-t border-edge/50 pt-2">
              {group.links.map(({ to, key, icon: Icon }) => (
                <NavLink key={to} to={to} title={t(key)} className={({ isActive }) => railClass(isLinkActive(to, isActive))}>
                  <Icon size={18} />
                  {to === '/tasks' && taskCount > 0 && (
                    <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-accent ring-2 ring-surface" />
                  )}
                </NavLink>
              ))}
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
      {/* workspace switcher */}
      <div className="px-2 pt-2.5">
        <button
          onClick={() => setPalette(true)}
          title={t('cmdk.searchHint')}
          className="group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-zinc-500/[0.12]"
        >
          <BardLogo size={20} />
          <span className="text-[14px] font-semibold tracking-tight text-zinc-100">Bard</span>
          <ChevronsUpDown size={13} className="ml-auto text-zinc-500 opacity-0 transition-opacity group-hover:opacity-100" />
        </button>
      </div>

      {/* quick tab bar */}
      <div className="flex items-center gap-1 px-2.5 pb-1.5 pt-1">
        {tabs.map((tab) => (
          <button
            key={tab.to ?? tab.label}
            title={tab.label}
            onClick={() => (tab.to ? navigate(tab.to) : tab.action?.())}
            className={`relative flex h-9 flex-1 items-center justify-center rounded-lg transition-colors ${
              tab.active ? 'bg-zinc-500/[0.22] text-zinc-100' : 'text-zinc-400 hover:bg-zinc-500/[0.12] hover:text-zinc-100'
            }`}
          >
            <tab.icon size={17} />
            {tab.badge ? (
              <span className="absolute -right-1 -top-1 flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold leading-none text-[#fff] ring-2 ring-surface">
                {tab.badge > 99 ? '99+' : tab.badge}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto px-2.5 pb-4 pt-2">
        {GROUPS.map((group) => {
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
                    <NavLink key={to} to={to} className={({ isActive }) => rowClass(isLinkActive(to, isActive))}>
                      {({ isActive }) => {
                        const active = isLinkActive(to, isActive)
                        return (
                          <>
                            <Icon size={17} className={iconClass(active)} />
                            <span className="min-w-0 flex-1 truncate">{t(key)}</span>
                            {to === '/tasks' && taskCount > 0 && (
                              <span className="shrink-0 text-[11px] font-medium text-zinc-500">{taskCount}</span>
                            )}
                          </>
                        )
                      }}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </nav>

      <div className="space-y-px border-t border-edge/60 px-2.5 py-2.5">
        {bottomLinks.map(({ to, key, icon: Icon }) => (
          <NavLink key={to} to={to} className={({ isActive }) => rowClass(isActive)}>
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
