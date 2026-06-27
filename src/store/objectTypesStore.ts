import { create } from 'zustand'
import type { ObjectType } from '../types/models'

// One global cache of object types so any card can resolve props.type → icon/colour
// without each list fetching its own copy. Re-syncs on any objectTypes change.
interface ObjectTypesState {
  byId: Record<number, ObjectType>
  loaded: boolean
  load: () => Promise<void>
}

let subscribed = false

export const useObjectTypesStore = create<ObjectTypesState>((set, get) => ({
  byId: {},
  loaded: false,
  load: async () => {
    if (!subscribed) {
      subscribed = true
      window.wist.events.onDataChanged((kind) => {
        if (kind === 'objectTypes' || kind === 'all') get().load()
      })
    }
    try {
      const types = await window.wist.objectTypes.list()
      set({ byId: Object.fromEntries(types.map((t) => [t.id, t])), loaded: true })
    } catch {
      set((s) => ({ loaded: true, byId: s.byId }))
    }
  },
}))
