import { app, BrowserWindow, ipcMain } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { UpdateStatus } from '../src/types/models'

// Auto-update via electron-updater (reads app-update.yml → GitHub Releases).
// Flow: silently check on launch → download in the background → install on the next
// quit (autoInstallOnAppQuit). The renderer (Settings) can also check manually and
// trigger an immediate "restart & install". Mirrors the Discord/VS Code experience:
// the user sees the installer once, then updates apply on their own.

let initialized = false
let lastStatus: UpdateStatus = { state: 'idle' }

function broadcast(status: UpdateStatus) {
  lastStatus = status
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send('wist:update-status', status)
}

export function initAutoUpdater(): void {
  if (initialized) return
  initialized = true

  autoUpdater.autoDownload = true // pull the update in the background as soon as it's found
  autoUpdater.autoInstallOnAppQuit = true // apply it on the next normal quit, no prompt needed

  autoUpdater.on('checking-for-update', () => broadcast({ state: 'checking' }))
  autoUpdater.on('update-available', (info) => broadcast({ state: 'available', version: info.version }))
  autoUpdater.on('update-not-available', () => broadcast({ state: 'none' }))
  autoUpdater.on('download-progress', (p) => broadcast({ state: 'downloading', percent: Math.round(p.percent) }))
  autoUpdater.on('update-downloaded', (info) => broadcast({ state: 'ready', version: info.version }))
  autoUpdater.on('error', (err) => broadcast({ state: 'error', message: String((err as Error)?.message ?? err) }))

  ipcMain.handle('updater:status', () => lastStatus)
  ipcMain.handle('updater:check', async () => {
    if (!app.isPackaged) {
      // no app-update.yml in dev — report cleanly instead of throwing
      broadcast({ state: 'error', message: 'Updates are only available in the installed build.' })
      return lastStatus
    }
    try {
      await autoUpdater.checkForUpdates()
    } catch (e) {
      broadcast({ state: 'error', message: String((e as Error)?.message ?? e) })
    }
    return lastStatus
  })
  ipcMain.handle('updater:install', () => {
    // close Bard and run the already-downloaded update now, then relaunch
    if (lastStatus.state === 'ready') autoUpdater.quitAndInstall()
  })

  // background check a few seconds after launch (packaged builds only)
  if (app.isPackaged) {
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch(() => {
        /* offline / no release yet — stay quiet */
      })
    }, 4000)
  }
}
