import { BrowserWindow, dialog } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { coversDir, getSettings } from '../settings'
import { existingFilePaths, bulkCreateEpisodes } from '../db/episodes'
import { createTitle } from '../db/titles'
import type { ImportGroup } from '../../src/types/models'

const VIDEO_EXTENSIONS = new Set(['.mkv', '.mp4', '.avi', '.mov', '.webm'])
const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif']

function win(): BrowserWindow | undefined {
  return BrowserWindow.getAllWindows()[0]
}

export async function pickVideos(): Promise<string[]> {
  const res = await dialog.showOpenDialog(win()!, {
    title: 'Add video files',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Video', extensions: ['mkv', 'mp4', 'avi', 'mov', 'webm'] }],
  })
  return res.canceled ? [] : res.filePaths
}

export async function pickFolder(): Promise<string | null> {
  const res = await dialog.showOpenDialog(win()!, {
    title: 'Choose folder',
    properties: ['openDirectory'],
  })
  return res.canceled || !res.filePaths.length ? null : res.filePaths[0]
}

export async function pickImage(): Promise<string | null> {
  const res = await dialog.showOpenDialog(win()!, {
    title: 'Choose cover image',
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: IMAGE_EXTENSIONS }],
  })
  return res.canceled || !res.filePaths.length ? null : res.filePaths[0]
}

export function listVideosInFolder(folder: string): string[] {
  const out: string[] = []
  walk(folder, out, 0)
  return out.sort()
}

function walk(dir: string, out: string[], depth: number) {
  if (depth > 6) return
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(full, out, depth + 1)
    } else if (VIDEO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      out.push(full)
    }
  }
}

/** Scan configured media folders for video files not yet in the library. */
export function scanMediaFolders(): string[] {
  const known = new Set(existingFilePaths().map((p) => p.toLowerCase()))
  const found: string[] = []
  for (const folder of getSettings().mediaFolders) {
    for (const file of listVideosInFolder(folder)) {
      if (!known.has(file.toLowerCase())) found.push(file)
    }
  }
  return found
}

export function importEpisodes(groups: ImportGroup[]): { createdTitles: number; createdEpisodes: number } {
  const known = new Set(existingFilePaths().map((p) => p.toLowerCase()))
  let createdTitles = 0
  let createdEpisodes = 0

  for (const group of groups) {
    let titleId = group.titleId
    if (!titleId && group.newTitle) {
      const fresh = createTitle({
        title: group.newTitle.title,
        type: group.newTitle.type,
        status: 'planned',
        total_episodes: Math.max(1, group.episodes.length),
      })
      titleId = fresh.id
      createdTitles++
    }
    if (!titleId) continue

    const items = group.episodes
      .filter((e) => !known.has(e.path.toLowerCase()))
      .map((e, i) => ({
        title_id: titleId!,
        episode_number: e.episode ?? i + 1,
        season: e.season ?? 1,
        file_path: e.path,
      }))
    for (const item of items) known.add(item.file_path.toLowerCase())
    createdEpisodes += bulkCreateEpisodes(items)
  }
  return { createdTitles, createdEpisodes }
}

/**
 * Auto-import every video under the given folders into the Library/Video section
 * with NO manual grouping: a loose file in the folder root becomes a movie, and
 * each top-level subfolder (a series, possibly with season subdirs) becomes one
 * title whose videos are its episodes. Already-imported paths are skipped.
 */
export function autoImportVideos(folders: string[]): { createdTitles: number; createdEpisodes: number; scanned: number } {
  const known = new Set(existingFilePaths().map((p) => p.toLowerCase()))
  let scanned = 0
  const groups = new Map<string, { name: string; series: boolean; files: string[] }>()
  for (const folder of folders) {
    for (const file of listVideosInFolder(folder)) {
      scanned++
      if (known.has(file.toLowerCase())) continue
      const seg = path.relative(folder, file).split(path.sep)
      const loose = seg.length <= 1
      const name = loose ? path.basename(file, path.extname(file)) : seg[0]
      const key = `${folder}|${name}`.toLowerCase()
      let g = groups.get(key)
      if (!g) {
        g = { name, series: !loose, files: [] }
        groups.set(key, g)
      }
      g.files.push(file)
      if (g.files.length > 1) g.series = true // a folder with several files is a series
    }
  }
  const importGroups: ImportGroup[] = []
  for (const g of groups.values()) {
    g.files.sort()
    importGroups.push({
      newTitle: { title: g.name || 'Video', type: g.series ? 'series' : 'movie' },
      episodes: g.files.map((f, i) => ({ path: f, episode: i + 1, season: 1 })),
    })
  }
  const res = importEpisodes(importGroups)
  return { ...res, scanned }
}

export function saveCoverFromPath(srcPath: string): string {
  const ext = path.extname(srcPath).toLowerCase() || '.png'
  const dest = path.join(coversDir(), `${crypto.randomUUID()}${ext}`)
  fs.copyFileSync(srcPath, dest)
  return dest
}

export function saveCoverFromBytes(name: string, bytes: ArrayBuffer): string {
  const ext = (path.extname(name).toLowerCase() || '.png').slice(0, 6)
  const dest = path.join(coversDir(), `${crypto.randomUUID()}${ext}`)
  fs.writeFileSync(dest, Buffer.from(bytes))
  return dest
}

export function saveScreenshotDataUrl(dataUrl: string, baseName: string, dir: string): string {
  const match = /^data:image\/png;base64,(.+)$/.exec(dataUrl)
  if (!match) throw new Error('Invalid screenshot data')
  fs.mkdirSync(dir, { recursive: true })
  const safe = baseName.replace(/[^a-z0-9 _\-Ѐ-ӿ]/gi, '').trim().slice(0, 60) || 'screenshot'
  const file = path.join(dir, `${safe} ${timestampForFile()}.png`)
  fs.writeFileSync(file, Buffer.from(match[1], 'base64'))
  return file
}

function timestampForFile(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}
