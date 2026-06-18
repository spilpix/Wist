import { create } from 'zustand'

export interface HistoryEntry {
  path: string // full route (pathname+search)
  title: string
  ts: number // last-visited epoch ms
}

const KEY = 'wist.history'
const MAX = 200

function load(): HistoryEntry[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    if (!Array.isArray(raw)) return []
    return raw.filter((e): e is HistoryEntry => !!e && typeof e.path === 'string' && typeof e.ts === 'number')
  } catch {
    return []
  }
}

function persist(entries: HistoryEntry[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(entries))
  } catch {
    /* storage unavailable */
  }
}

interface HistoryState {
  entries: HistoryEntry[]
  /** Record a visit (most-recent first). Re-visiting a path moves it to the top. */
  record: (path: string, title: string) => void
  /** Update the title of the most recent entry for a pathname (e.g. when a name loads). */
  touch: (path: string, title: string) => void
  /** Drop entries matching a predicate (e.g. the sidebar "Недавние" deep items). */
  remove: (pred: (e: HistoryEntry) => boolean) => void
  clear: () => void
}

const pn = (p: string) => p.split('?')[0]

export const useHistoryStore = create<HistoryState>((set, get) => ({
  entries: load(),
  record: (path, title) => {
    const now = Date.now()
    // a pathname is unique in history: drop any earlier visit and re-add it on top,
    // keeping the latest full path. This also guarantees touch() hits one canonical entry.
    const rest = get().entries.filter((e) => pn(e.path) !== pn(path))
    const entries = [{ path, title, ts: now }, ...rest].slice(0, MAX)
    persist(entries)
    set({ entries })
  },
  touch: (path, title) => {
    const entries = get().entries
    const i = entries.findIndex((e) => pn(e.path) === pn(path))
    if (i < 0 || entries[i].title === title || !title) return
    const next = entries.slice()
    next[i] = { ...next[i], title }
    persist(next)
    set({ entries: next })
  },
  remove: (pred) => {
    const next = get().entries.filter((e) => !pred(e))
    persist(next)
    set({ entries: next })
  },
  clear: () => {
    persist([])
    set({ entries: [] })
  },
}))
