import { create } from 'zustand'
import type { Project } from '../types/models'

interface ProjectState {
  projects: Project[]
  loading: boolean
  load: () => Promise<void>
}

// one global subscription: any 'projects' change anywhere (this window, the agent API,
// a backup restore) re-syncs the list — mirrors the favoritesStore pattern, so the hub
// list no longer goes stale when a project is edited from ProjectDetail or elsewhere.
let subscribed = false

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  loading: false,
  load: async () => {
    if (!subscribed) {
      subscribed = true
      window.wist.events.onDataChanged((kind) => {
        if (kind === 'projects' || kind === 'all') get().load()
      })
    }
    set({ loading: true })
    try {
      set({ projects: await window.wist.projects.list() })
    } finally {
      set({ loading: false })
    }
  },
}))
