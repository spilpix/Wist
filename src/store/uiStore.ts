import { create } from 'zustand'

function loadCollapsed(): boolean {
  try {
    return localStorage.getItem('wist.sidebarCollapsed.manual') === '1'
  } catch {
    return false
  }
}

interface UiState {
  paletteOpen: boolean
  setPalette: (open: boolean) => void
  sidebarCollapsed: boolean
  toggleSidebar: () => void
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
}))
