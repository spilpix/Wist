import { create } from 'zustand'
import type { Project } from '../types/models'

interface ProjectState {
  projects: Project[]
  loading: boolean
  load: () => Promise<void>
}

export const useProjectStore = create<ProjectState>((set) => ({
  projects: [],
  loading: false,
  load: async () => {
    set({ loading: true })
    try {
      set({ projects: await window.wist.projects.list() })
    } finally {
      set({ loading: false })
    }
  },
}))
