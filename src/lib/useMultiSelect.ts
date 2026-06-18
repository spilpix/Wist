import { useState } from 'react'

/** Modifier flags from a mouse/keyboard event — the subset we need for selection gestures. */
interface ClickMods {
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  preventDefault: () => void
}

/**
 * Reusable list multi-selection: Ctrl/Cmd+click toggles, Shift+click selects a range
 * (relative to the last anchor), plain click clears. Pair with `selectAll` (Ctrl+A) and
 * a Delete handler in the consuming page. Items are identified by numeric id; the caller
 * supplies the current display order for range/select-all.
 */
export function useMultiSelect() {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [anchor, setAnchor] = useState<number | null>(null)

  const clear = () => setSelectedIds(new Set())
  const selectAll = (ids: number[]) => {
    setSelectedIds(new Set(ids))
    setAnchor(ids[0] ?? null)
  }
  const toggle = (id: number) => {
    setSelectedIds((p) => {
      const n = new Set(p)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
    setAnchor(id)
  }
  const range = (id: number, ordered: number[]) => {
    const i1 = anchor == null ? -1 : ordered.indexOf(anchor)
    const i2 = ordered.indexOf(id)
    if (i1 < 0 || i2 < 0) {
      toggle(id)
      return
    }
    const [lo, hi] = i1 < i2 ? [i1, i2] : [i2, i1]
    setSelectedIds((p) => {
      const n = new Set(p)
      for (let i = lo; i <= hi; i++) n.add(ordered[i])
      return n
    })
  }

  /**
   * Handle a row click with modifiers. Returns true when it was a SELECTION gesture
   * (the caller should NOT also "open" the item); false for a plain click (the caller
   * opens the item — selection is cleared so the row highlight follows the open item).
   */
  const onItemClick = (e: ClickMods, id: number, ordered: number[]): boolean => {
    if (e.metaKey || e.ctrlKey) {
      e.preventDefault()
      toggle(id)
      return true
    }
    if (e.shiftKey) {
      e.preventDefault()
      range(id, ordered)
      return true
    }
    setSelectedIds(new Set())
    setAnchor(id)
    return false
  }

  return {
    selectedIds,
    count: selectedIds.size,
    isSelected: (id: number) => selectedIds.has(id),
    onItemClick,
    selectAll,
    toggle,
    clear,
  }
}
