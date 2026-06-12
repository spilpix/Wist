import { db } from './database'
import type { Playlist } from '../../src/types/models'

export function detectService(url: string): Playlist['service'] {
  try {
    const host = new URL(url).hostname.toLowerCase()
    if (host.includes('spotify')) return 'spotify'
    if (host.includes('youtu')) return 'youtube'
    if (host.includes('music.yandex')) return 'yandex'
    if (host.includes('soundcloud')) return 'soundcloud'
    if (host.includes('apple')) return 'apple'
  } catch {
    /* not a url */
  }
  return 'other'
}

export function listPlaylists(): Playlist[] {
  return db().prepare('SELECT * FROM playlists ORDER BY created_at DESC').all() as Playlist[]
}

export function createPlaylist(data: Partial<Playlist>): Playlist {
  const url = (data.url ?? '').trim()
  const info = db()
    .prepare('INSERT INTO playlists (title, url, service, cover_path, notes) VALUES (?, ?, ?, ?, ?)')
    .run(
      (data.title ?? '').trim() || url,
      url,
      data.service ?? detectService(url),
      data.cover_path ?? null,
      data.notes ?? null
    )
  return db().prepare('SELECT * FROM playlists WHERE id = ?').get(Number(info.lastInsertRowid)) as Playlist
}

export function updatePlaylist(id: number, patch: Partial<Playlist>): void {
  const sets: string[] = []
  const values: any[] = []
  for (const key of ['title', 'url', 'service', 'cover_path', 'notes'] as const) {
    if (patch[key] === undefined) continue
    sets.push(`${key} = ?`)
    values.push(patch[key])
  }
  if (sets.length) {
    values.push(id)
    db().prepare(`UPDATE playlists SET ${sets.join(', ')} WHERE id = ?`).run(...values)
  }
}

export function deletePlaylist(id: number): void {
  db().prepare('DELETE FROM playlists WHERE id = ?').run(id)
}
