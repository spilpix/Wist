import { create } from 'zustand'

/**
 * Per-block customization for the Home "Today" board (and any future board).
 * Each column is keyed by a stable id ('tasks' / 'notes'). A blank `title`
 * means "use the i18n default" — same convention the sidebar uses for renamed
 * section headers, so language switching keeps working until the user renames.
 */
// A block colour is a SEMANTIC NAME, not a hex. Each name resolves to a
// {text, bg} pair that is hand-tuned per theme via CSS vars (--c-<name>-text /
// --c-<name>-bg in index.css). This is what keeps colours reading correctly in
// both light and dark — the old single-hex approach drifted between themes.
export type BlockColor = 'gray' | 'brown' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'pink' | 'red'

export const BLOCK_COLORS: BlockColor[] = ['gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red']

export interface BoardColConfig {
  title: string // '' → fall back to the default i18n label
  color: BlockColor | '' // '' → fall back to the column's default colour
}

const KEY = 'wist.boardCols'

function load(): Record<string, BoardColConfig> {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    const out: Record<string, BoardColConfig> = {}
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      for (const [k, v] of Object.entries(raw)) {
        if (v && typeof v === 'object') {
          const title = typeof (v as any).title === 'string' ? (v as any).title : ''
          // only keep a known semantic name; legacy hex values fall back to default
          const rawColor = (v as any).color
          const color: BlockColor | '' = BLOCK_COLORS.includes(rawColor) ? rawColor : ''
          out[k] = { title, color }
        }
      }
    }
    return out
  } catch {
    return {}
  }
}

function persist(cols: Record<string, BoardColConfig>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(cols))
  } catch {
    /* storage unavailable */
  }
}

interface BoardState {
  cols: Record<string, BoardColConfig>
  setTitle: (id: string, title: string) => void
  setColor: (id: string, color: BlockColor) => void
  reset: (id: string) => void
}

export const useBoardStore = create<BoardState>((set, get) => {
  const commit = (id: string, patch: Partial<BoardColConfig>) => {
    const prev = get().cols[id] ?? { title: '', color: '' }
    const next = { ...get().cols, [id]: { ...prev, ...patch } }
    persist(next)
    set({ cols: next })
  }
  return {
    cols: load(),
    setTitle: (id, title) => commit(id, { title: title.trim() }),
    setColor: (id, color) => commit(id, { color }),
    reset: (id) => {
      const next = { ...get().cols }
      delete next[id]
      persist(next)
      set({ cols: next })
    },
  }
})
