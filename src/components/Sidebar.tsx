import { useEffect, useState } from 'react'
import { NavLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import {
  Archive,
  BarChart3,
  BookOpen,
  Bookmark,
  CalendarDays,
  ChevronDown,
  FolderKanban,
  Frame,
  Gamepad2,
  Home,
  Library,
  ListTodo,
  Music,
  PenLine,
  Plus,
  Search,
  Settings,
  Share2,
  Trash2,
} from 'lucide-react'
import BardLogo from './BardLogo'
import { useUiStore } from '../store/uiStore'
import { toast } from '../store/toastStore'
import { PROJECT_STATUS_COLORS, type Project } from '../types/models'
import { useI18n, type TKey } from '../i18n'

interface Link {
  to: string
  key: TKey
  icon: typeof Home
}

// Дом (personal world): life + content
const HOME_GROUPS: Array<{ key: TKey; id: string; links: Link[] }> = [
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
]

// Хаб (creative/work world): the work tools that live alongside the hub list
const HUB_TOOLS: Link[] = [
  { to: '/notes', key: 'nav.notes', icon: PenLine },
  { to: '/canvas', key: 'nav.canvas', icon: Frame },
  { to: '/vault', key: 'nav.vault', icon: Archive },
  { to: '/tree', key: 'nav.tree', icon: Share2 },
]

const bottomLinks: Link[] = [
  { to: '/stats', key: 'nav.statistics', icon: BarChart3 },
  { to: '/settings', key: 'nav.settings', icon: Settings },
]

function rowClass(active: boolean): string {
  return [
    'group/i flex items-center gap-2.5 rounded-md px-2 py-1 text-[14px] transition-colors duration-150',
    active ? 'bg-zinc-500/[0.18] font-medium text-zinc-100' : 'text-zinc-300 hover:bg-zinc-500/[0.12] hover:text-zinc-100',
  ].join(' ')
}
function iconClass(active: boolean): string {
  return active ? 'shrink-0 text-zinc-200' : 'shrink-0 text-zinc-500 group-hover/i:text-zinc-300'
}
function railClass(active: boolean): string {
  return [
    'relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors',
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
  const [hubProjects, setHubProjects] = useState<Project[]>([])

  // quick capture (task / note) — no page switch
  const [quickOpen, setQuickOpen] = useState(false)
  const [quickKind, setQuickKind] = useState<'task' | 'note'>('task')
  const [quickText, setQuickText] = useState('')
  const [quickBusy, setQuickBusy] = useState(false)

  // which "world" are we in? Хаб = projects + work tools; Дом = everything else.
  const inHub = pathname.startsWith('/project') || pathname.startsWith('/notes') || pathname.startsWith('/canvas') || pathname.startsWith('/vault') || pathname.startsWith('/tree')
  const onTrash = pathname === '/trash'
  const inHome = !inHub && !onTrash

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
    if (to === '/library') return onLibrary && activeType !== 'book'
    if (to === '/library?type=book') return onLibrary && activeType === 'book'
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

  const quickSubmit = async () => {
    const v = quickText.trim()
    if (!v || quickBusy) return
    setQuickBusy(true)
    setQuickText('')
    try {
      if (quickKind === 'task') await window.wist.tasks.create({ title: v })
      else await window.wist.notes.create({ content: v })
      toast(t('quick.added'), 'success')
    } catch (e) {
      console.error('quick create failed', e)
      toast(t('quick.failed'), 'error')
    } finally {
      setQuickBusy(false)
    }
  }

  const navRow = ({ to, key, icon: Icon }: Link) => (
    <NavLink key={to} to={to} className={({ isActive }) => rowClass(isLinkActive(to, isActive))}>
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
  )

  // ================= compact icon rail =================
  if (compact) {
    return (
      <aside className="flex h-full w-[56px] shrink-0 flex-col border-r border-edge/60 bg-surface transition-all duration-200">
        <div className="flex h-12 items-center justify-center border-b border-edge/50">
          <BardLogo size={20} />
        </div>
        <nav className="flex flex-1 flex-col items-center gap-1 overflow-y-auto px-2 pb-4 pt-3">
          <NavLink to="/" end title={t('nav.home')} className={() => railClass(inHome)}>
            <Home size={18} />
          </NavLink>
          <NavLink to="/projects" title={t('nav.hub')} className={() => railClass(inHub)}>
            <FolderKanban size={18} />
          </NavLink>
          <NavLink to="/trash" title={t('nav.trash')} className={() => railClass(onTrash)}>
            <Trash2 size={18} />
          </NavLink>
          <button title={t('cmdk.searchHint')} onClick={() => setPalette(true)} className={railClass(false)}>
            <Search size={18} />
          </button>
          <div className="mt-1 flex w-full flex-col items-center gap-1 border-t border-edge/50 pt-2">
            {(inHub ? HUB_TOOLS : HOME_GROUPS.flatMap((g) => g.links)).map(({ to, key, icon: Icon }) => (
              <NavLink key={to} to={to} title={t(key)} className={({ isActive }) => railClass(isLinkActive(to, isActive))}>
                <Icon size={18} />
                {to === '/tasks' && taskCount > 0 && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-accent ring-2 ring-surface" />}
              </NavLink>
            ))}
          </div>
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
  const tabPill = 'flex h-9 shrink-0 items-center gap-2 rounded-lg px-2.5 font-medium text-zinc-100 bg-zinc-500/[0.22]'
  const tabIcon = 'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-500/[0.12] hover:text-zinc-100'

  return (
    <aside className="flex h-full w-[240px] shrink-0 flex-col border-r border-edge/60 bg-surface transition-all duration-200">
      {/* workspace brand */}
      <div className="flex items-center gap-2 px-4 pb-1 pt-3">
        <BardLogo size={20} />
        <span className="text-[14px] font-semibold tracking-tight text-zinc-100">Bard</span>
      </div>

      {/* tab bar — Дом / Хаб / Корзина (active = icon+label); quick-add + search on the right */}
      <div className="flex items-center gap-1 px-2.5 pb-1.5 pt-1">
        <div className="no-scrollbar flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          <button title={t('nav.home')} onClick={() => navigate('/')} className={inHome ? tabPill : tabIcon}>
            <Home size={17} className="shrink-0" />
            {inHome && <span className="text-[13px]">{t('nav.home')}</span>}
          </button>
          <button title={t('nav.hub')} onClick={() => navigate('/projects')} className={inHub ? tabPill : tabIcon}>
            <FolderKanban size={17} className="shrink-0" />
            {inHub && <span className="whitespace-nowrap text-[13px]">{t('nav.hub')}</span>}
          </button>
          <button title={t('nav.trash')} onClick={() => navigate('/trash')} className={onTrash ? tabPill : tabIcon}>
            <Trash2 size={17} className="shrink-0" />
            {onTrash && <span className="whitespace-nowrap text-[13px]">{t('nav.trash')}</span>}
          </button>
        </div>

        {/* quick add (task / note, inline) */}
        <div className="relative shrink-0">
          <button
            title={t('nav.quickAdd')}
            onClick={() => setQuickOpen((v) => !v)}
            className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
              quickOpen ? 'bg-zinc-500/[0.22] text-zinc-100' : 'text-zinc-400 hover:bg-zinc-500/[0.12] hover:text-zinc-100'
            }`}
          >
            <Plus size={18} />
          </button>
          {quickOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setQuickOpen(false)} />
              <div className="absolute right-0 top-[calc(100%+6px)] z-50 w-[228px] rounded-xl border border-edge bg-card p-2" style={{ boxShadow: 'var(--palette-shadow)' }}>
                <div className="mb-2 flex gap-0.5 rounded-lg bg-surface p-0.5">
                  {(['task', 'note'] as const).map((k) => (
                    <button
                      key={k}
                      onClick={() => setQuickKind(k)}
                      className={`flex-1 rounded-md px-2 py-1 text-[12px] font-medium transition-colors ${
                        quickKind === k ? 'bg-raised text-zinc-100 shadow-sm' : 'text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      {t(k === 'task' ? 'nav.tasks' : 'nav.notes')}
                    </button>
                  ))}
                </div>
                <input
                  autoFocus
                  value={quickText}
                  onChange={(e) => setQuickText(e.target.value)}
                  placeholder={t(quickKind === 'task' ? 'quick.taskPh' : 'quick.notePh')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') quickSubmit()
                    if (e.key === 'Escape') setQuickOpen(false)
                  }}
                  className="w-full rounded-lg border border-edge bg-field px-2.5 py-1.5 text-[13px] text-zinc-200 outline-none placeholder:text-zinc-500 focus:border-accent"
                />
                <button onClick={quickSubmit} disabled={!quickText.trim() || quickBusy} className="btn-accent mt-2 w-full !py-1.5 text-[13px]">
                  {t('common.add')}
                </button>
              </div>
            </>
          )}
        </div>

        {/* search — apart on the right */}
        <button title={t('cmdk.searchHint')} onClick={() => setPalette(true)} className={tabIcon}>
          <Search size={17} />
        </button>
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto px-2.5 pb-4 pt-2">
        {inHub ? (
          <>
            {/* hubs list */}
            <div>
              <div className="mb-0.5 flex items-center justify-between px-2 py-1">
                <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-zinc-500">{t('nav.projects')}</span>
                <button onClick={() => navigate('/projects?new=1')} title={t('hub.new')} className="rounded p-0.5 text-zinc-500 transition-colors hover:bg-zinc-500/20 hover:text-zinc-200">
                  <Plus size={14} />
                </button>
              </div>
              <div className="space-y-px">
                <NavLink to="/projects" end className={({ isActive }) => rowClass(isActive)}>
                  <FolderKanban size={17} className={iconClass(pathname === '/projects')} />
                  <span className="min-w-0 flex-1 truncate">{t('hub.all')}</span>
                </NavLink>
                {hubProjects.filter((p) => p.status !== 'archived').map((p) => {
                  const active = pathname === `/project/${p.id}`
                  return (
                    <NavLink key={p.id} to={`/project/${p.id}`} className={rowClass(active)}>
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: p.color || PROJECT_STATUS_COLORS[p.status] }} />
                      <span className="min-w-0 flex-1 truncate">{p.name}</span>
                    </NavLink>
                  )
                })}
              </div>
            </div>
            {/* work tools */}
            <div>
              <div className="mb-0.5 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-zinc-500">{t('nav.tools')}</div>
              <div className="space-y-px">{HUB_TOOLS.map(navRow)}</div>
            </div>
          </>
        ) : (
          HOME_GROUPS.map((group) => {
            const isCollapsed = collapsed.has(group.id)
            return (
              <div key={group.id}>
                <button
                  onClick={() => toggleGroup(group.id)}
                  className="group/h mb-0.5 flex w-full items-center gap-1 rounded px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-zinc-500 transition-colors hover:text-zinc-300"
                >
                  {t(group.key)}
                  <ChevronDown size={12} className={`ml-auto text-zinc-600 transition-all duration-150 ${isCollapsed ? '-rotate-90 opacity-100' : 'opacity-0 group-hover/h:opacity-100'}`} />
                </button>
                {!isCollapsed && <div className="space-y-px">{group.links.map(navRow)}</div>}
              </div>
            )
          })
        )}
      </nav>

      <div className="space-y-px border-t border-edge/60 px-2.5 py-2.5">{bottomLinks.map(navRow)}</div>
    </aside>
  )
}
