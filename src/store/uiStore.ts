import { create } from 'zustand'

interface UiState {
  paletteOpen: boolean
  setPalette: (open: boolean) => void
}

export const useUiStore = create<UiState>((set) => ({
  paletteOpen: false,
  setPalette: (paletteOpen) => set({ paletteOpen }),
}))
