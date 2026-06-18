import { useCallback, useRef, useState } from 'react'

/**
 * Pointer-based list reorder with the design-system drag feel — a live clone of
 * the row (`.drag-ghost`) follows the cursor (tilt 2.5° + float shadow), the
 * source dims (`.drag-taken`), and an accent `.insert-line` marks the slot.
 *
 * Why pointer events, not native HTML5 drag: the native drag image is a frozen
 * bitmap — no live motion, no insertion line, no settle. This mirrors
 * design-system.html's pointer ghost exactly. (Native drag is kept for OS
 * drag-out / cross-section drops; see lib/mediaDrag.ts.)
 *
 * Usage:
 *   const { onHandleDown, draggingId, overIndex } = useSortable(ids, onReorder)
 *   <ul data-sortable-container>
 *     {ids.map((id, i) => (
 *       <Fragment key={id}>
 *         {overIndex === i && <div className="insert-line" />}
 *         <li data-sortable-item className={draggingId === id ? 'drag-taken' : ''}>
 *           <span className="drag-handle" onMouseDown={(e) => onHandleDown(e, id)}>⋮⋮</span>
 *           …
 *         </li>
 *       </Fragment>
 *     ))}
 *     {overIndex === ids.length && <div className="insert-line" />}
 *   </ul>
 */
export function useSortable<T extends string | number>(
  ids: T[],
  onReorder: (ordered: T[]) => void
) {
  const [draggingId, setDraggingId] = useState<T | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)
  // keep the latest ids without re-binding the handler mid-drag
  const idsRef = useRef(ids)
  idsRef.current = ids

  const onHandleDown = useCallback(
    (e: React.MouseEvent, id: T) => {
      if (e.button !== 0) return
      const itemEl = (e.target as HTMLElement).closest<HTMLElement>('[data-sortable-item]')
      if (!itemEl) return
      const container = itemEl.closest<HTMLElement>('[data-sortable-container]') ?? itemEl.parentElement
      if (!container) return
      e.preventDefault()

      const rect = itemEl.getBoundingClientRect()
      const ox = e.clientX - rect.left
      const oy = e.clientY - rect.top

      // live ghost = a clone that tracks the cursor
      const ghost = itemEl.cloneNode(true) as HTMLElement
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
      setDraggingId(id)

      // insertion index in the FULL list (0..n) from the cursor's Y against each row's midpoint
      const slotAt = (clientY: number): number => {
        const rows = Array.from(container.querySelectorAll<HTMLElement>('[data-sortable-item]'))
        for (let i = 0; i < rows.length; i++) {
          const r = rows[i].getBoundingClientRect()
          if (clientY < r.top + r.height / 2) return i
        }
        return rows.length
      }

      const onMove = (ev: MouseEvent) => {
        ghost.style.left = `${ev.clientX - ox}px`
        ghost.style.top = `${ev.clientY - oy}px`
        setOverIndex(slotAt(ev.clientY))
      }

      const finish = (ev: MouseEvent) => {
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', finish)
        document.body.style.userSelect = ''
        ghost.remove()
        itemEl.classList.remove('drag-taken')

        const cur = idsRef.current
        const from = cur.indexOf(id)
        const slot = slotAt(ev.clientY)
        if (from !== -1) {
          // slot was measured with the source still in place → shift when moving down
          let to = slot > from ? slot - 1 : slot
          to = Math.max(0, Math.min(cur.length - 1, to))
          if (to !== from) {
            const next = cur.slice()
            next.splice(from, 1)
            next.splice(to, 0, id)
            onReorder(next)
          }
        }
        setDraggingId(null)
        setOverIndex(null)
      }

      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', finish)
    },
    [onReorder]
  )

  return { onHandleDown, draggingId, overIndex }
}
