import type { CSSProperties } from 'react'
import type { TKey } from '../i18n'

// Accent presets shared by the Settings page and the top-bar AccentSwatch. An empty
// `value` means "brand" (Notion blue #2383E2, theme-tuned in settingsStore); a hex is
// an explicit user override. Single source of truth so the bar and Settings never drift.
export const ACCENT_PRESETS: Array<{ nameKey: TKey; value: string }> = [
  { nameKey: 'set.accent.brand', value: '' }, // Notion blue #2383E2 (both themes)
  { nameKey: 'set.accent.amber', value: '#e67d22' },
  { nameKey: 'set.accent.crail', value: '#c15f3c' },
  { nameKey: 'set.accent.teal', value: '#3a8a8a' },
  { nameKey: 'set.accent.blue', value: '#7aa8c4' },
  { nameKey: 'set.accent.rose', value: '#c47a7a' },
]

/** Background for a swatch dot: the brand entry shows the live `--accent` gradient,
 *  a preset shows its flat hex. */
export function swatchStyle(value: string): CSSProperties {
  return value
    ? { backgroundColor: value }
    : { backgroundImage: 'linear-gradient(135deg, var(--accent), rgb(var(--accent-hover-rgb)))' }
}
