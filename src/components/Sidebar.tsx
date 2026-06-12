import { NavLink, useSearchParams } from 'react-router-dom'
import {
  BarChart3,
  Bookmark,
  CheckCircle2,
  CircleDot,
  Clock,
  FolderOpen,
  Heart,
  Home,
  Library,
  PauseCircle,
  Play,
  Settings,
  XCircle,
  Youtube,
} from 'lucide-react'
import { STATUS_COLORS, type TitleStatus } from '../types/models'
import { useI18n, type TKey } from '../i18n'

const mainLinks: Array<{ to: string; key: TKey; icon: typeof Home }> = [
  { to: '/', key: 'nav.home', icon: Home },
  { to: '/library', key: 'nav.library', icon: Library },
  { to: '/continue', key: 'nav.continue', icon: Clock },
  { to: '/favorites', key: 'nav.favorites', icon: Heart },
  { to: '/moments', key: 'nav.moments', icon: Bookmark },
]

const listLinks: Array<{ status: TitleStatus; icon: typeof CircleDot }> = [
  { status: 'watching', icon: CircleDot },
  { status: 'completed', icon: CheckCircle2 },
  { status: 'planned', icon: Clock },
  { status: 'on_hold', icon: PauseCircle },
  { status: 'dropped', icon: XCircle },
]

const sourceLinks: Array<{ to: string; key: TKey; icon: typeof FolderOpen }> = [
  { to: '/local', key: 'nav.localFiles', icon: FolderOpen },
  { to: '/youtube', key: 'nav.youtube', icon: Youtube },
]

const bottomLinks: Array<{ to: string; key: TKey; icon: typeof BarChart3 }> = [
  { to: '/stats', key: 'nav.statistics', icon: BarChart3 },
  { to: '/settings', key: 'nav.settings', icon: Settings },
]

function linkClass(isActive: boolean): string {
  return [
    'flex items-center gap-2.5 rounded-lg px-3 py-[7px] text-[13px] font-medium transition-colors',
    isActive ? 'bg-accent/15 text-accent-bright' : 'text-zinc-400 hover:bg-raised hover:text-zinc-200',
  ].join(' ')
}

export default function Sidebar() {
  const [searchParams] = useSearchParams()
  const activeStatus = searchParams.get('status')
  const { t } = useI18n()

  return (
    <aside className="flex h-full w-[200px] shrink-0 flex-col border-r border-edge/60 bg-surface">
      <div className="flex items-center gap-2 px-5 pb-5 pt-6">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent">
          <Play size={14} className="fill-white text-white" />
        </span>
        <span className="text-lg font-bold tracking-tight text-white">Wist</span>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
        <div className="space-y-0.5">
          {mainLinks.map(({ to, key, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => linkClass(isActive)}>
              <Icon size={15} />
              {t(key)}
            </NavLink>
          ))}
        </div>

        <div>
          <div className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
            {t('nav.myLists')}
          </div>
          <div className="space-y-0.5">
            {listLinks.map(({ status }) => (
              <NavLink
                key={status}
                to={`/library?status=${status}`}
                className={() =>
                  linkClass(location.hash.includes('/library') && activeStatus === status)
                }
              >
                <span
                  className="ml-0.5 h-2 w-2 rounded-full"
                  style={{ backgroundColor: STATUS_COLORS[status] }}
                />
                <span className="ml-1">{t(`status.${status}`)}</span>
              </NavLink>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
            {t('nav.sources')}
          </div>
          <div className="space-y-0.5">
            {sourceLinks.map(({ to, key, icon: Icon }) => (
              <NavLink key={to} to={to} className={({ isActive }) => linkClass(isActive)}>
                <Icon size={15} />
                {t(key)}
              </NavLink>
            ))}
          </div>
        </div>
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
