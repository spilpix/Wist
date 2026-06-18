import { BrowserWindow, ipcMain } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { coversDir, getSettings, setSettings } from '../settings'
import { parseAudioFile, type AudioTags } from './audioMeta'
import { pickFolder } from './files'
import {
  addToPlaylist,
  createMusicPlaylist,
  deleteMusicPlaylist,
  existingTrackPaths,
  insertTracks,
  listAlbums,
  listArtists,
  listMusicPlaylists,
  listTracks,
  playlistTracks,
  recordPlay,
  removeFromPlaylist,
  reorderPlaylist,
  removeTrack,
  removeTracksUnderFolders,
  renameMusicPlaylist,
  setDuration,
  setLiked,
  type NewTrack,
} from '../db/tracks'

const AUDIO_EXT = new Set(['.mp3', '.flac', '.m4a', '.aac', '.ogg', '.opus', '.wav', '.wma'])
const SIDECAR_COVERS = ['cover.jpg', 'cover.png', 'cover.jpeg', 'folder.jpg', 'folder.png', 'front.jpg', 'front.png', 'album.jpg', 'albumart.jpg', 'albumartsmall.jpg']

function emitChange() {
  BrowserWindow.getAllWindows()[0]?.webContents.send('wist:data-changed', 'music')
}

function walk(dir: string, out: string[], depth: number) {
  if (depth > 8) return
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out, depth + 1)
    else if (AUDIO_EXT.has(path.extname(entry.name).toLowerCase())) out.push(full)
  }
}

// .../Artist/Album/01 - Track.mp3 → sensible fallbacks when a file has no tags
function deriveFromPath(filePath: string): { title: string; album: string | null; artist: string | null } {
  const base = path.basename(filePath, path.extname(filePath))
  const title = base.replace(/^\s*\d{1,3}\s*[-._)\]]?\s+/, '').trim() || base
  const dir = path.dirname(filePath)
  const album = path.basename(dir) || null
  const grand = path.basename(path.dirname(dir)) || null
  // a drive root ("C:") isn't a useful artist
  const artist = grand && !/^[a-z]:$/i.test(grand) ? grand : null
  return { title, album: album && !/^[a-z]:$/i.test(album) ? album : null, artist }
}

function extForMime(mime: string): string {
  if (mime.includes('png')) return '.png'
  if (mime.includes('webp')) return '.webp'
  return '.jpg'
}

function saveEmbeddedCover(tags: AudioTags): string | null {
  if (!tags.picture) return null
  try {
    const dest = path.join(coversDir(), `${crypto.randomUUID()}${extForMime(tags.picture.mime)}`)
    fs.writeFileSync(dest, tags.picture.data)
    return dest
  } catch {
    return null
  }
}

function findSidecarCover(fileDir: string): string | null {
  try {
    const names = new Set(fs.readdirSync(fileDir).map((n) => n.toLowerCase()))
    for (const cand of SIDECAR_COVERS) if (names.has(cand)) return path.join(fileDir, cand)
  } catch {
    /* unreadable dir */
  }
  return null
}

export async function scanAudioFolders(folders: string[]): Promise<{ added: number; scanned: number }> {
  const known = new Set(existingTrackPaths().map((p) => p.toLowerCase()))
  const files: string[] = []
  for (const folder of folders) {
    const found: string[] = []
    walk(folder, found, 0)
    for (const f of found) if (!known.has(f.toLowerCase())) files.push(f)
  }

  const albumCoverCache = new Map<string, string | null>() // albumKey → cover path
  const sidecarCache = new Map<string, string | null>() // dir → sidecar cover path
  const rows: NewTrack[] = []

  for (const file of files) {
    const tags = (await parseAudioFile(file)) ?? {}
    const fb = deriveFromPath(file)
    const artist = tags.artist ?? fb.artist
    const album = tags.album ?? fb.album
    const albumArtist = tags.albumArtist ?? null
    const albumKey = `${(albumArtist || artist || '').toLowerCase()}|${(album || '').toLowerCase()}`

    let cover: string | null = null
    if (albumKey !== '|' && albumCoverCache.has(albumKey)) {
      cover = albumCoverCache.get(albumKey)!
    } else {
      cover = saveEmbeddedCover(tags)
      if (!cover) {
        const dir = path.dirname(file)
        if (!sidecarCache.has(dir)) sidecarCache.set(dir, findSidecarCover(dir))
        cover = sidecarCache.get(dir)!
      }
      if (albumKey !== '|') albumCoverCache.set(albumKey, cover)
    }

    rows.push({
      path: file,
      title: tags.title || fb.title,
      artist,
      album,
      album_artist: albumArtist,
      genre: tags.genre ?? null,
      year: tags.year ?? null,
      track_no: tags.trackNo ?? null,
      disc_no: tags.discNo ?? null,
      duration_seconds: null, // filled lazily by the renderer's <audio> on first load
      cover_path: cover,
    })
  }

  const added = insertTracks(rows)
  return { added, scanned: files.length }
}

export function registerMusicHandlers(): void {
  ipcMain.handle('music:list', () => listTracks())
  ipcMain.handle('music:albums', () => listAlbums())
  ipcMain.handle('music:artists', () => listArtists())
  ipcMain.handle('music:folders', () => getSettings().musicFolders)

  ipcMain.handle('music:scan', async () => {
    const res = await scanAudioFolders(getSettings().musicFolders)
    if (res.added) emitChange()
    return res
  })

  ipcMain.handle('music:addFolder', async () => {
    const folder = await pickFolder()
    if (!folder) return null
    const folders = getSettings().musicFolders
    if (!folders.includes(folder)) setSettings({ musicFolders: [...folders, folder] })
    const res = await scanAudioFolders([folder])
    emitChange()
    return { folder, ...res }
  })

  ipcMain.handle('music:removeFolder', (_e, folder: string) => {
    const folders = getSettings().musicFolders.filter((f) => f !== folder)
    setSettings({ musicFolders: folders })
    const removed = removeTracksUnderFolders([folder])
    emitChange()
    return removed
  })

  ipcMain.handle('music:setDuration', (_e, id: number, seconds: number) => setDuration(id, seconds))
  ipcMain.handle('music:setLiked', (_e, id: number, liked: boolean) => {
    setLiked(id, liked)
    emitChange()
  })
  ipcMain.handle('music:recordPlay', (_e, id: number) => recordPlay(id))
  ipcMain.handle('music:remove', (_e, id: number) => {
    removeTrack(id)
    emitChange()
  })

  // user playlists of local tracks
  ipcMain.handle('music:playlists', () => listMusicPlaylists())
  ipcMain.handle('music:playlistTracks', (_e, id: number) => playlistTracks(id))
  ipcMain.handle('music:createPlaylist', (_e, name: string) => {
    const p = createMusicPlaylist(name)
    emitChange()
    return p
  })
  ipcMain.handle('music:renamePlaylist', (_e, id: number, name: string) => {
    renameMusicPlaylist(id, name)
    emitChange()
  })
  ipcMain.handle('music:deletePlaylist', (_e, id: number) => {
    deleteMusicPlaylist(id)
    emitChange()
  })
  ipcMain.handle('music:addToPlaylist', (_e, playlistId: number, trackId: number) => {
    addToPlaylist(playlistId, trackId)
    emitChange()
  })
  ipcMain.handle('music:removeFromPlaylist', (_e, playlistId: number, trackId: number) => {
    removeFromPlaylist(playlistId, trackId)
    emitChange()
  })
  ipcMain.handle('music:reorderPlaylist', (_e, playlistId: number, trackIds: number[]) => {
    reorderPlaylist(playlistId, trackIds ?? [])
    emitChange()
  })
}
