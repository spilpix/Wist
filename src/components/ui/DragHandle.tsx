import { GripVertical } from 'lucide-react'

/**
 * The shared reorder grip (design-system §Drag & Drop · ручка-захват) — one look
 * everywhere. Pointer-based: wire `onMouseDown` to `useSortable`'s `onHandleDown`
 * so the row's own click survives. Styling lives in the `.drag-handle` CSS class
 * (the same class the music list uses), so every grip in the app matches.
 * Reveals on parent-`group` hover unless `alwaysVisible`.
 */
export default function DragHandle({
  onMouseDown,
  title,
  size = 14,
  alwaysVisible = false,
  className = '',
}: {
  onMouseDown?: (e: React.MouseEvent) => void
  title?: string
  size?: number
  alwaysVisible?: boolean
  className?: string
}) {
  return (
    <span
      onMouseDown={onMouseDown}
      onClick={(e) => e.stopPropagation()}
      title={title}
      aria-hidden
      className={`drag-handle shrink-0 p-0.5 ${alwaysVisible ? '' : 'opacity-0 transition-opacity group-hover:opacity-100'} ${className}`}
    >
      <GripVertical size={size} />
    </span>
  )
}
