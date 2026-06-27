import type { CanvasAnchor } from '../types/models'

// Resize-handle geometry shared by CanvasBoard (the board function) and the SelectionFrame
// in ./BoardParts. Extracted so both can reference one definition instead of one being
// trapped inside the 3000-line board file.

export type Sign = [number, number]

// corner handles (two-axis resize) — Figma-style frame
export const HANDLES: { key: string; sign: Sign; cursor: string }[] = [
  { key: 'nw', sign: [-1, -1], cursor: 'nwse-resize' },
  { key: 'ne', sign: [1, -1], cursor: 'nesw-resize' },
  { key: 'se', sign: [1, 1], cursor: 'nwse-resize' },
  { key: 'sw', sign: [-1, 1], cursor: 'nesw-resize' },
]
// side-midpoint handles (single-axis resize)
export const SIDE_HANDLES: { key: string; sign: Sign; cursor: string }[] = [
  { key: 'n', sign: [0, -1], cursor: 'ns-resize' },
  { key: 'e', sign: [1, 0], cursor: 'ew-resize' },
  { key: 's', sign: [0, 1], cursor: 'ns-resize' },
  { key: 'w', sign: [-1, 0], cursor: 'ew-resize' },
]
export const SIDE_ANCHORS: CanvasAnchor[] = ['t', 'r', 'b', 'l']
