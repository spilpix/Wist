import { create } from 'zustand'
import type { AppSettings } from '../types/models'
import { useI18nStore } from '../i18n'

interface SettingsState {
  settings: AppSettings | null
  load: () => Promise<void>
  update: (patch: Partial<AppSettings>) => Promise<void>
}

function hexToRgb(hex: string): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!m) return '212 129 58'
  return `${parseInt(m[1], 16)} ${parseInt(m[2], 16)} ${parseInt(m[3], 16)}`
}

function lighten(hex: string, amount = 0.35): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!m) return '227 173 127'
  const ch = (v: string) => Math.min(255, Math.round(parseInt(v, 16) + (255 - parseInt(v, 16)) * amount))
  return `${ch(m[1])} ${ch(m[2])} ${ch(m[3])}`
}

function darken(hex: string, amount = 0.3): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!m) return '148 90 41'
  const ch = (v: string) => Math.max(0, Math.round(parseInt(v, 16) * (1 - amount)))
  return `${ch(m[1])} ${ch(m[2])} ${ch(m[3])}`
}

// Claude brand accent is theme-specific: Crail on light, Tangerine on dark.
// An empty accentColor means "brand" (use these); a hex is a user override.
const BRAND = {
  light: { accent: '#c15f3c', hover: '#a84f30', bright: '#a84f30' },
  dark: { accent: '#e67d22', hover: '#ffa45c', bright: '#ffa45c' },
} as const

let currentAccent = ''

export function applyAccent(hex: string) {
  currentAccent = hex
  const root = document.documentElement
  const theme = resolvedTheme()
  const set = (accent: string, hover: string, bright: string) => {
    root.style.setProperty('--accent', accent)
    root.style.setProperty('--accent-rgb', hexToRgb(accent))
    root.style.setProperty('--accent-hover-rgb', hexToRgb(hover))
    root.style.setProperty('--accent-bright-rgb', hexToRgb(bright))
  }
  if (!hex || hex.toLowerCase() === 'brand') {
    const b = BRAND[theme]
    set(b.accent, b.hover, b.bright)
  } else {
    // custom accent: hover/bright derived per theme so it stays legible
    const hoverRgb = theme === 'light' ? darken(hex, 0.15) : lighten(hex, 0.2)
    const brightRgb = theme === 'light' ? darken(hex, 0.3) : lighten(hex, 0.35)
    root.style.setProperty('--accent', hex)
    root.style.setProperty('--accent-rgb', hexToRgb(hex))
    root.style.setProperty('--accent-hover-rgb', hoverRgb)
    root.style.setProperty('--accent-bright-rgb', brightRgb)
  }
}

type ThemeSetting = AppSettings['theme']
const systemDark = window.matchMedia('(prefers-color-scheme: dark)')
let currentThemeSetting: ThemeSetting = 'dark'

export function resolvedTheme(): 'dark' | 'light' {
  return (document.documentElement.dataset.theme as 'dark' | 'light') ?? 'dark'
}

export function applyTheme(setting: ThemeSetting) {
  currentThemeSetting = setting
  const resolved = setting === 'system' ? (systemDark.matches ? 'dark' : 'light') : setting
  document.documentElement.dataset.theme = resolved
  applyAccent(currentAccent) // recompute the foreground accent for the new theme
  try {
    localStorage.setItem('wist.themeResolved', resolved) // pre-paint hint for next launch
  } catch {
    /* storage unavailable */
  }
  window.wist.window.setTheme(resolved).catch(() => undefined)
}

systemDark.addEventListener('change', () => {
  if (currentThemeSetting === 'system') applyTheme('system')
})

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: null,
  load: async () => {
    let settings = await window.wist.settings.get()
    // migration to the Claude brand palette (v0.23):
    //  • accent — self-healing: any legacy default accent → '' (brand = theme-specific
    //    Crail/Tangerine). Custom accents the user explicitly picked are left untouched.
    //  • theme — one-time flip of legacy installs to dark; future manual toggles stick.
    try {
      const patch: Partial<AppSettings> = {}
      const OLD_DEFAULTS = ['#d4813a', '#7c6af7', '#7c5cbf', '#6366f1']
      if (settings.accentColor && OLD_DEFAULTS.includes(settings.accentColor.toLowerCase())) {
        patch.accentColor = ''
      }
      if (!localStorage.getItem('wist.designV2')) {
        patch.theme = 'dark'
        localStorage.setItem('wist.designV2', '1')
      }
      if (Object.keys(patch).length) settings = await window.wist.settings.set(patch)
    } catch {
      /* storage unavailable — fall back to stored settings */
    }
    applyAccent(settings.accentColor)
    applyTheme(settings.theme ?? 'dark')
    useI18nStore.getState().setLang(settings.language === 'ru' ? 'ru' : 'en')
    set({ settings })
  },
  update: async (patch) => {
    const settings = await window.wist.settings.set(patch)
    if (patch.accentColor !== undefined) applyAccent(settings.accentColor)
    if (patch.theme) applyTheme(settings.theme)
    if (patch.language) useI18nStore.getState().setLang(settings.language)
    set({ settings })
  },
}))
