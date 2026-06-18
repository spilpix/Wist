import { create } from 'zustand'
import type { Title, TitleFilters } from '../types/models'

interface LibraryState {
  titles: Title[]
  loading: boolean
  filters: TitleFilters
  view: 'grid' | 'list'
  setFilters: (patch: Partial<TitleFilters>) => void
  setView: (view: 'grid' | 'list') => void
  load: () => Promise<void>
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  titles: [],
  loading: false,
  filters: { sort: 'date_added', sortDir: 'desc', type: 'all', status: 'all' },
  view: (localStorage.getItem('wist.libraryView') as 'grid' | 'list') || 'grid',
  setFilters: (patch) => {
    const prev = get().filters
    const next = { ...prev, ...patch }
    // skip the reload when nothing actually changed (avoids churn on tab switches / no-op syncs)
    const changed = (Object.keys(patch) as Array<keyof TitleFilters>).some((k) => prev[k] !== next[k])
    if (!changed) return
    set({ filters: next })
    get().load()
  },
  setView: (view) => {
    localStorage.setItem('wist.libraryView', view)
    set({ view })
  },
  load: async () => {
    set({ loading: true })
    try {
      const titles = await window.wist.titles.list(get().filters)
      set({ titles })
    } finally {
      set({ loading: false })
    }
  },
}))
