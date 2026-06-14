import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Moon, PanelLeft, Search, Sun } from 'lucide-react'
import Sidebar from './Sidebar'
import ErrorBoundary from './ErrorBoundary'
import Toaster from './ui/Toaster'
import CommandPalette from './CommandPalette'
import { useUiStore } from '../store/uiStore'
import { useSettingsStore, resolvedTheme } from '../store/settingsStore'
import { useI18n } from '../i18n'

/** Slim draggable toolbar; native Windows window controls overlay the right edge. */
function TitleBar() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const setPalette = useUiStore((s) => s.setPalette)
  const toggleSidebar = useUiStore((s) => s.toggleSidebar)
  const settings = useSettingsStore((s) => s.settings)
  const update = useSettingsStore((s) => s.update)
  const dark = (settings?.theme === 'system' ? resolvedTheme() : settings?.theme ?? 'light') === 'dark'

  const toolBtn = 'app-no-drag rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-raised hover:text-zinc-200'

  return (
    <header className="app-drag relative flex h-9 shrink-0 items-center gap-0.5 border-b border-edge/60 bg-surface px-2">
      <button className={toolBtn} onClick={toggleSidebar} title={t('app.toggleSidebar')}>
        <PanelLeft size={16} />
      </button>
      <button className={toolBtn} onClick={() => navigate(-1)} title={t('app.back')}>
        <ArrowLeft size={16} />
      </button>
      <button className={toolBtn} onClick={() => navigate(1)} title={t('app.forward')}>
        <ArrowRight size={16} />
      </button>

      <button
        onClick={() => setPalette(true)}
        className="app-no-drag ml-1.5 flex items-center gap-2 rounded-md border border-edge/70 bg-raised/60 px-2.5 py-1 text-xs text-zinc-500 transition-colors hover:bg-raised hover:text-zinc-300"
      >
        <Search size={12} />
        {t('cmdk.searchHint')}
        <span className="ml-1 flex items-center gap-1">
          <span className="kbd">Ctrl</span>
          <span className="kbd">K</span>
        </span>
      </button>

      <button
        onClick={() => update({ theme: dark ? 'light' : 'dark' })}
        title={t('cmdk.toggleTheme')}
        className="app-no-drag ml-auto mr-[140px] rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-raised hover:text-zinc-200"
      >
        {dark ? <Sun size={14} /> : <Moon size={14} />}
      </button>
    </header>
  )
}

export default function Layout() {
  const pathname = useLocation().pathname
  return (
    <div className="flex h-full flex-col">
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="min-w-0 flex-1 bg-bg">
          {/* a page crash shows a fallback instead of white-screening the app;
              keying by route auto-clears the error when the user navigates away */}
          <ErrorBoundary resetKey={pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
        <Toaster />
      </div>
      <CommandPalette />
    </div>
  )
}
