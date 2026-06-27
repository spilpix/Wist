// Per-type tint for workspace-tab icons. Delegates to the single source of truth
// (objectColors → the theme-aware --obj-* palette) so a type reads the SAME colour in
// the tab strip and the sidebar. The TabBar still tints only the ACTIVE tab (сдержанно),
// keeping the bar calm. Returns null for routes that should stay neutral (Home, …).
import { hueForRoute, objColor } from './objectColors'

/** Tint colour for a route's tab icon, or null when it should use neutral ink. */
export function colorForPath(path: string): string | null {
  const hue = hueForRoute(path)
  return hue && hue !== 'slate' ? objColor(hue) : null
}
