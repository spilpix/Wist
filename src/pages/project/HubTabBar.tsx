import { useState } from 'react'
import { ChevronRight, FolderOpen, GitCommitVertical, History, LayoutGrid, ListTodo, Plus, ScrollText, Settings2, Share2, StickyNote, X } from 'lucide-react'
import { ALL_HUB_TABS, ALL_HUB_WIDGETS, type HubTabId, type HubWidgetId } from '../../lib/hubConfig'
import { useI18n } from '../../i18n'

type TFn = ReturnType<typeof useI18n>['t']

// Hub tab bar + customize panel — extracted from ProjectDetail.tsx. TAB_META (tab → icon +
// i18n label) is private to this module since only these two components consume it.
const TAB_META: Record<HubTabId, { icon: typeof LayoutGrid; key: string }> = {
  overview: { icon: LayoutGrid, key: 'hub.tabOverview' },
  files: { icon: FolderOpen, key: 'hub.tabFiles' },
  tasks: { icon: ListTodo, key: 'hub.tabTasks' },
  notes: { icon: StickyNote, key: 'hub.tabNotes' },
  plans: { icon: ScrollText, key: 'hub.tabPlans' },
  sessions: { icon: History, key: 'hub.tabSessions' },
  patches: { icon: GitCommitVertical, key: 'hub.tabPatches' },
  graph: { icon: Share2, key: 'hub.tabGraph' },
}

export function HubTabBar({
  tabs,
  tab,
  setTab,
  t,
  onReorder,
  onCustomize,
  customizing,
}: {
  tabs: HubTabId[]
  tab: HubTabId
  setTab: (v: HubTabId) => void
  t: TFn
  onReorder: (next: HubTabId[]) => void
  onCustomize: () => void
  customizing: boolean
}) {
  const [dragId, setDragId] = useState<HubTabId | null>(null)
  const [overId, setOverId] = useState<HubTabId | null>(null)

  // drop the dragged tab into the target tab's slot
  const drop = (target: HubTabId) => {
    if (!dragId || dragId === target) return
    const next = tabs.filter((x) => x !== dragId)
    next.splice(next.indexOf(target), 0, dragId)
    onReorder(next)
  }
  const clearDrag = () => {
    setDragId(null)
    setOverId(null)
  }

  return (
    <div className="flex items-center gap-2 border-b border-edge">
      <div className="-mb-px flex flex-1 items-center gap-0.5 overflow-x-auto">
        {tabs.map((id) => {
          const { icon: Icon, key } = TAB_META[id]
          const active = tab === id
          const dropping = overId === id && dragId !== null && dragId !== id
          return (
            <button
              key={id}
              draggable
              onClick={() => setTab(id)}
              onDragStart={(e) => {
                setDragId(id)
                e.dataTransfer.effectAllowed = 'move'
                e.dataTransfer.setData('text/hubtab', id)
              }}
              onDragOver={(e) => {
                if (!dragId) return
                e.preventDefault()
                if (overId !== id) setOverId(id)
              }}
              onDrop={(e) => {
                e.preventDefault()
                e.stopPropagation()
                drop(id)
                clearDrag()
              }}
              onDragEnd={clearDrag}
              className={`flex shrink-0 cursor-pointer items-center gap-1.5 border-b-2 px-3 py-2.5 text-[13px] font-medium transition-colors ${
                dropping ? 'bg-accent/10' : ''
              } ${active ? 'border-white text-zinc-100' : 'border-transparent text-zinc-500 hover:text-zinc-300'} ${
                dragId === id ? 'opacity-40' : ''
              }`}
            >
              <Icon size={15} /> {t(key as 'hub.tabOverview')}
            </button>
          )
        })}
      </div>
      <button
        onClick={onCustomize}
        title={t('hub.customize')}
        className={`mb-1 shrink-0 rounded-lg p-1.5 transition-colors ${
          customizing ? 'bg-highlight text-zinc-100' : 'text-zinc-500 hover:bg-highlight hover:text-zinc-200'
        }`}
      >
        <Settings2 size={16} />
      </button>
    </div>
  )
}

export function CustomizePanel({
  tabs,
  widgets,
  t,
  onTabs,
  onWidgets,
  onReset,
  onClose,
}: {
  tabs: HubTabId[]
  widgets: HubWidgetId[]
  t: TFn
  onTabs: (next: HubTabId[]) => void
  onWidgets: (next: HubWidgetId[]) => void
  onReset: () => void
  onClose: () => void
}) {
  const disabled = ALL_HUB_TABS.filter((x) => !tabs.includes(x))
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= tabs.length) return
    const next = [...tabs]
    ;[next[i], next[j]] = [next[j], next[i]]
    onTabs(next)
  }
  const toggleWidget = (w: HubWidgetId) =>
    onWidgets(widgets.includes(w) ? widgets.filter((x) => x !== w) : [...widgets, w])

  const WIDGET_KEY: Record<HubWidgetId, string> = {
    focus: 'hub.widgetFocus',
    progress: 'hub.widgetProgress',
    deadline: 'hub.widgetDeadline',
    momentum: 'hub.widgetMomentum',
    quickcapture: 'hub.widgetQuickCapture',
    continue: 'hub.widgetContinue',
    openTasks: 'hub.widgetOpenTasks',
    references: 'hub.widgetReferences',
    recentFiles: 'hub.widgetRecentFiles',
    recentSessions: 'hub.widgetRecentSessions',
    recentPatches: 'hub.widgetRecentPatches',
  }

  return (
    <div className="card mt-3 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-xs text-zinc-500">{t('hub.customizeHint')}</div>
        <div className="flex items-center gap-1.5">
          <button onClick={onReset} className="btn-ghost !py-1 text-[11px]">
            {t('hub.resetLayout')}
          </button>
          <button onClick={onClose} className="rounded-lg p-1 text-zinc-500 hover:bg-highlight hover:text-zinc-200">
            <X size={15} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        {/* tabs */}
        <div>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{t('hub.customizeTabs')}</div>
          <div className="space-y-1">
            {tabs.map((id, i) => {
              const { icon: Icon, key } = TAB_META[id]
              return (
                <div key={id} className="flex items-center gap-2 rounded-lg bg-raised px-2 py-1.5">
                  <Icon size={14} className="text-zinc-400" />
                  <span className="flex-1 truncate text-sm text-zinc-200">{t(key as 'hub.tabOverview')}</span>
                  <button
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    className="rounded p-0.5 text-zinc-500 hover:text-zinc-200 disabled:opacity-30"
                    title="↑"
                  >
                    <ChevronRight size={14} className="-rotate-90" />
                  </button>
                  <button
                    onClick={() => move(i, 1)}
                    disabled={i === tabs.length - 1}
                    className="rounded p-0.5 text-zinc-500 hover:text-zinc-200 disabled:opacity-30"
                    title="↓"
                  >
                    <ChevronRight size={14} className="rotate-90" />
                  </button>
                  {id !== 'overview' && (
                    <button
                      onClick={() => onTabs(tabs.filter((x) => x !== id))}
                      className="rounded-lg p-0.5 text-zinc-500 hover:text-danger"
                      title={t('common.delete')}
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
          {disabled.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {disabled.map((id) => {
                const { icon: Icon, key } = TAB_META[id]
                return (
                  <button
                    key={id}
                    onClick={() => onTabs([...tabs, id])}
                    className="flex items-center gap-1 rounded-lg border border-dashed border-edge px-2 py-1 text-[11px] text-zinc-500 hover:border-accent hover:text-zinc-200"
                  >
                    <Plus size={11} /> <Icon size={12} /> {t(key as 'hub.tabOverview')}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* overview widgets */}
        <div>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{t('hub.customizeWidgets')}</div>
          <div className="space-y-1">
            {ALL_HUB_WIDGETS.map((w) => {
              const on = widgets.includes(w)
              return (
                <button
                  key={w}
                  onClick={() => toggleWidget(w)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-highlight"
                >
                  <span
                    className={`grid h-4 w-4 shrink-0 place-items-center rounded border ${on ? 'border-accent bg-accent text-[#fff]' : 'border-edge'}`}
                  >
                    {on && <ChevronRight size={11} className="rotate-90" />}
                  </span>
                  <span className={on ? 'text-zinc-200' : 'text-zinc-500'}>{t(WIDGET_KEY[w] as 'hub.widgetContinue')}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
