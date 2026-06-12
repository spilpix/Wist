import { db, now } from './database'
import { getTitle, updateTitle } from './titles'
import type { ContinueItem, Episode, Title } from '../../src/types/models'

export function listEpisodesByTitle(titleId: number): Episode[] {
  return db()
    .prepare('SELECT * FROM episodes WHERE title_id = ? ORDER BY season, episode_number, id')
    .all(titleId) as Episode[]
}

export function getEpisodeBundle(id: number): { episode: Episode; title: Title; episodes: Episode[] } | null {
  const episode = db().prepare('SELECT * FROM episodes WHERE id = ?').get(id) as Episode | undefined
  if (!episode) return null
  const title = getTitle(episode.title_id)
  if (!title) return null
  return { episode, title, episodes: listEpisodesByTitle(episode.title_id) }
}

export function bulkCreateEpisodes(
  items: Array<{ title_id: number; episode_number: number; season?: number; name?: string | null; file_path?: string | null; duration_seconds?: number | null }>
): number {
  const insert = db().prepare(`
    INSERT INTO episodes (title_id, episode_number, season, name, file_path, duration_seconds)
    VALUES (@title_id, @episode_number, @season, @name, @file_path, @duration_seconds)
  `)
  const tx = db().transaction(() => {
    let count = 0
    for (const item of items) {
      insert.run({
        title_id: item.title_id,
        episode_number: item.episode_number,
        season: item.season ?? 1,
        name: item.name ?? null,
        file_path: item.file_path ?? null,
        duration_seconds: item.duration_seconds ?? null,
      })
      count++
    }
    return count
  })
  return tx()
}

const EP_WRITABLE = ['episode_number', 'season', 'name', 'file_path', 'duration_seconds', 'watched', 'watch_date', 'watch_position_seconds'] as const

export function updateEpisode(id: number, patch: Partial<Episode>): void {
  const sets: string[] = []
  const values: any[] = []
  for (const key of EP_WRITABLE) {
    if (patch[key] === undefined) continue
    sets.push(`${key} = ?`)
    values.push(patch[key])
  }
  if (!sets.length) return
  values.push(id)
  db().prepare(`UPDATE episodes SET ${sets.join(', ')} WHERE id = ?`).run(...values)
}

export function setProgress(id: number, position: number, duration?: number | null): void {
  if (duration != null) {
    db()
      .prepare(`UPDATE episodes SET watch_position_seconds = ?, watch_date = ?, duration_seconds = COALESCE(duration_seconds, ?) WHERE id = ?`)
      .run(position, now(), duration, id)
  } else {
    db().prepare('UPDATE episodes SET watch_position_seconds = ?, watch_date = ? WHERE id = ?').run(position, now(), id)
  }
}

export function markWatched(id: number, watched: boolean): void {
  const episode = db().prepare('SELECT * FROM episodes WHERE id = ?').get(id) as Episode | undefined
  if (!episode) return
  db()
    .prepare('UPDATE episodes SET watched = ?, watch_date = ? WHERE id = ?')
    .run(watched ? 1 : 0, now(), id)

  // keep title status in sync: all watched -> completed
  const title = getTitle(episode.title_id)
  if (!title) return
  if (watched) {
    const total = Math.max(title.total_episodes, title.episode_count ?? 0)
    const watchedCount = (db()
      .prepare('SELECT COUNT(*) AS c FROM episodes WHERE title_id = ? AND watched = 1')
      .get(episode.title_id) as { c: number }).c
    if (total > 0 && watchedCount >= total && title.status !== 'completed') {
      updateTitle(episode.title_id, { status: 'completed' })
    } else if (title.status === 'planned') {
      updateTitle(episode.title_id, { status: 'watching' })
    }
  } else if (title.status === 'completed') {
    updateTitle(episode.title_id, { status: 'watching', date_finished: null })
  }
}

export function markTitleStarted(titleId: number): void {
  const title = getTitle(titleId)
  if (!title) return
  if (title.status === 'planned') {
    updateTitle(titleId, { status: 'watching' })
  } else if (!title.date_started) {
    updateTitle(titleId, { date_started: now() })
  }
}

export function deleteEpisode(id: number): void {
  db().prepare('DELETE FROM episodes WHERE id = ?').run(id)
}

export function continueWatching(): ContinueItem[] {
  return db()
    .prepare(`
      SELECT e.*, t.title AS title_name, t.type AS title_type, t.cover_path, t.total_episodes
      FROM episodes e
      JOIN titles t ON t.id = e.title_id
      WHERE e.watched = 0
        AND e.watch_position_seconds > 20
        AND e.file_path IS NOT NULL
        AND e.file_path NOT LIKE 'http%'
      ORDER BY e.watch_date DESC, e.id DESC
      LIMIT 20
    `)
    .all() as ContinueItem[]
}

export function existingFilePaths(): string[] {
  const rows = db().prepare("SELECT file_path FROM episodes WHERE file_path IS NOT NULL").all() as Array<{ file_path: string }>
  return rows.map((r) => r.file_path)
}
