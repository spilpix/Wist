import Store from 'electron-store'
import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import type { AppSettings } from '../src/types/models'

let store: Store<AppSettings> | null = null

function defaults(): AppSettings {
  return {
    mediaFolders: [],
    screenshotsDir: path.join(app.getPath('userData'), 'screenshots'),
    defaultSubtitleLang: 'en',
    autoPlayNext: true,
    skipIntroEnabled: true,
    accentColor: '#7c5cbf',
    ytDlpPath: '',
    mpvPath: '',
    language: app.getLocale().toLowerCase().startsWith('ru') ? 'ru' : 'en',
    theme: 'dark',
  }
}

export function getSettings(): AppSettings {
  if (!store) store = new Store<AppSettings>({ name: 'settings', defaults: defaults() })
  return { ...defaults(), ...(store.store as AppSettings) }
}

export function setSettings(patch: Partial<AppSettings>): AppSettings {
  getSettings() // ensure store
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue
    store!.set(key as keyof AppSettings, value as never)
  }
  return getSettings()
}

export function screenshotsDir(): string {
  const dir = getSettings().screenshotsDir
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

export function coversDir(): string {
  const dir = path.join(app.getPath('userData'), 'covers')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}
