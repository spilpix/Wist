import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { create } from 'zustand'
import { useHistoryStore } from './historyStore'

// A browser/Obsidian-style workspace tab. `path` is the full route (pathname+search);
// `title` is an optional override a page can set (e.g. a project's real name).
export interface WorkTab {
  id: string
  path: string
  title?: string
}

interface Persisted {
  tabs: WorkTab[]
  activeId: string | null
}

function loadPersisted(): Persisted {
  try {
    const raw = JSON.parse(localStorage.getItem('wist.tabs') ?? 'null')
    if (raw && Array.isArray(raw.tabs)) {
      const tabs = raw.tabs.filter((tb: unknown): tb is WorkTab => !!tb && typeof (tb as WorkTab).path === 'string')
      return { tabs, activeId: typeof raw.activeId === 'string' ? raw.activeId : tabs[0]?.id ?? null }
    }
  } catch {
    /* corrupt — start fresh */
  }
  return { tabs: [], activeId: null }
}

function persist(tabs: WorkTab[], activeId: string | null) {
  try {
    localStorage.setItem('wist.tabs', JSON.stringify({ tabs, activeId }))
  } catch {
    /* storage unavailable */
  }
}

let seq = 0
const newId = () => `tab_${Date.now().toString(36)}_${seq++}`

const pn = (p: string) => p.split('?')[0] // pathname, ignoring the query string

interface TabState {
  tabs: WorkTab[]
  activeId: string | null
  /** Driven by the router: ensure a tab exists for this pathname and make it active.
   *  Deduped by PATHNAME (no spam from ?open=/?type=/?new=), but the latest full path
   *  (incl. query) is stored so re-clicking the tab restores its filter/selection. */
  syncPath: (path: string) => void
  /** Close a tab. Returns the path the router should navigate to next (only when the
   *  active tab was closed), or null if no navigation is needed. */
  closeTab: (id: string) => string | null
  /** Close every tab except the currently active one (no navigation needed). */
  closeOthers: () => void
  /** Reorder: drop the dragged tab into the target tab's slot (drag-to-reorder). */
  moveTab: (dragId: string, targetId: string) => void
  /** Reorder the tabs to exactly this id order (used by the browser-style drag). */
  reorder: (orderedIds: string[]) => void
  /** Activate the tab at index i (0-based). Returns its path to navigate, or null. */
  activateIndex: (i: number) => string | null
  /** Step to the next/previous tab (wraps). Returns its path to navigate, or null. */
  step: (dir: 1 | -1) => string | null
  /** Set a display title for the tab matching this pathname (no-op if none). */
  setTitle: (path: string, title: string) => void
}

const init = loadPersisted()

export const useTabStore = create<TabState>((set, get) => ({
  tabs: init.tabs,
  activeId: init.activeId,

  syncPath: (path) => {
    const { tabs, activeId } = get()
    const existing = tabs.find((tb) => pn(tb.path) === pn(path))
    if (existing) {
      // refresh the stored full path (latest filter/selection) + activate
      const needsPath = existing.path !== path
      if (needsPath || activeId !== existing.id) {
        const next = needsPath ? tabs.map((tb) => (tb.id === existing.id ? { ...tb, path } : tb)) : tabs
        set({ tabs: next, activeId: existing.id })
        persist(next, existing.id)
      }
      return
    }
    const tab: WorkTab = { id: newId(), path }
    const next = [...tabs, tab]
    set({ tabs: next, activeId: tab.id })
    persist(next, tab.id)
  },

  closeTab: (id) => {
    const { tabs, activeId } = get()
    const idx = tabs.findIndex((tb) => tb.id === id)
    if (idx < 0) return null
    const next = tabs.filter((tb) => tb.id !== id)
    let navTo: string | null = null
    let newActive = activeId
    if (activeId === id) {
      const neighbor = next[idx] ?? next[idx - 1] ?? null // prefer the right neighbor, else left
      newActive = neighbor?.id ?? null
      navTo = neighbor?.path ?? '/' // closing the last tab falls back to Home
    }
    set({ tabs: next, activeId: newActive })
    persist(next, newActive)
    return navTo
  },

  closeOthers: () => {
    const { tabs, activeId } = get()
    const active = activeId ? tabs.find((tb) => tb.id === activeId) : null
    const next = active ? [active] : []
    set({ tabs: next, activeId: active?.id ?? null })
    persist(next, active?.id ?? null)
  },

  moveTab: (dragId, targetId) => {
    if (dragId === targetId) return
    const { tabs, activeId } = get()
    const from = tabs.findIndex((tb) => tb.id === dragId)
    const to = tabs.findIndex((tb) => tb.id === targetId)
    if (from < 0 || to < 0) return
    const next = [...tabs]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    set({ tabs: next })
    persist(next, activeId)
  },

  reorder: (orderedIds) => {
    const { tabs, activeId } = get()
    const byId = new Map(tabs.map((tb) => [tb.id, tb]))
    const next = orderedIds.map((id) => byId.get(id)).filter(Boolean) as WorkTab[]
    // safety: keep any tab missing from the list (shouldn't happen) so none vanish
    for (const tb of tabs) if (!orderedIds.includes(tb.id)) next.push(tb)
    if (next.length !== tabs.length || next.some((tb, i) => tb.id !== tabs[i].id)) {
      set({ tabs: next })
      persist(next, activeId)
    }
  },

  activateIndex: (i) => {
    const { tabs } = get()
    const tab = tabs[i]
    if (!tab) return null
    set({ activeId: tab.id })
    persist(tabs, tab.id)
    return tab.path
  },

  step: (dir) => {
    const { tabs, activeId } = get()
    if (!tabs.length) return null
    const cur = tabs.findIndex((tb) => tb.id === activeId)
    const nextIdx = ((cur < 0 ? 0 : cur) + dir + tabs.length) % tabs.length
    const tab = tabs[nextIdx]
    set({ activeId: tab.id })
    persist(tabs, tab.id)
    return tab.path
  },

  setTitle: (path, title) => {
    const { tabs, activeId } = get()
    let changed = false
    const next = tabs.map((tb) => {
      if (pn(tb.path) === pn(path) && tb.title !== title) {
        changed = true
        return { ...tb, title }
      }
      return tb
    })
    if (changed) {
      set({ tabs: next })
      persist(next, activeId)
    }
  },
}))

/** Pages call this to give their tab a real name (e.g. a project/canvas/title name)
 *  so dynamic-route tabs don't all show the same generic label. */
export function useTabTitle(title: string | null | undefined) {
  const setTitle = useTabStore((s) => s.setTitle)
  const loc = useLocation()
  useEffect(() => {
    const tt = title?.trim()
    if (tt) {
      setTitle(loc.pathname, tt) // tabs are keyed by pathname (see Layout)
      useHistoryStore.getState().touch(loc.pathname, tt) // keep the History label accurate too
    }
  }, [title, loc.pathname, setTitle])
}
