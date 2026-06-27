// Per-hub layout config — which tabs are shown (and in what order) and which Overview
// widgets are enabled. Persisted in localStorage per hub so every hub can be tuned
// independently ("настроить под себя"). Validated on read; bad/legacy values fall back
// to the defaults so a corrupt entry can never break the page.

export type HubTabId = 'overview' | 'files' | 'tasks' | 'notes' | 'plans' | 'sessions' | 'patches' | 'graph'

export const ALL_HUB_TABS: HubTabId[] = ['overview', 'files', 'tasks', 'notes', 'plans', 'sessions', 'patches', 'graph']

// patches + graph are power features → off by default; plans on by default
export const DEFAULT_HUB_TABS: HubTabId[] = ['overview', 'files', 'tasks', 'notes', 'plans', 'sessions']

// The Overview is the workspace command center. Focus (a pomodoro / deep-work timer)
// and References now live here as widgets instead of a separate tab/section, so you can
// start a focused work block and keep your key links in view without leaving the dashboard.
export type HubWidgetId =
  | 'focus'
  | 'progress'
  | 'deadline'
  | 'momentum'
  | 'quickcapture'
  | 'continue'
  | 'openTasks'
  | 'references'
  | 'recentFiles'
  | 'recentSessions'
  | 'recentPatches'

export const ALL_HUB_WIDGETS: HubWidgetId[] = [
  'focus',
  'progress',
  'deadline',
  'momentum',
  'quickcapture',
  'continue',
  'openTasks',
  'references',
  'recentFiles',
  'recentSessions',
  'recentPatches',
]

export const DEFAULT_HUB_WIDGETS: HubWidgetId[] = [
  'focus',
  'progress',
  'deadline',
  'momentum',
  'quickcapture',
  'openTasks',
  'references',
]

const tabsKey = (id: number) => `hub:tabs:${id}`
const widgetsKey = (id: number) => `hub:widgets:${id}`

function readList<T extends string>(key: string, allowed: readonly T[], fallback: T[]): T[] {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return [...fallback]
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return [...fallback]
    const valid = parsed.filter((x): x is T => typeof x === 'string' && (allowed as readonly string[]).includes(x))
    // de-dupe while keeping order; an empty result (all stripped) → fall back so we never show nothing
    const seen = new Set<T>()
    const out = valid.filter((x) => (seen.has(x) ? false : (seen.add(x), true)))
    return out.length ? out : [...fallback]
  } catch {
    return [...fallback]
  }
}

export function loadHubTabs(id: number): HubTabId[] {
  const had = localStorage.getItem(tabsKey(id)) != null
  const list = readList<HubTabId>(tabsKey(id), ALL_HUB_TABS, DEFAULT_HUB_TABS)
  if (had) {
    // inject newly-added tabs into existing saved configs so old hubs pick them up
    const inject: Array<{ tab: HubTabId; after: HubTabId | null }> = [
      { tab: 'plans', after: 'notes' },
      { tab: 'graph', after: null },
    ]
    let result = [...list]
    let changed = false
    for (const { tab, after } of inject) {
      if (result.includes(tab)) continue
      changed = true
      if (after) {
        const idx = result.indexOf(after)
        result.splice(idx >= 0 ? idx + 1 : result.length, 0, tab)
      } else {
        result.push(tab)
      }
    }
    if (changed) saveHubTabs(id, result)
    return result
  }
  return list
}
export function saveHubTabs(id: number, tabs: HubTabId[]): void {
  try {
    localStorage.setItem(tabsKey(id), JSON.stringify(tabs))
  } catch {
    /* storage full / unavailable — config is best-effort */
  }
}

export function loadHubWidgets(id: number): HubWidgetId[] {
  const had = localStorage.getItem(widgetsKey(id)) != null
  const list = readList<HubWidgetId>(widgetsKey(id), ALL_HUB_WIDGETS, DEFAULT_HUB_WIDGETS)
  // Focus + References were promoted from a tab/section into Overview widgets. Hubs
  // configured before that have a saved set without them — surface them (prepended) so
  // the feature isn't silently lost when the Focus tab disappears.
  if (had) {
    const inject = (['focus', 'references'] as HubWidgetId[]).filter((w) => !list.includes(w))
    if (inject.length) return [...inject, ...list]
  }
  return list
}
export function saveHubWidgets(id: number, widgets: HubWidgetId[]): void {
  try {
    localStorage.setItem(widgetsKey(id), JSON.stringify(widgets))
  } catch {
    /* ignore */
  }
}
