import type { CanvasShape } from '../types/models'

// active creation/interaction tool
export type ToolKey = 'select' | 'hand' | 'frame' | 'sticky' | 'text' | 'shape' | 'connector' | 'pen' | 'image' | 'comment'

// ── sticky-note palette — vivid, Miro-style ──────────────────────────────────
export const STICKY_COLORS = [
  '#FFE45C', // yellow
  '#FFB84D', // orange
  '#FF8A8A', // coral
  '#F778BA', // pink
  '#C499FF', // purple
  '#8AA6FF', // blue
  '#5FCDEB', // cyan
  '#62D9A8', // teal
  '#A6E05A', // green
  '#FFFFFF', // white
]

// ── generic fill / stroke / text palette ─────────────────────────────────────
// vivid, friendly (FigJam-ish) but still readable on BOTH the dark and light board.
// '' = no fill / transparent. NOTE: index 8 (dark ink) is reused as the default
// stroke colour and index 9 (white) is relied on elsewhere — keep them last.
export const PAINT_COLORS = [
  '#E5484D', // red
  '#EC7E22', // orange
  '#F2C037', // yellow
  '#46A758', // green
  '#1FAD9F', // teal
  '#3A8BE0', // blue
  '#8453E8', // violet
  '#E0609F', // pink
  '#2C2418', // dark ink — also the default stroke colour
  '#FFFFFF', // white
]

// font families offered for text / sticky / shape labels. `css` is a system-safe
// stack (no web-font loading needed); '' / 'default' falls back to the app sans.
export const FONTS: { key: string; label: string; css: string }[] = [
  { key: 'default', label: 'Sans', css: '' },
  { key: 'serif', label: 'Serif', css: 'Georgia, "Times New Roman", serif' },
  { key: 'mono', label: 'Mono', css: 'ui-monospace, Consolas, "Courier New", monospace' },
  { key: 'rounded', label: 'Rounded', css: '"Segoe UI", "Trebuchet MS", system-ui, sans-serif' },
  { key: 'hand', label: 'Hand', css: '"Comic Sans MS", "Segoe Print", "Bradley Hand", cursive' },
  { key: 'slab', label: 'Slab', css: '"Rockwell", "Roboto Slab", Georgia, serif' },
]
export const fontCss = (key?: string): string | undefined => (key && key !== 'default' ? FONTS.find((f) => f.key === key)?.css || undefined : undefined)

// the 12 shapes offered by the Shape tool
export const SHAPE_LIST: CanvasShape[] = [
  'rect',
  'roundRect',
  'ellipse',
  'diamond',
  'triangle',
  'parallelogram',
  'cylinder',
  'cloud',
  'star',
  'arrowRight',
  'hexagon',
  'pentagon',
]

// active-state / selection accent (Miro blue) — used for active tool buttons,
// selection handles, marquee and connectors, independent of the app theme accent
export const ACTIVE = '#2383E1'
export const ACTIVE_RGB = '35 131 225'

// default look for a freshly-drawn shape — a neutral grey that reads clearly on
// BOTH the dark and the light board (Figma's default rectangle), no border.
export const SHAPE_DEFAULT_FILL = '#D9D9D9'
export const SHAPE_DEFAULT_STROKE = '#9B9B9B'
// default corner radius for the rounded-rectangle preset
export const ROUND_RECT_RADIUS = 16
// default font size for a free-standing text object (it auto-grows in height)
export const TEXT_DEFAULT_SIZE = 18

// rect-like shapes get an HTML border so the corner radius is freely draggable;
// every other shape stays an SVG path
export const isRectish = (s?: string) => s === 'rect' || s === 'roundRect'
// nodes that support an adjustable corner radius (Figma corner handles)
export const supportsRadius = (n: { type: string; shape?: string }) =>
  n.type === 'image' || n.type === 'sticky' || n.type === 'text' || (n.type === 'shape' && isRectish(n.shape))
// largest legal radius for a box (can't exceed half its shortest side)
export const maxRadius = (w: number, h: number) => Math.max(0, Math.floor(Math.min(w, h) / 2))

export const GRID = 24 // snap step / visible grid spacing (world units)
export const RULER_SIZE = 22 // thickness (screen px) of the top / left rulers
export const GUIDE_COLOR = '#F24822' // Figma-style red ruler guide

// FigJam-style sticky author — a name stamped on new notes, remembered across boards
export const CANVAS_AUTHOR_KEY = 'wist.canvasAuthor'
export const getCanvasAuthor = (): string => {
  try {
    return (localStorage.getItem(CANVAS_AUTHOR_KEY) ?? '').trim()
  } catch {
    return ''
  }
}
export const setCanvasAuthor = (name: string) => {
  try {
    const v = name.trim()
    v ? localStorage.setItem(CANVAS_AUTHOR_KEY, v) : localStorage.removeItem(CANVAS_AUTHOR_KEY)
  } catch {
    /* storage unavailable */
  }
}
// gap (world px) left between a connector endpoint and the block edge (safe zone)
export const CONN_GAP = 10
export const MIN_ZOOM = 0.1 // 10%
export const MAX_ZOOM = 8 // 800%

// default sizes for freshly-created objects
export const DEFAULTS = {
  sticky: { w: 180, h: 180 },
  text: { w: 220, h: 80 },
  shape: { w: 160, h: 120 },
  image: { w: 260, h: 200 },
  note: { w: 240, h: 130 },
  task: { w: 240, h: 96 },
  frame: { w: 640, h: 400 },
  comment: { w: 32, h: 32 },
}

// 16:9 frame presets offered when the Frame tool is picked
export const FRAME_PRESETS: { id: string; label: string; w: number; h: number }[] = [
  { id: 'wide', label: '16:9', w: 960, h: 540 },
  { id: 'a4', label: 'A4', w: 794, h: 1123 },
  { id: 'square', label: '1:1', w: 700, h: 700 },
  { id: 'free', label: '4:3', w: 800, h: 600 },
]
