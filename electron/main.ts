import { app, BrowserWindow, nativeTheme, protocol } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { Readable } from 'node:stream'
import { openDatabase } from './db/database'
import { registerIpcHandlers } from './ipc'
import { getSettings } from './settings'
import { restartApiServer, setApiNotifier } from './apiServer'
import { startGameTracker } from './ipc/gameTracker'

// Keep reading the original "Wist" data folder after the Bard rebrand.
// app.getName() now returns "Bard" (productName), which would otherwise move
// userData to %APPDATA%/Bard and orphan the existing database, settings,
// covers, screenshots and world art. Pin it before anything touches the path.
app.setPath('userData', path.join(app.getPath('appData'), 'Wist'))

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

function createWindow() {
  const themeSetting = getSettings().theme
  const dark = themeSetting === 'system' ? nativeTheme.shouldUseDarkColors : themeSetting !== 'light'

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1080,
    minHeight: 640,
    backgroundColor: dark ? '#141210' : '#ffffff',
    autoHideMenuBar: true,
    show: false,
    title: 'Bard',
    // frameless titlebar with native Windows window controls drawn on top
    titleBarStyle: 'hidden',
    titleBarOverlay: dark
      ? { color: '#1a1814', symbolColor: '#8a8278', height: 36 }
      : { color: '#ffffff', symbolColor: '#5a5a68', height: 36 },
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

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

app.whenReady().then(() => {
  app.setAppUserModelId('com.wist.app') // proper taskbar identity on Windows
  registerMediaProtocol()
  openDatabase()
  registerIpcHandlers()
  createWindow()

  // local HTTP API for AI agents (off by default; Settings → API)
  setApiNotifier((kind) => mainWindow?.webContents.send('wist:data-changed', kind))
  restartApiServer()
  // Steam-style background playtime tracking for the Games module
  startGameTracker(() => mainWindow?.webContents.send('wist:data-changed', 'games'))

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
