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
  if (!m) return '124 92 191'
  return `${parseInt(m[1], 16)} ${parseInt(m[2], 16)} ${parseInt(m[3], 16)}`
}

function lighten(hex: string, amount = 0.35): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!m) return '168 136 240'
  const ch = (v: string) => Math.min(255, Math.round(parseInt(v, 16) + (255 - parseInt(v, 16)) * amount))
  return `${ch(m[1])} ${ch(m[2])} ${ch(m[3])}`
}

export function applyAccent(hex: string) {
  const root = document.documentElement
  root.style.setProperty('--accent', hex)
  root.style.setProperty('--accent-rgb', hexToRgb(hex))
  root.style.setProperty('--accent-bright-rgb', lighten(hex))
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
    const settings = await window.wist.settings.get()
    applyAccent(settings.accentColor)
    applyTheme(settings.theme ?? 'dark')
    useI18nStore.getState().setLang(settings.language === 'ru' ? 'ru' : 'en')
    set({ settings })
  },
  update: async (patch) => {
    const settings = await window.wist.settings.set(patch)
    if (patch.accentColor) applyAccent(settings.accentColor)
    if (patch.theme) applyTheme(settings.theme)
    if (patch.language) useI18nStore.getState().setLang(settings.language)
    set({ settings })
  },
}))
