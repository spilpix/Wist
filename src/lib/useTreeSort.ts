import { useCallback, useRef, useState } from 'react'

export interface TreeOver {
  group: string
  index: number
}

/**
 * Multi-container "grab the whole row" reorder — press a row and drag it WITHIN a
 * container or ACROSS containers; a short movement threshold means a plain click
 * still does its normal thing (navigate), and the click that follows a real drag is
 * swallowed so the row doesn't ALSO navigate. Same design-system feel as
 * {@link useSortable} (a live `.drag-ghost` clone follows the cursor, the source
 * dims via `.drag-taken`, an accent `.insert-line` marks the slot).
 *
 * Markup: each container carries `data-treesort-group="<groupId>"`, each draggable
 * row `data-treesort-item="<itemId>"`. Wire the row's `onMouseDown` to
 * `onPointerDown(e, itemId)`. `onMove(itemId, toGroup, toIndex)` fires on drop.
 * Presses that start on a `button`/`input` (e.g. the row's ••• menu) are ignored.
 * Containers with width ≤ 4 are skipped, so a hidden/zero-width mirror of the list
 * (the collapsed in-flow sidebar behind a peek overlay) can never steal the drop.
 */
export function useTreeSort(onMove: (itemId: string, toGroup: string, toIndex: number) => void) {
  const [dragId, setDragId] = useState<string | null>(null)
  const [over, setOver] = useState<TreeOver | null>(null)
  const onMoveRef = useRef(onMove)
  onMoveRef.current = onMove

  const onPointerDown = useCallback((e: React.MouseEvent, itemId: string) => {
    if (e.button !== 0) return
    const targetEl = e.target as HTMLElement
    // let presses on interactive controls inside the row (••• menu, inputs) behave normally
    if (targetEl.closest('button, input, textarea, [data-no-drag]')) return
    const itemEl = targetEl.closest<HTMLElement>('[data-treesort-item]')
    if (!itemEl) return

    const startX = e.clientX
    const startY = e.clientY
    let started = false
    let ghost: HTMLElement | null = null
    let ox = 0
    let oy = 0

    const locate = (x: number, y: number): TreeOver | null => {
      const groups = Array.from(document.querySelectorAll<HTMLElement>('[data-treesort-group]')).filter(
        (g) => g.getBoundingClientRect().width > 4
      )
      if (!groups.length) return null
      let target =
        groups.find((g) => {
          const r = g.getBoundingClientRect()
          return y >= r.top - 6 && y <= r.bottom + 6 && x >= r.left - 40 && x <= r.right + 40
        }) ?? null
      if (!target) {
        let best = Infinity
        for (const g of groups) {
          const r = g.getBoundingClientRect()
          const d = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0
          if (d < best) {
            best = d
            target = g
          }
        }
      }
      if (!target) return null
      const group = target.dataset.treesortGroup as string
      const rows = Array.from(target.querySelectorAll<HTMLElement>('[data-treesort-item]'))
      let index = rows.length
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i].getBoundingClientRect()
        if (y < r.top + r.height / 2) {
          index = i
          break
        }
      }
      return { group, index }
    }

    const begin = () => {
      started = true
      const rect = itemEl.getBoundingClientRect()
      ox = startX - rect.left
      oy = startY - rect.top
      ghost = itemEl.cloneNode(true) as HTMLElement
      ghost.classList.add('drag-ghost')
      Object.assign(ghost.style, {
        position: 'fixed',
        zIndex: '210',
        pointerEvents: 'none',
        width: `${rect.width}px`,
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        margin: '0',
      })
      document.body.appendChild(ghost)
      itemEl.classList.add('drag-taken')
      document.body.style.userSelect = 'none'
      setDragId(itemId)
    }

    const onMoveEv = (ev: MouseEvent) => {
      if (!started) {
        if (Math.abs(ev.clientX - startX) < 5 && Math.abs(ev.clientY - startY) < 5) return
        begin()
      }
      if (ghost) {
        ghost.style.left = `${ev.clientX - ox}px`
        ghost.style.top = `${ev.clientY - oy}px`
      }
      setOver(locate(ev.clientX, ev.clientY))
    }

    const finish = (ev: MouseEvent) => {
      document.removeEventListener('mousemove', onMoveEv)
      document.removeEventListener('mouseup', finish)
      if (!started) return // never moved past the threshold → it was a click, leave it alone
      document.body.style.userSelect = ''
      ghost?.remove()
      itemEl.classList.remove('drag-taken')
      const loc = locate(ev.clientX, ev.clientY)
      if (loc) onMoveRef.current(itemId, loc.group, loc.index)
      setDragId(null)
      setOver(null)
      // swallow the click that fires after this drag's mouseup so the row doesn't navigate too
      const swallow = (ce: Event) => {
        ce.preventDefault()
        ce.stopPropagation()
      }
      document.addEventListener('click', swallow, true)
      setTimeout(() => document.removeEventListener('click', swallow, true), 0)
    }

    document.addEventListener('mousemove', onMoveEv)
    document.addEventListener('mouseup', finish)
  }, [])

  return { onPointerDown, dragId, over }
}
