import { useState } from 'react'
import { NavLink, useLocation, useSearchParams } from 'react-router-dom'
import {
  Archive,
  BarChart3,
  Bookmark,
  BookOpen,
  CalendarDays,
  ChevronDown,
  Clock,
  FolderOpen,
  Gamepad2,
  Heart,
  Home,
  Library,
  ListTodo,
  Music,
  PenLine,
  Settings,
  TreePine,
  Youtube,
} from 'lucide-react'
import { useI18n, type TKey } from '../i18n'

interface Link {
  to: string
  key: TKey
  icon: typeof Home
}

// Home stands alone at the top; everything else lives in a labelled domain group
const topLinks: Link[] = [{ to: '/', key: 'nav.home', icon: Home }]

const GROUPS: Array<{ key: TKey; id: string; links: Link[] }> = [
  {
    key: 'nav.media',
    id: 'media',
    links: [
      { to: '/library', key: 'nav.library', icon: Library },
      { to: '/library?type=book', key: 'nav.books', icon: BookOpen },
      { to: '/continue', key: 'nav.continue', icon: Clock },
      { to: '/favorites', key: 'nav.favorites', icon: Heart },
    ],
  },
  {
    key: 'nav.memory',
    id: 'memory',
    links: [
      { to: '/notes', key: 'nav.notes', icon: PenLine },
      { to: '/journal', key: 'nav.journal', icon: CalendarDays },
      { to: '/moments', key: 'nav.moments', icon: Bookmark },
      { to: '/tree', key: 'nav.tree', icon: TreePine },
    ],
  },
  {
    key: 'nav.tools',
    id: 'tools',
    links: [
      { to: '/tasks', key: 'nav.tasks', icon: ListTodo },
      { to: '/vault', key: 'nav.vault', icon: Archive },
      { to: '/music', key: 'nav.music', icon: Music },
      { to: '/league', key: 'nav.league', icon: Gamepad2 },
    ],
  },
  {
    key: 'nav.sources',
    id: 'sources',
    links: [
      { to: '/local', key: 'nav.localFiles', icon: FolderOpen },
      { to: '/youtube', key: 'nav.youtube', icon: Youtube },
    ],
  },
]

const bottomLinks: Link[] = [
  { to: '/stats', key: 'nav.statistics', icon: BarChart3 },
  { to: '/settings', key: 'nav.settings', icon: Settings },
]

function linkClass(isActive: boolean, compact = false): string {
  return [
    'flex items-center rounded-lg text-[13px] font-medium transition-colors',
    compact ? 'justify-center px-0 py-2' : 'gap-2.5 px-3 py-[7px]',
    isActive ? 'bg-accent/15 text-accent-bright' : 'text-zinc-400 hover:bg-raised hover:text-zinc-200',
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
  const pathname = useLocation().pathname
  const onLibrary = pathname.split('?')[0].endsWith('/library')
  // collapse to a compact icon rail on the graph page (Obsidian-style two-level nav)
  const compact = pathname.startsWith('/tree')
  const [collapsed, setCollapsed] = useState<Set<string>>(loadCollapsed)

  // Library and Books share the /library route — disambiguate active state by ?type
  const activeClass = (to: string, isActive: boolean, isCompact = false): string => {
    if (to === '/library') return linkClass(onLibrary && activeType !== 'book', isCompact)
    if (to === '/library?type=book') return linkClass(onLibrary && activeType === 'book', isCompact)
    return linkClass(isActive, isCompact)
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

  // ---- compact icon rail ----
  if (compact) {
    const railLink = ({ to, key, icon: Icon }: Link) => (
      <NavLink
        key={to}
        to={to}
        end={to === '/'}
        title={t(key)}
        className={({ isActive }) => activeClass(to, isActive, true)}
      >
        <Icon size={17} />
      </NavLink>
    )
    return (
      <aside className="flex h-full w-[58px] shrink-0 flex-col border-r border-edge/60 bg-surface transition-all">
        <nav className="flex-1 space-y-1 overflow-y-auto px-2 pb-4 pt-4">
          {topLinks.map(railLink)}
          {GROUPS.map((group) => (
            <div key={group.id} className="space-y-1 border-t border-edge/50 pt-1">
              {group.links.map(railLink)}
            </div>
          ))}
        </nav>
        <div className="space-y-1 border-t border-edge/60 px-2 py-3">{bottomLinks.map(railLink)}</div>
      </aside>
    )
  }

  // ---- full sidebar ----
  return (
    <aside className="flex h-full w-[200px] shrink-0 flex-col border-r border-edge/60 bg-surface transition-all">
      <nav className="flex-1 space-y-4 overflow-y-auto px-3 pb-4 pt-4">
        <div className="space-y-0.5">
          {topLinks.map(({ to, key, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => activeClass(to, isActive)}>
              <Icon size={15} />
              {t(key)}
            </NavLink>
          ))}
        </div>

        {GROUPS.map((group) => {
          const isCollapsed = collapsed.has(group.id)
          return (
            <div key={group.id}>
              <button
                onClick={() => toggleGroup(group.id)}
                className="mb-1 flex w-full items-center justify-between rounded-md px-3 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-600 transition-colors hover:text-zinc-400"
              >
                {t(group.key)}
                <ChevronDown size={11} className={`transition-transform ${isCollapsed ? '-rotate-90' : ''}`} />
              </button>
              {!isCollapsed && (
                <div className="space-y-0.5">
                  {group.links.map(({ to, key, icon: Icon }) => (
                    <NavLink key={to} to={to} className={({ isActive }) => activeClass(to, isActive)}>
                      <Icon size={15} />
                      {t(key)}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </nav>

      <div className="space-y-0.5 border-t border-edge/60 px-3 py-3">
        {bottomLinks.map(({ to, key, icon: Icon }) => (
          <NavLink key={to} to={to} className={({ isActive }) => activeClass(to, isActive)}>
            <Icon size={15} />
            {t(key)}
          </NavLink>
        ))}
      </div>
    </aside>
  )
}
