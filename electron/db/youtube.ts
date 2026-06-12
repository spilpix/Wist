import { db, now } from './database'
import type { YoutubeSource, YoutubeVideo } from '../../src/types/models'

export function listSources(titleId?: number): YoutubeSource[] {
  if (titleId) {
    return db().prepare('SELECT * FROM youtube_sources WHERE title_id = ? ORDER BY id').all(titleId) as YoutubeSource[]
  }
  return db()
    .prepare(`
      SELECT ys.*, t.title AS title_name
      FROM youtube_sources ys
      JOIN titles t ON t.id = ys.title_id
      ORDER BY ys.id
    `)
    .all() as YoutubeSource[]
}

export function getSource(id: number): YoutubeSource | null {
  return (db().prepare('SELECT * FROM youtube_sources WHERE id = ?').get(id) as YoutubeSource | undefined) ?? null
}

export function addSource(titleId: number, url: string): YoutubeSource {
  const isPlaylist = /[?&]list=|\/playlist/.test(url)
  const info = db()
    .prepare('INSERT INTO youtube_sources (title_id, channel_url, playlist_url) VALUES (?, ?, ?)')
    .run(titleId, isPlaylist ? null : url, isPlaylist ? url : null)
  return getSource(Number(info.lastInsertRowid))!
}

export function removeSource(id: number): void {
  db().prepare('DELETE FROM youtube_sources WHERE id = ?').run(id)
}

/** Insert fetched videos as episodes of the linked title (file_path = video URL). Skips already-known URLs. */
export function insertVideosAsEpisodes(sourceId: number, videos: YoutubeVideo[]): { added: number; total: number } {
  const source = getSource(sourceId)
  if (!source) throw new Error('Source not found')

  const known = new Set(
    (db().prepare("SELECT file_path FROM episodes WHERE title_id = ? AND file_path LIKE 'http%'").all(source.title_id) as Array<{ file_path: string }>).map((r) => r.file_path)
  )
  const maxRow = db()
    .prepare('SELECT COALESCE(MAX(episode_number), 0) AS m FROM episodes WHERE title_id = ?')
    .get(source.title_id) as { m: number }
  let nextNumber = maxRow.m

  const insert = db().prepare(`
    INSERT INTO episodes (title_id, episode_number, name, file_path, duration_seconds)
    VALUES (?, ?, ?, ?, ?)
  `)
  let added = 0
  const tx = db().transaction(() => {
    for (const video of videos) {
      if (known.has(video.url)) continue
      nextNumber++
      insert.run(source.title_id, nextNumber, video.title, video.url, video.duration)
      added++
    }
    db().prepare('UPDATE youtube_sources SET last_synced = ? WHERE id = ?').run(now(), sourceId)
  })
  tx()
  return { added, total: videos.length }
}
