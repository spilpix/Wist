// Capacities-style colour-coding for object types. Maps each kind of object / nav
// destination to a hue from the (already-defined, theme-aware) --obj-* OKLCH palette
// in index.css, so a glance reads the type by colour. Surfaces/accent are untouched —
// this only tints type icons.
export type ObjHue =
  | 'blue'
  | 'cyan'
  | 'teal'
  | 'green'
  | 'lime'
  | 'yellow'
  | 'orange'
  | 'red'
  | 'pink'
  | 'purple'
  | 'indigo'
  | 'slate'

// all hues, in palette order — for colour pickers
export const OBJ_HUES: ObjHue[] = ['blue', 'cyan', 'teal', 'green', 'lime', 'yellow', 'orange', 'red', 'pink', 'purple', 'indigo', 'slate']

export const objColor = (hue: ObjHue): string => `var(--obj-${hue}-fg)`
export const objSoft = (hue: ObjHue): string => `var(--obj-${hue}-soft)`
/** Icon-chip style (coloured glyph on its own soft tint) — the Capacities object look. */
export const objIconStyle = (hue: ObjHue): { color: string; background: string } => ({ color: objColor(hue), background: objSoft(hue) })

// nav destinations → hue (sidebar / tabs). Home & Trash stay neutral (slate).
const ROUTE_HUE: Record<string, ObjHue> = {
  '/': 'slate',
  '/tasks': 'green',
  '/notes': 'blue',
  '/vault': 'yellow',
  '/canvas': 'purple',
  '/tree': 'pink',
  '/calendar': 'red',
  '/workspace': 'cyan',
  '/projects': 'teal',
  '/favorites': 'yellow',
  '/stats': 'indigo',
  '/trash': 'slate',
}

/** Hue for a route (exact, then base path, then /prefix/ details), or null if none. */
export function hueForRoute(path: string): ObjHue | null {
  if (ROUTE_HUE[path]) return ROUTE_HUE[path]
  const base = path.split('?')[0]
  if (ROUTE_HUE[base]) return ROUTE_HUE[base]
  if (base.startsWith('/project/')) return 'teal'
  if (base.startsWith('/canvas/')) return 'purple'
  return null
}

// graph / palette / relations node types → hue
const NODE_HUE: Record<string, ObjHue> = {
  note: 'blue',
  task: 'green',
  canvas: 'purple',
  project: 'teal',
  tag: 'pink',
  workspace: 'cyan',
  journal: 'orange',
  daily: 'orange',
  root: 'indigo',
  section: 'slate',
  vault: 'slate',
  file: 'slate',
  folder: 'indigo',
}

/** Hue for an object/node type (note, task, canvas, project, tag, …); slate fallback. */
export const hueForType = (type: string): ObjHue => NODE_HUE[type] ?? 'slate'

/**
 * Resolve a hue to a concrete colour string (reads the CSS var → theme-correct).
 * For <canvas> fillStyle / inline use where `var(--…)` isn't accepted. Modern Chromium
 * accepts the returned `oklch(…)`. Returns a neutral fallback outside the DOM.
 */
export function objColorHex(hue: ObjHue): string {
  if (typeof document === 'undefined') return '#888'
  return getComputedStyle(document.documentElement).getPropertyValue(`--obj-${hue}-fg`).trim() || '#888'
}
