import { useRef, useState } from 'react'

/**
 * The board's selection model — extracted from CanvasBoard's body as the first step of a
 * coherent board-state model. Groups the scattered selection state into one unit: the
 * selected node ids (+ a mirror ref the pointer handlers read synchronously mid-drag), the
 * selected edge, the node being text-edited, and the hovered node. The pointer handlers
 * still drive it (setSel/…); this just stops the state being sprinkled through the body.
 */
export function useSelection() {
  const [sel, setSel] = useState<Set<string>>(new Set())
  const selRef = useRef(sel)
  selRef.current = sel
  const [selEdge, setSelEdge] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [hover, setHover] = useState<string | null>(null)
  return { sel, setSel, selRef, selEdge, setSelEdge, editing, setEditing, hover, setHover }
}
