import { useEffect, useRef, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Columns2, Moon, PanelLeft, Sun, Unlink } from 'lucide-react'
import Sidebar from './Sidebar'
import TabBar from './TabBar'
import Tooltip from './ui/Tooltip'
import TooltipLayer from './ui/TooltipLayer'
import ErrorBoundary from './ErrorBoundary'
import Toaster from './ui/Toaster'
import CommandPalette from './CommandPalette'
import GlobalShortcuts from './GlobalShortcuts'
import PlayerBar from './PlayerBar'
import { physKey } from '../lib/keyboard'
import SplitPane from './SplitPane'
import { usePlayerStore } from '../store/playerStore'
import { usePreviewStore } from '../store/previewStore'
import { useUiStore } from '../store/uiStore'
import { useTabStore } from '../store/tabStore'
import { useHistoryStore } from '../store/historyStore'
import { routeMeta } from '../lib/routeMeta'
import { useSettingsStore, resolvedTheme } from '../store/settingsStore'
import { useI18n } from '../i18n'

/** Content-area top bar: it begins AFTER the sidebar (Obsidian-style) — nav arrows ·
 *  workspace tabs · theme. Draggable; native Windows controls overlay the right edge. */
function TopBar() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const settings = useSettingsStore((s) => s.settings)
  const update = useSettingsStore((s) => s.update)
  const dark = (settings?.theme === 'system' ? resolvedTheme() : settings?.theme ?? 'light') === 'dark'
  // when the sidebar is fully hidden (collapsed), the topbar carries the always-visible
  // re-open control — so there's a discoverable way back without hunting for the edge strip
  const sidebarCollapsed = useUiStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useUiStore((s) => s.toggleSidebar)

  const toolBtn = 'app-no-drag rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-raised hover:text-zinc-200'

  return (
    <header className="app-drag relative flex h-[42px] shrink-0 items-center gap-0.5 border-b border-edge bg-surface px-2">
      {sidebarCollapsed && (
        <Tooltip label={t('app.toggleSidebar')} shortcut="Ctrl B" side="bottom">
          <button className={`${toolBtn} mr-0.5`} onClick={toggleSidebar}>
            <PanelLeft size={16} />
          </button>
        </Tooltip>
      )}
      <Tooltip label={t('app.back')} shortcut="Alt ←" side="bottom">
        <button className={toolBtn} onClick={() => navigate(-1)}>
          <ArrowLeft size={16} />
        </button>
      </Tooltip>
      <Tooltip label={t('app.forward')} shortcut="Alt →" side="bottom">
        <button className={`${toolBtn} mr-1`} onClick={() => navigate(1)}>
          <ArrowRight size={16} />
        </button>
      </Tooltip>

      <TabBar />

      {/* guaranteed window-drag strip — flex-1 TabBar can't consume it */}
      {/* grows to fill the gap between the (content-width) tabs and the theme icon — this
          whole span drags the window; the tab strip shrinks before this does */}
      <div className="app-drag h-full min-w-[2.5rem] flex-1 self-stretch" aria-hidden />

      <Tooltip label={t('cmdk.toggleTheme')} side="bottom">
        <button
          onClick={() => update({ theme: dark ? 'light' : 'dark' })}
          className="app-no-drag mr-[140px] shrink-0 rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-raised hover:text-zinc-200"
        >
          {dark ? <Sun size={14} /> : <Moon size={14} />}
        </button>
      </Tooltip>
    </header>
  )
}

export default function Layout() {
  const { t } = useI18n()
  const location = useLocation()
  const navigate = useNavigate()
  const syncPath = useTabStore((s) => s.syncPath)
  const restored = useRef(false)
  const split = useUiStore((s) => s.split)
  const splitRatio = useUiStore((s) => s.splitRatio)
  const splitArmed = useUiStore((s) => s.splitArmed)
  const setSplit = useUiStore((s) => s.setSplit)
  const contentRowRef = useRef<HTMLDivElement>(null)
  const mainRef = useRef<HTMLElement>(null)
  const [resizing, setResizing] = useState(false)
  // a small "drag to resize" hint that follows the cursor over the divider
  const [hint, setHint] = useState<{ x: number; y: number } | null>(null)

  // drag the divider to resize the two panes (ratio = left-pane fraction). While
  // dragging we drop the width transition so the panes track the cursor 1:1.
  const beginDividerDrag = (e: React.PointerEvent) => {
    e.preventDefault()
    const row = contentRowRef.current
    if (!row) return
    const rect = row.getBoundingClientRect()
    setResizing(true)
    const onMove = (ev: PointerEvent) => {
      useUiStore.getState().setSplitRatio((ev.clientX - rect.left) / rect.width)
      setHint({ x: ev.clientX, y: ev.clientY }) // keep the hint glued to the cursor while dragging
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      setResizing(false)
      setHint(null)
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  // swap the two panes (Chrome double-click-divider gesture): the split path takes
  // over the main window and the old main path moves into the split pane
  const swapPanes = () => {
    if (!split) return
    const main = location.pathname + location.search
    setSplit(main)
    navigate(split)
  }

  // clicking a reminder notification (main process) navigates here
  useEffect(() => window.wist.events.onNavigate((path) => navigate(path)), [navigate])

  // on launch, return to the tab the user left active (the app always mounts at '/')
  useEffect(() => {
    if (restored.current) return
    restored.current = true
    const { tabs, activeId } = useTabStore.getState()
    const active = tabs.find((tb) => tb.id === activeId)
    if (active && active.path !== location.pathname + location.search) navigate(active.path, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // every route the user opens becomes (or focuses) a workspace tab. Deduped by
  // pathname (no spam from ?open=/?type=/?new=); the full path is stored so the tab
  // remembers its filter/selection.
  useEffect(() => {
    const full = location.pathname + location.search
    syncPath(full)
    // log recent activity (the History page) — skip the history view itself
    if (location.pathname !== '/history') {
      useHistoryStore.getState().record(full, routeMeta(full, t).label)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search, syncPath])

  // music player follows the route: full bottom bar on the Music page, tucked into
  // the sidebar everywhere else (only while something is loaded). Runs on route
  // change only, so a manual collapse/expand within a page is never overridden.
  useEffect(() => {
    if (!usePlayerStore.getState().current) return
    usePlayerStore.getState().setBarCollapsed(location.pathname !== '/music')
  }, [location.pathname])

  // Ctrl/Cmd+B (or Ctrl/Cmd+\, the Notion/industry standard) toggles the sidebar.
  // Skip while typing — editors use Ctrl+B for bold.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = physKey(e)
      if (!(e.ctrlKey || e.metaKey) || (k !== 'b' && k !== '\\')) return
      const el = e.target as HTMLElement | null
      if (el?.isContentEditable || /^(input|textarea|select)$/i.test(el?.tagName ?? '')) return
      e.preventDefault()
      useUiStore.getState().toggleSidebar()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // browser-style tab previews: snapshot the main pane shortly after a navigation
  // settles, cached by pathname (the tab key) for TabBar's hover popover
  useEffect(() => {
    const el = mainRef.current
    if (!el) return
    const path = location.pathname
    const id = window.setTimeout(async () => {
      const r = el.getBoundingClientRect()
      if (r.width < 80 || r.height < 80) return
      const url = await window.wist.window.capturePreview({ x: r.x, y: r.y, width: r.width, height: r.height }).catch(() => null)
      if (url) usePreviewStore.getState().set(path, url)
    }, 700)
    return () => window.clearTimeout(id)
  }, [location.pathname, location.search])

  return (
    // column shell: the sidebar+content row on top, a full-width Now-Playing bar
    // pinned across the very bottom (Spotify-style; it self-hides when nothing plays)
    <div className="flex h-full flex-col">
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar />
          <div ref={contentRowRef} className="relative flex min-h-0 flex-1">
            {/* main (left) pane — width-driven so it eases between full ↔ split (Opera
                "squish" feel); the transition is off while dragging the divider */}
            <main
              ref={mainRef}
              className={`relative min-h-0 min-w-0 shrink-0 overflow-hidden bg-bg ${resizing ? '' : 'transition-[width] duration-[280ms] ease-[cubic-bezier(.16,1,.3,1)]'}`}
              style={{ width: split ? `${splitRatio * 100}%` : '100%' }}
            >
              {/* a page crash shows a fallback instead of white-screening the app;
                  keying by route auto-clears the error when the user navigates away */}
              <ErrorBoundary resetKey={location.pathname}>
                <Outlet />
              </ErrorBoundary>
            </main>

            {/* split (right) pane + draggable divider with a clear centre grip */}
            {split && (
              <>
                <div
                  onPointerDown={beginDividerDrag}
                  onDoubleClick={swapPanes}
                  onPointerEnter={(e) => setHint({ x: e.clientX, y: e.clientY })}
                  onPointerMove={(e) => !resizing && setHint({ x: e.clientX, y: e.clientY })}
                  onPointerLeave={() => !resizing && setHint(null)}
                  className={`group/div relative z-20 flex w-1 shrink-0 cursor-col-resize items-center justify-center transition-colors ${resizing ? 'bg-accent' : 'bg-edge hover:bg-accent/50'}`}
                >
                  {/* widened hit area so the thin bar is easy to grab */}
                  <div className="absolute inset-y-0 -left-2 -right-2" />
                  {/* centre grip */}
                  <div className={`pointer-events-none h-9 w-1 rounded-full transition-colors ${resizing ? 'bg-[#fff]' : 'bg-zinc-500/50 group-hover/div:bg-accent'}`} />
                  {/* Opera-style centre control: click to break the split. Stops the
                      pointer-down from starting a resize so click ≠ drag. */}
                  <button
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => setSplit(null)}
                    title={t('split.close')}
                    className="absolute left-1/2 top-1/2 z-10 flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-edge bg-card text-zinc-400 opacity-0 shadow-[var(--float-shadow)] transition-all duration-150 hover:scale-110 hover:border-danger/40 hover:text-danger group-hover/div:opacity-100"
                  >
                    <Unlink size={13} />
                  </button>
                </div>
                <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden bg-bg animate-[splitIn_0.34s_cubic-bezier(.16,1,.3,1)]">
                  <SplitPane key={split} path={split} onClose={() => setSplit(null)} onSwap={swapPanes} />
                </div>
              </>
            )}

            {/* resize hint that follows the cursor over the divider (Opera-style) */}
            {hint && split && (
              <div
                className="pointer-events-none fixed z-[60] -translate-x-1/2 translate-y-4 whitespace-nowrap rounded-lg border border-edge bg-card px-2.5 py-1 text-[11px] text-zinc-300 shadow-[var(--float-shadow)] animate-fade-in"
                style={{ left: hint.x, top: hint.y }}
              >
                {t('split.resize')}
              </div>
            )}

            {/* Opera-style drop zone — shown while a tab is dragged down into the page.
                The right half previews where the new pane will dock. */}
            {splitArmed && (
              <div className="pointer-events-none absolute inset-0 z-30 flex animate-fade-in">
                <div className="flex-1" />
                <div className="relative flex w-1/2 items-center justify-center border-l-2 border-dashed border-accent bg-accent/10 backdrop-blur-[1px]">
                  <div className="flex flex-col items-center gap-3 rounded-2xl border border-accent/30 bg-card/85 px-9 py-7 text-center shadow-[var(--float-shadow)] animate-scale-in">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/20 text-accent-bright">
                      <Columns2 size={30} />
                    </div>
                    <div>
                      <div className="text-[14px] font-semibold text-zinc-100">{t('split.dropTitle')}</div>
                      <div className="mt-0.5 text-[12px] text-zinc-400">{t('split.dropSub')}</div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <PlayerBar />
      <Toaster />
      <CommandPalette />
      <GlobalShortcuts />
      <TooltipLayer />
    </div>
  )
}
