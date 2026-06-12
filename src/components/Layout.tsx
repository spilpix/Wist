import { Outlet } from 'react-router-dom'
import { Moon, Play, Search, Sun } from 'lucide-react'
import Sidebar from './Sidebar'
import Toaster from './ui/Toaster'
import CommandPalette from './CommandPalette'
import { useUiStore } from '../store/uiStore'
import { useSettingsStore, resolvedTheme } from '../store/settingsStore'
import { useI18n } from '../i18n'

/** Slim draggable title bar; native Windows window controls overlay the right edge. */
function TitleBar() {
  const { t } = useI18n()
  const setPalette = useUiStore((s) => s.setPalette)
  const settings = useSettingsStore((s) => s.settings)
  const update = useSettingsStore((s) => s.update)
  const dark = (settings?.theme === 'system' ? resolvedTheme() : settings?.theme ?? 'dark') === 'dark'

  return (
    <header className="app-drag relative flex h-9 shrink-0 items-center gap-2 border-b border-edge/60 bg-surface px-4">
      <span className="flex h-5 w-5 items-center justify-center rounded-md bg-accent">
        <Play size={10} className="fill-[#fff] text-[#fff]" />
      </span>
      <span className="text-[13px] font-semibold tracking-tight text-zinc-300">Wist</span>

      {/* command palette trigger, Notion-style */}
      <button
        onClick={() => setPalette(true)}
        className="app-no-drag absolute left-1/2 flex w-72 -translate-x-1/2 items-center justify-between rounded-lg border border-edge/70 bg-raised/70 px-3 py-1 text-xs text-zinc-500 transition-colors hover:bg-raised hover:text-zinc-300"
      >
        <span className="flex items-center gap-2">
          <Search size={12} />
          {t('cmdk.searchHint')}
        </span>
        <span className="flex items-center gap-1">
          <span className="kbd">Ctrl</span>
          <span className="kbd">K</span>
        </span>
      </button>

      {/* theme toggle (clear of the native window controls) */}
      <button
        onClick={() => update({ theme: dark ? 'light' : 'dark' })}
        title={t('cmdk.toggleTheme')}
        className="app-no-drag ml-auto mr-[140px] rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-raised hover:text-zinc-200"
      >
        {dark ? <Sun size={14} /> : <Moon size={14} />}
      </button>
    </header>
  )
}

export default function Layout() {
  return (
    <div className="flex h-full flex-col">
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="min-w-0 flex-1 bg-bg">
          <Outlet />
        </main>
        <Toaster />
      </div>
      <CommandPalette />
    </div>
  )
}
