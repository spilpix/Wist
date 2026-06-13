import { useState } from 'react'
import { NavLink, useSearchParams } from 'react-router-dom'
import {
  Archive,
  BarChart3,
  Bookmark,
  BookOpen,
  CalendarDays,
  ChevronDown,
  Clock,
  FolderOpen,
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

const mainLinks: Link[] = [
  { to: '/', key: 'nav.home', icon: Home },
  { to: '/library', key: 'nav.library', icon: Library },
  { to: '/library?type=book', key: 'nav.books', icon: BookOpen },
  { to: '/continue', key: 'nav.continue', icon: Clock },
  { to: '/favorites', key: 'nav.favorites', icon: Heart },
]

const GROUPS: Array<{ key: TKey; id: string; links: Link[] }> = [
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

function linkClass(isActive: boolean): string {
  return [
    'flex items-center gap-2.5 rounded-lg px-3 py-[7px] text-[13px] font-medium transition-colors',
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
  const onLibrary = location.hash.split('?')[0].endsWith('/library')
  const [collapsed, setCollapsed] = useState<Set<string>>(loadCollapsed)

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

  return (
    <aside className="flex h-full w-[200px] shrink-0 flex-col border-r border-edge/60 bg-surface">
      <nav className="flex-1 space-y-4 overflow-y-auto px-3 pb-4 pt-4">
        <div className="space-y-0.5">
          {mainLinks.map(({ to, key, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) => {
                if (to === '/library') return linkClass(onLibrary && activeType !== 'book')
                if (to === '/library?type=book') return linkClass(onLibrary && activeType === 'book')
                return linkClass(isActive)
              }}
            >
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
                    <NavLink key={to} to={to} className={({ isActive }) => linkClass(isActive)}>
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
          <NavLink key={to} to={to} className={({ isActive }) => linkClass(isActive)}>
            <Icon size={15} />
            {t(key)}
          </NavLink>
        ))}
      </div>
    </aside>
  )
}
