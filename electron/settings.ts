import Store from 'electron-store'
import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import crypto from 'node:crypto'
import type { AppSettings } from '../src/types/models'

let store: Store<AppSettings> | null = null

function defaults(): AppSettings {
  return {
    mediaFolders: [],
    screenshotsDir: path.join(app.getPath('userData'), 'screenshots'),
    defaultSubtitleLang: 'en',
    autoPlayNext: true,
    skipIntroEnabled: true,
    accentColor: '#d4813a',
    ytDlpPath: '',
    mpvPath: '',
    language: app.getLocale().toLowerCase().startsWith('ru') ? 'ru' : 'en',
    theme: 'dark',
    apiEnabled: false,
    apiPort: 7459,
    apiToken: '',
  }
}

export function getSettings(): AppSettings {
  if (!store) store = new Store<AppSettings>({ name: 'settings', defaults: defaults() })
  // one-time token generation so the agent API is ready the moment it's enabled
  if (!store.get('apiToken')) store.set('apiToken', crypto.randomBytes(24).toString('hex'))
  return { ...defaults(), ...(store.store as AppSettings) }
}

export function regenerateApiToken(): string {
  getSettings()
  const token = crypto.randomBytes(24).toString('hex')
  store!.set('apiToken', token)
  return token
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
