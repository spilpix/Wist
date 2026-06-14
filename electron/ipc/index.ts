import { app, ipcMain, nativeImage, shell, dialog, BrowserWindow } from 'electron'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import * as titles from '../db/titles'
import * as episodes from '../db/episodes'
import * as moments from '../db/moments'
import * as notes from '../db/notes'
import * as journal from '../db/journal'
import * as tasks from '../db/tasks'
import * as projects from '../db/projects'
import * as gamesDb from '../db/games'
import * as canvases from '../db/canvases'
import { runningGameIds } from './gameTracker'
import * as playlists from '../db/playlists'
import * as vault from '../db/vault'
import * as sessions from '../db/sessions'
import * as stats from '../db/stats'
import * as youtube from '../db/youtube'
import { memories } from '../db/memories'
import * as files from './files'
import * as data from './data'
import { detectSubtitles } from './subtitles'
import { fetchVideos } from './ytdlp'
import { searchTitleMeta, downloadCover, fetchOembed } from './metadata'
import { getSettings, setSettings, regenerateApiToken, screenshotsDir } from '../settings'
import { restartApiServer } from '../apiServer'
import type { MomentTag, TitleType } from '../../src/types/models'

export function registerIpcHandlers(): void {
  // --- titles ---
  ipcMain.handle('titles:list', (_e, filters) => titles.listTitles(filters ?? {}))
  ipcMain.handle('titles:get', (_e, id: number) => titles.getTitle(id))
  ipcMain.handle('titles:create', (_e, payload) => titles.createTitle(payload))
  ipcMain.handle('titles:update', (_e, id: number, patch) => titles.updateTitle(id, patch))
  ipcMain.handle('titles:remove', (_e, id: number) => titles.deleteTitle(id))
  ipcMain.handle('titles:setIntroEnd', (_e, id: number, seconds: number | null) => titles.setIntroEnd(id, seconds))
  ipcMain.handle('titles:genres', () => titles.distinctGenres())
  ipcMain.handle('titles:years', () => titles.distinctYears())

  // --- episodes ---
  ipcMain.handle('episodes:listByTitle', (_e, titleId: number) => episodes.listEpisodesByTitle(titleId))
  ipcMain.handle('episodes:get', (_e, id: number) => episodes.getEpisodeBundle(id))
  ipcMain.handle('episodes:bulkCreate', (_e, items) => episodes.bulkCreateEpisodes(items))
  ipcMain.handle('episodes:update', (_e, id: number, patch) => episodes.updateEpisode(id, patch))
  ipcMain.handle('episodes:setProgress', (_e, id: number, position: number, duration?: number | null) =>
    episodes.setProgress(id, position, duration)
  )
  ipcMain.handle('episodes:markWatched', (_e, id: number, watched: boolean) => episodes.markWatched(id, watched))
  ipcMain.handle('episodes:remove', (_e, id: number) => episodes.deleteEpisode(id))
  ipcMain.handle('episodes:continueWatching', () => episodes.continueWatching())

  // --- moments ---
  ipcMain.handle('moments:list', (_e, filters) => moments.listMoments(filters ?? {}))
  ipcMain.handle('moments:create', (_e, payload: {
    title_id: number
    episode_id: number | null
    timestamp_seconds: number
    note: string | null
    tag: MomentTag | null
    screenshotDataUrl: string | null
    baseName: string
  }) => {
    let screenshotPath: string | null = null
    if (payload.screenshotDataUrl) {
      screenshotPath = files.saveScreenshotDataUrl(payload.screenshotDataUrl, payload.baseName, screenshotsDir())
    }
    return moments.createMoment({
      title_id: payload.title_id,
      episode_id: payload.episode_id,
      timestamp_seconds: payload.timestamp_seconds,
      screenshot_path: screenshotPath,
      note: payload.note,
      tag: payload.tag,
    })
  })
  ipcMain.handle('moments:update', (_e, id: number, patch) => moments.updateMoment(id, patch))
  ipcMain.handle('moments:remove', (_e, id: number) => {
    const moment = moments.listMoments().find((m) => m.id === id)
    moments.deleteMoment(id)
    // best-effort: remove the orphaned screenshot file
    if (moment?.screenshot_path) {
      try { fs.unlinkSync(moment.screenshot_path) } catch { /* keep file */ }
    }
  })
  ipcMain.handle('moments:exportAll', () => data.exportMoments())

  // --- notes ---
  ipcMain.handle('notes:list', (_e, filters) => notes.listNotes(filters ?? {}))
  ipcMain.handle('notes:get', (_e, id: number) => notes.getNote(id))
  ipcMain.handle('notes:create', (_e, payload) => notes.createNote(payload ?? {}))
  ipcMain.handle('notes:update', (_e, id: number, patch) => notes.updateNote(id, patch ?? {}))
  ipcMain.handle('notes:remove', (_e, id: number) => notes.deleteNote(id))
  ipcMain.handle('notes:tags', () => notes.distinctNoteTags())

  // --- journal ---
  ipcMain.handle('journal:list', () => journal.listEntries())
  ipcMain.handle('journal:get', (_e, day: string) => journal.getEntry(day))
  ipcMain.handle('journal:upsert', (_e, day: string, patch) => journal.upsertEntry(day, patch ?? {}))
  ipcMain.handle('journal:remove', (_e, day: string) => journal.deleteEntry(day))
  ipcMain.handle('journal:streak', () => journal.streak())

  // --- tasks ---
  ipcMain.handle('tasks:list', (_e, filters) => tasks.listTasks(filters ?? {}))
  ipcMain.handle('tasks:create', (_e, payload) => tasks.createTask(payload ?? {}))
  ipcMain.handle('tasks:update', (_e, id: number, patch) => tasks.updateTask(id, patch ?? {}))
  ipcMain.handle('tasks:remove', (_e, id: number) => tasks.deleteTask(id))
  ipcMain.handle('tasks:clearCompleted', () => tasks.clearCompleted())

  // --- projects ---
  ipcMain.handle('projects:list', () => projects.listProjects())
  ipcMain.handle('projects:get', (_e, id: number) => projects.getProject(id))
  ipcMain.handle('projects:create', (_e, payload) => projects.createProject(payload ?? {}))
  ipcMain.handle('projects:update', (_e, id: number, patch) => projects.updateProject(id, patch ?? {}))
  ipcMain.handle('projects:remove', (_e, id: number) => projects.deleteProject(id))
  ipcMain.handle('projects:reorder', (_e, ids: number[]) => projects.reorderProjects(ids ?? []))

  // project assets (folders / files / reference images / links)
  ipcMain.handle('projects:assets', (_e, projectId: number) => projects.listAssets(projectId))
  ipcMain.handle('projects:addFiles', async (_e, projectId: number) => {
    const res = await dialog.showOpenDialog(BrowserWindow.getAllWindows()[0]!, { properties: ['openFile', 'multiSelections'] })
    if (res.canceled || !res.filePaths.length) return 0
    return projects.addAssets(projectId, res.filePaths.map((p) => ({ kind: 'file' as const, path: p, label: path.basename(p) })))
  })
  ipcMain.handle('projects:addFolder', async (_e, projectId: number) => {
    const res = await dialog.showOpenDialog(BrowserWindow.getAllWindows()[0]!, { properties: ['openDirectory', 'multiSelections'] })
    if (res.canceled || !res.filePaths.length) return 0
    return projects.addAssets(projectId, res.filePaths.map((p) => ({ kind: 'folder' as const, path: p, label: path.basename(p) })))
  })
  ipcMain.handle('projects:addImages', async (_e, projectId: number) => {
    const res = await dialog.showOpenDialog(BrowserWindow.getAllWindows()[0]!, {
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif'] }],
    })
    if (res.canceled || !res.filePaths.length) return 0
    return projects.addAssets(projectId, res.filePaths.map((p) => ({ kind: 'image' as const, path: p, label: path.basename(p) })))
  })
  ipcMain.handle('projects:addUrl', (_e, projectId: number, url: string, label: string | null) =>
    projects.addAssets(projectId, [{ kind: 'url', url, label: label || url }])
  )
  // drag-drop from the OS: classify each dropped path (dir → folder, image ext → image, else file)
  ipcMain.handle('projects:addPaths', (_e, projectId: number, paths: string[]) => {
    const items = (paths ?? []).filter(Boolean).map((p) => {
      let kind: 'folder' | 'image' | 'file' = 'file'
      try {
        if (fs.statSync(p).isDirectory()) kind = 'folder'
      } catch { /* unreadable path → treat as file */ }
      if (kind === 'file' && /\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(p)) kind = 'image'
      return { kind, path: p, label: path.basename(p) }
    })
    return projects.addAssets(projectId, items)
  })
  ipcMain.handle('projects:removeAsset', (_e, id: number) => projects.removeAsset(id))
  ipcMain.handle('projects:reorderAssets', (_e, ids: number[]) => projects.reorderAssets(ids ?? []))

  // --- playlists ---
  ipcMain.handle('playlists:list', () => playlists.listPlaylists())
  ipcMain.handle('playlists:create', (_e, payload) => playlists.createPlaylist(payload ?? {}))
  ipcMain.handle('playlists:update', (_e, id: number, patch) => playlists.updatePlaylist(id, patch ?? {}))
  ipcMain.handle('playlists:remove', (_e, id: number) => playlists.deletePlaylist(id))

  // --- vault ---
  ipcMain.handle('vault:list', (_e, parentId?: number | null) => vault.listVaultFiles(parentId ?? null))
  ipcMain.handle('vault:browse', (_e, dir: string) => vault.browseDir(dir))
  ipcMain.handle('vault:addPaths', (_e, paths: string[], parentId?: number | null) =>
    vault.addVaultFiles(paths ?? [], parentId ?? null)
  )
  ipcMain.handle('vault:createFolder', (_e, name: string, parentId?: number | null) =>
    vault.createVaultFolder(name, parentId ?? null)
  )
  ipcMain.handle('vault:rename', (_e, id: number, name: string) => vault.renameVaultItem(id, name))
  ipcMain.handle('vault:move', (_e, id: number, parentId: number | null) => vault.moveVaultItem(id, parentId ?? null))
  ipcMain.handle('vault:pickAndAdd', async (_e, parentId?: number | null) => {
    const res = await dialog.showOpenDialog(BrowserWindow.getAllWindows()[0]!, {
      properties: ['openFile', 'multiSelections'],
    })
    if (res.canceled || !res.filePaths.length) return 0
    return vault.addVaultFiles(res.filePaths, parentId ?? null)
  })
  ipcMain.handle('vault:addFolder', async (_e, parentId?: number | null) => {
    const res = await dialog.showOpenDialog(BrowserWindow.getAllWindows()[0]!, {
      properties: ['openDirectory', 'multiSelections'],
    })
    if (res.canceled || !res.filePaths.length) return 0
    // add each picked directory as ONE live folder link — opening it browses the real
    // contents on demand (no recursive flatten, no thousands of imported rows).
    return vault.addDiskFolders(res.filePaths, parentId ?? null)
  })
  ipcMain.handle('vault:remove', (_e, id: number) => vault.removeVaultFile(id))
  ipcMain.handle('vault:open', (_e, p: string) => shell.openPath(p))
  // native OS drag-out: drag a vault file to the desktop, Explorer, chat, etc.
  ipcMain.on('vault:startDrag', (event, filePath: string) => {
    try {
      let icon = nativeImage.createFromPath(path.join(app.getAppPath(), 'build', 'icon-32.png'))
      if (icon.isEmpty()) icon = nativeImage.createFromPath(filePath) // images preview themselves
      if (icon.isEmpty()) {
        // last resort: a 1px transparent image keeps startDrag from throwing
        icon = nativeImage.createFromDataURL(
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPgPAAEDAQAIicLsAAAAAElFTkSuQmCC'
        )
      }
      event.sender.startDrag({ file: filePath, icon })
    } catch (err) {
      console.error('vault:startDrag failed', err)
    }
  })

  // --- world art layers (user-painted PNGs in %APPDATA%/Wist/world) ---
  ipcMain.handle('files:worldAssets', () => {
    const dir = path.join(app.getPath('userData'), 'world')
    fs.mkdirSync(dir, { recursive: true })
    const layers: Record<string, string> = {
      sky: 'sky',
      hillsFar: 'hills-far',
      hillsNear: 'hills-near',
      tree: 'tree',
      foreground: 'foreground',
    }
    const out: Record<string, string> = { _dir: dir }
    for (const [key, base] of Object.entries(layers)) {
      for (const ext of ['.png', '.webp', '.jpg']) {
        const p = path.join(dir, base + ext)
        if (fs.existsSync(p)) {
          out[key] = p
          break
        }
      }
    }
    return out
  })

  // --- games (Steam-style auto playtime tracking) ---
  ipcMain.handle('games:list', () => gamesDb.listGames())
  ipcMain.handle('games:get', (_e, id: number) => gamesDb.getGame(id))
  ipcMain.handle('games:create', (_e, payload) => gamesDb.createGame(payload))
  ipcMain.handle('games:update', (_e, id: number, patch) => gamesDb.updateGame(id, patch ?? {}))
  ipcMain.handle('games:remove', (_e, id: number) => gamesDb.deleteGame(id))
  ipcMain.handle('games:running', () => runningGameIds())
  ipcMain.handle('games:pickExe', async () => {
    const res = await dialog.showOpenDialog(BrowserWindow.getAllWindows()[0]!, {
      properties: ['openFile'],
      filters: [{ name: 'Game executable', extensions: ['exe'] }],
    })
    return res.canceled || !res.filePaths.length ? null : res.filePaths[0]
  })

  // --- canvas (infinite board) ---
  ipcMain.handle('canvas:list', () => canvases.listCanvases())
  ipcMain.handle('canvas:get', (_e, id: number) => canvases.getCanvas(id))
  ipcMain.handle('canvas:create', (_e, name: string) => canvases.createCanvas(name))
  ipcMain.handle('canvas:update', (_e, id: number, patch) => canvases.updateCanvas(id, patch ?? {}))
  ipcMain.handle('canvas:remove', (_e, id: number) => canvases.deleteCanvas(id))

  // --- metadata from the internet ---
  ipcMain.handle('meta:searchTitles', (_e, type: TitleType, query: string) => searchTitleMeta(type, query))
  ipcMain.handle('meta:coverFromUrl', (_e, url: string) => downloadCover(url))
  ipcMain.handle('meta:oembed', (_e, url: string) => fetchOembed(url))

  // --- youtube ---
  ipcMain.handle('youtube:sources', (_e, titleId?: number) => youtube.listSources(titleId))
  ipcMain.handle('youtube:addSource', (_e, titleId: number, url: string) => youtube.addSource(titleId, url))
  ipcMain.handle('youtube:removeSource', (_e, id: number) => youtube.removeSource(id))
  ipcMain.handle('youtube:fetchVideos', (_e, url: string) => fetchVideos(url))
  ipcMain.handle('youtube:syncSource', async (_e, sourceId: number) => {
    const source = youtube.getSource(sourceId)
    if (!source) throw new Error('Source not found')
    const url = source.playlist_url ?? source.channel_url
    if (!url) throw new Error('Source has no URL')
    const videos = await fetchVideos(url)
    return youtube.insertVideosAsEpisodes(sourceId, videos)
  })

  // --- sessions / stats ---
  ipcMain.handle('sessions:start', (_e, titleId, episodeId) => sessions.startSession(titleId, episodeId))
  ipcMain.handle('sessions:end', (_e, id: number, duration: number) => sessions.endSession(id, duration))
  ipcMain.handle('stats:summary', () => stats.summary())
  ipcMain.handle('stats:heatmap', () => stats.heatmap())
  ipcMain.handle('stats:byType', () => stats.byType())
  ipcMain.handle('stats:monthly', () => stats.monthly())
  ipcMain.handle('stats:topRated', () => stats.topRated())
  ipcMain.handle('stats:recentlyAdded', () => stats.recentlyAdded())
  ipcMain.handle('stats:memories', () => memories())

  // --- files ---
  ipcMain.handle('files:pickVideos', () => files.pickVideos())
  ipcMain.handle('files:pickFolder', () => files.pickFolder())
  ipcMain.handle('files:listVideosInFolder', (_e, folder: string) => files.listVideosInFolder(folder))
  ipcMain.handle('files:scanMediaFolders', () => files.scanMediaFolders())
  ipcMain.handle('files:existingPaths', () => episodes.existingFilePaths())
  ipcMain.handle('files:importEpisodes', (_e, groups) => files.importEpisodes(groups))
  ipcMain.handle('files:pickImage', () => files.pickImage())
  ipcMain.handle('files:saveCoverFromPath', (_e, src: string) => files.saveCoverFromPath(src))
  ipcMain.handle('files:saveCoverFromBytes', (_e, name: string, bytes: ArrayBuffer) =>
    files.saveCoverFromBytes(name, bytes)
  )

  // --- media ---
  ipcMain.handle('media:subtitles', (_e, filePath: string) => detectSubtitles(filePath))

  // --- screenshots ---
  ipcMain.handle('screenshots:saveDataUrl', (_e, dataUrl: string, baseName: string) =>
    files.saveScreenshotDataUrl(dataUrl, baseName, screenshotsDir())
  )

  // --- data ---
  ipcMain.handle('data:exportAll', () => data.exportAll())
  ipcMain.handle('data:importAll', () => data.importAll())
  ipcMain.handle('data:clearHistory', () => data.clearHistory())

  // --- settings ---
  ipcMain.handle('settings:get', () => getSettings())
  ipcMain.handle('settings:set', (_e, patch) => {
    const next = setSettings(patch)
    if (patch && ('apiEnabled' in patch || 'apiPort' in patch)) restartApiServer()
    return next
  })
  ipcMain.handle('settings:regenerateApiToken', () => {
    const token = regenerateApiToken()
    restartApiServer()
    return token
  })
  ipcMain.handle('settings:pickDirectory', async () => {
    const res = await dialog.showOpenDialog(BrowserWindow.getAllWindows()[0]!, {
      properties: ['openDirectory', 'createDirectory'],
    })
    return res.canceled || !res.filePaths.length ? null : res.filePaths[0]
  })

  // --- window ---
  ipcMain.handle('window:setTheme', (_e, theme: 'dark' | 'light') => {
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) return
    try {
      win.setTitleBarOverlay(
        theme === 'light'
          ? { color: '#ffffff', symbolColor: '#5a5a68', height: 36 }
          : { color: '#1a1814', symbolColor: '#8a8278', height: 36 }
      )
      win.setBackgroundColor(theme === 'light' ? '#ffffff' : '#141210')
    } catch {
      /* overlay not supported on this platform */
    }
  })

  // --- shell ---
  ipcMain.handle('shell:openExternal', (_e, url: string) => {
    if (/^https?:\/\//i.test(url)) return shell.openExternal(url)
  })
  ipcMain.handle('shell:showItemInFolder', (_e, p: string) => shell.showItemInFolder(p))
  ipcMain.handle('shell:openInMpv', (_e, filePath: string) => {
    const mpv = getSettings().mpvPath || 'mpv'
    return new Promise((resolve) => {
      try {
        const child = spawn(mpv, [filePath], { detached: true, stdio: 'ignore', windowsHide: false })
        child.on('error', (err) =>
          resolve({ ok: false, error: 'mpv not found. Install mpv or set its path in Settings. ' + err.message })
        )
        child.unref()
        setTimeout(() => resolve({ ok: true }), 400)
      } catch (err: any) {
        resolve({ ok: false, error: String(err?.message ?? err) })
      }
    })
  })
}
