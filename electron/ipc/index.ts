import { ipcMain, shell, dialog, BrowserWindow } from 'electron'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import * as titles from '../db/titles'
import * as episodes from '../db/episodes'
import * as moments from '../db/moments'
import * as notes from '../db/notes'
import * as sessions from '../db/sessions'
import * as stats from '../db/stats'
import * as youtube from '../db/youtube'
import { memories } from '../db/memories'
import * as files from './files'
import * as data from './data'
import { detectSubtitles } from './subtitles'
import { fetchVideos } from './ytdlp'
import { getSettings, setSettings, screenshotsDir } from '../settings'
import type { MomentTag } from '../../src/types/models'

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
  ipcMain.handle('settings:set', (_e, patch) => setSettings(patch))
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
          : { color: '#111118', symbolColor: '#a1a1aa', height: 36 }
      )
      win.setBackgroundColor(theme === 'light' ? '#f7f7fa' : '#0d0d14')
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
