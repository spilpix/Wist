import { create } from 'zustand'

export const SIDEBAR_MIN = 208
export const SIDEBAR_MAX = 420
const SIDEBAR_DEFAULT = 272

function loadCollapsed(): boolean {
  try {
    return localStorage.getItem('wist.sidebarCollapsed.manual') === '1'
  } catch {
    return false
  }
}

function loadWidth(): number {
  try {
    const v = Number(localStorage.getItem('wist.sidebarWidth'))
    return Number.isFinite(v) && v >= SIDEBAR_MIN && v <= SIDEBAR_MAX ? v : SIDEBAR_DEFAULT
  } catch {
    return SIDEBAR_DEFAULT
  }
}

export const SPLIT_MIN = 0.25
export const SPLIT_MAX = 0.75

function loadSplit(): string | null {
  try {
    const v = localStorage.getItem('wist.split')
    return v && v.startsWith('/') ? v : null
  } catch {
    return null
  }
}
function loadSplitRatio(): number {
  try {
    const v = Number(localStorage.getItem('wist.splitRatio'))
    return Number.isFinite(v) && v >= SPLIT_MIN && v <= SPLIT_MAX ? v : 0.5
  } catch {
    return 0.5
  }
}

interface UiState {
  paletteOpen: boolean
  setPalette: (open: boolean) => void
  sidebarCollapsed: boolean
  toggleSidebar: () => void
  /** Set collapse state directly. persist=false is for transient, route-driven
   *  collapses (e.g. the graph auto-collapses the rail) that must NOT clobber the
   *  user's manual preference, so it can be restored on the way out. */
  setSidebarCollapsed: (collapsed: boolean, persist?: boolean) => void
  sidebarWidth: number
  setSidebarWidth: (w: number) => void
  // split screen (Opera-style): a second pane showing another tab's path
  split: string | null
  setSplit: (path: string | null) => void
  splitRatio: number // left pane fraction
  setSplitRatio: (r: number) => void
  splitArmed: boolean // pointer is over the right-edge split drop zone mid tab-drag
  setSplitArmed: (b: boolean) => void
}

export const useUiStore = create<UiState>((set) => ({
  paletteOpen: false,
  setPalette: (paletteOpen) => set({ paletteOpen }),
  sidebarCollapsed: loadCollapsed(),
  toggleSidebar: () =>
    set((s) => {
      const next = !s.sidebarCollapsed
      try {
        localStorage.setItem('wist.sidebarCollapsed.manual', next ? '1' : '0')
      } catch {
        /* storage unavailable */
      }
      return { sidebarCollapsed: next }
    }),
  setSidebarCollapsed: (collapsed, persist = true) =>
    set(() => {
      if (persist) {
        try {
          localStorage.setItem('wist.sidebarCollapsed.manual', collapsed ? '1' : '0')
        } catch {
          /* storage unavailable */
        }
      }
      return { sidebarCollapsed: collapsed }
    }),
  sidebarWidth: loadWidth(),
  setSidebarWidth: (w) =>
    set(() => {
      const clamped = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, Math.round(w)))
      try {
        localStorage.setItem('wist.sidebarWidth', String(clamped))
      } catch {
        /* storage unavailable */
      }
      return { sidebarWidth: clamped }
    }),

  split: loadSplit(),
  setSplit: (path) =>
    set(() => {
      try {
        if (path) localStorage.setItem('wist.split', path)
        else localStorage.removeItem('wist.split')
      } catch {
        /* storage unavailable */
      }
      return { split: path }
    }),
  splitRatio: loadSplitRatio(),
  setSplitRatio: (r) =>
    set(() => {
      const clamped = Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, r))
      try {
        localStorage.setItem('wist.splitRatio', String(clamped))
      } catch {
        /* storage unavailable */
      }
      return { splitRatio: clamped }
    }),
  splitArmed: false,
  setSplitArmed: (splitArmed) => set({ splitArmed }),
}))
