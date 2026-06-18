import { create } from 'zustand'
import type { Favorite, FavoriteInput, FavoriteKind } from '../types/models'

export const favKey = (kind: string, ref: string | number) => `${kind}:${ref}`

interface FavoritesState {
  favorites: Favorite[]
  pinned: Set<string> // `${kind}:${ref}` for O(1) star lookups
  loaded: boolean
  load: () => Promise<void>
  isPinned: (kind: string, ref: string | number) => boolean
  toggle: (input: FavoriteInput) => Promise<boolean>
  remove: (kind: FavoriteKind, ref: string | number) => Promise<void>
  reorder: (ids: number[]) => Promise<void>
}

let subscribed = false

export const useFavoritesStore = create<FavoritesState>((set, get) => ({
  favorites: [],
  pinned: new Set(),
  loaded: false,

  load: async () => {
    // one global subscription: any favorites change anywhere re-syncs every star
    if (!subscribed) {
      subscribed = true
      window.wist.events.onDataChanged((kind) => {
        if (kind === 'favorites' || kind === 'all') get().load()
      })
    }
    try {
      const favorites = await window.wist.favorites.list()
      set({ favorites, pinned: new Set(favorites.map((f) => favKey(f.kind, f.ref))), loaded: true })
    } catch {
      set((s) => ({ loaded: true, favorites: s.favorites }))
    }
  },

  isPinned: (kind, ref) => get().pinned.has(favKey(kind, ref)),

  toggle: async (input) => {
    // optimistic flip so the star reacts instantly; reconcile from the db after
    const k = favKey(input.kind, input.ref)
    const next = new Set(get().pinned)
    const nowPinned = !next.has(k)
    nowPinned ? next.add(k) : next.delete(k)
    set({ pinned: next })
    try {
      const state = await window.wist.favorites.toggle(input)
      await get().load()
      return state
    } catch {
      await get().load() // failed → snap back to truth
      return get().pinned.has(k)
    }
  },

  remove: async (kind, ref) => {
    await window.wist.favorites.remove(kind, ref)
    await get().load()
  },

  reorder: async (ids) => {
    // optimistic local reorder for a smooth drag, then persist
    const byId = new Map(get().favorites.map((f) => [f.id, f]))
    const ordered = ids.map((id) => byId.get(id)).filter(Boolean) as Favorite[]
    if (ordered.length === get().favorites.length) set({ favorites: ordered })
    await window.wist.favorites.reorder(ids)
    await get().load()
  },
}))
