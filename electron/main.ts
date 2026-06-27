import { app, BrowserWindow, Menu, nativeTheme, protocol } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { Readable } from 'node:stream'
import { openDatabase, closeDatabase } from './db/database'
import { seedDemoContent } from './db/seed'
import { syncBrain } from './ipc/brain'
import { registerIpcHandlers } from './ipc'
import { getSettings, setSettings } from './settings'
import { restartApiServer, setApiNotifier } from './apiServer'
import { startReminders } from './reminders'
import { initAutoUpdater } from './updater'

// Baked in at build time by Vite's `define` (see vite.config.ts). True only in the
// dedicated "Testing Bard" build, which is fully isolated from real data and ships
// pre-filled with demo content.
declare const __BARD_TESTING__: boolean
const TESTING = typeof __BARD_TESTING__ !== 'undefined' && __BARD_TESTING__

// Keep reading the original "Wist" data folder after the Bard rebrand.
// app.getName() now returns "Bard" (productName), which would otherwise move
// userData to %APPDATA%/Bard and orphan the existing database, settings,
// covers, screenshots and world art. Pin it before anything touches the path.
// The Testing build points at a SEPARATE folder so it can never touch real data.
// WIST_USER_DATA is a test-only escape hatch: smoke/screenshot scripts set it to a
// throwaway temp dir so they run against an isolated DB and never touch real data.
// It is never set in production (on Windows, Electron ignores the APPDATA env var —
// it reads the OS known-folder API — so this explicit hook is the only safe isolation).
app.setPath('userData', process.env.WIST_USER_DATA || path.join(app.getPath('appData'), TESTING ? 'WistTesting' : 'Wist'))

// Custom scheme that streams local media (video, covers, screenshots) into the
// renderer with Range support — file:// is blocked by web security.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'media',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true },
  },
])

const MIME: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.mkv': 'video/x-matroska',
  '.webm': 'video/webm',
  '.avi': 'video/x-msvideo',
  '.mov': 'video/quicktime',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.avif': 'image/avif',
  // audio (local music library)
  '.mp3': 'audio/mpeg',
  '.flac': 'audio/flac',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.wav': 'audio/wav',
  '.wma': 'audio/x-ms-wma',
}

function registerMediaProtocol() {
  protocol.handle('media', async (request) => {
    let filePath = ''
    try {
      const url = new URL(request.url)
      filePath = decodeURIComponent(url.searchParams.get('p') ?? '')
      const stat = await fs.promises.stat(filePath)
      if (!stat.isFile()) return new Response('Not a file', { status: 404 })

      const mime = MIME[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream'
      const baseHeaders: Record<string, string> = {
        'Content-Type': mime,
        'Accept-Ranges': 'bytes',
        'Access-Control-Allow-Origin': '*', // allows canvas frame capture (screenshots/moments)
      }

      const range = request.headers.get('range')
      if (range) {
        const m = /bytes=(\d*)-(\d*)/.exec(range)
        let start = m && m[1] ? parseInt(m[1], 10) : 0
        let end = m && m[2] ? parseInt(m[2], 10) : stat.size - 1
        end = Math.min(end, stat.size - 1)
        if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= stat.size) {
          return new Response('Range not satisfiable', {
            status: 416,
            headers: { 'Content-Range': `bytes */${stat.size}` },
          })
        }
        const stream = fs.createReadStream(filePath, { start, end })
        return new Response(Readable.toWeb(stream) as unknown as BodyInit, {
          status: 206,
          headers: {
            ...baseHeaders,
            'Content-Range': `bytes ${start}-${end}/${stat.size}`,
            'Content-Length': String(end - start + 1),
          },
        })
      }

      const stream = fs.createReadStream(filePath)
      return new Response(Readable.toWeb(stream) as unknown as BodyInit, {
        status: 200,
        headers: { ...baseHeaders, 'Content-Length': String(stat.size) },
      })
    } catch (err) {
      console.error('media protocol error for', filePath, err)
      return new Response('Not found', { status: 404 })
    }
  })
}

let mainWindow: BrowserWindow | null = null
let reminderTimer: NodeJS.Timeout | null = null

function createWindow() {
  const themeSetting = getSettings().theme
  const dark = themeSetting === 'system' ? nativeTheme.shouldUseDarkColors : themeSetting !== 'light'

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1080,
    minHeight: 640,
    backgroundColor: dark ? '#191919' : '#ffffff',
    autoHideMenuBar: true,
    show: false,
    title: TESTING ? 'Testing Bard' : 'Bard',
    // frameless titlebar with native Windows window controls drawn on top
    titleBarStyle: 'hidden',
    titleBarOverlay: dark
      ? { color: '#202020', symbolColor: '#9b9b99', height: 42 }
      : { color: '#f7f7f5', symbolColor: '#787774', height: 42 },
    // packaged builds inherit the window icon from the exe resource
    ...(app.isPackaged ? {} : { icon: path.join(__dirname, '../build/icon.png') }),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => (mainWindow = null))

  // Drop the default application menu. Its native accelerators were shadowing the app's
  // own shortcuts: the Edit roles (Ctrl+Z/Y/X/C/V/A) hijacked the canvas's undo/redo/
  // clipboard, and Window→Close (Ctrl+W) closed the whole window. With no menu the
  // renderer owns every shortcut; standard text-field editing still works natively.
  Menu.setApplicationMenu(null)
  // keep reload / devtools reachable in development (no menu to provide them)
  if (!app.isPackaged) {
    mainWindow.webContents.on('before-input-event', (_e, input) => {
      if (input.type !== 'keyDown') return
      const ctrl = input.control || input.meta
      const key = input.key.toLowerCase()
      if (input.key === 'F12' || (ctrl && input.shift && key === 'i')) mainWindow?.webContents.toggleDevTools()
      else if (ctrl && key === 'r') mainWindow?.webContents.reload()
    })
  }

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }
  return mainWindow
}

// Single-instance guard. A second launch would open another process against the SAME
// wist.db + WAL (a known path to a corrupt "malformed" image on the next start) and
// collide on the local API port. Refuse the second instance and focus the running one.
// The Testing build skips the lock so it can run alongside the real app (separate data).
const gotInstanceLock = TESTING || app.requestSingleInstanceLock()
if (!gotInstanceLock) app.quit()
app.on('second-instance', () => {
  if (!mainWindow) {
    createWindow()
    return
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
})

app.whenReady().then(() => {
  if (!gotInstanceLock) return // lost the lock — we're quitting; don't touch the db/window
  app.setAppUserModelId(TESTING ? 'com.wist.testing' : 'com.wist.app') // proper taskbar identity on Windows
  registerMediaProtocol()
  openDatabase()
  // Testing build: fill an empty database with demo content and switch to the
  // Russian demo persona on first run, so the app shows off end-to-end.
  if (TESTING) {
    try {
      if (seedDemoContent()) setSettings({ profileName: 'Эрадж', language: 'ru', theme: 'dark' })
    } catch (e) {
      console.error('[seed] demo content seeding failed', e)
    }
  }
  registerIpcHandlers()
  createWindow()

  // auto-update: silent background check → download → install on next quit (packaged only)
  initAutoUpdater()

  // local HTTP API for AI agents (off by default; Settings → API)
  setApiNotifier((kind) => mainWindow?.webContents.send('wist:data-changed', kind))
  restartApiServer()

  // task reminders → native OS notifications; clicking one brings Bard to the front
  reminderTimer = startReminders(() => {
    if (!mainWindow) {
      const w = createWindow()
      // wait for the renderer before navigating, else the message is dropped
      w.webContents.once('did-finish-load', () => w.webContents.send('wist:navigate', '/tasks'))
      return
    }
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
    mainWindow.webContents.send('wist:navigate', '/tasks')
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('will-quit', () => {
  if (reminderTimer) clearInterval(reminderTimer)
  // mirror the brain to its portable folder so the knowledge survives a reinstall
  try {
    syncBrain()
  } catch (e) {
    console.error('[brain] sync on quit failed', e)
  }
  // checkpoint + close the db so the WAL is never left desynced across exit
  closeDatabase()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
