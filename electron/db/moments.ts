import { db } from './database'
import type { Moment, MomentTag } from '../../src/types/models'

const SELECT = `
  SELECT m.*, t.title AS title_name, e.episode_number AS episode_number, e.name AS episode_name
  FROM moments m
  JOIN titles t ON t.id = m.title_id
  LEFT JOIN episodes e ON e.id = m.episode_id
`

export function listMoments(filters: { tag?: MomentTag; titleId?: number; episodeId?: number } = {}): Moment[] {
  const where: string[] = []
  const params: any[] = []
  if (filters.tag) {
    where.push('m.tag = ?')
    params.push(filters.tag)
  }
  if (filters.titleId) {
    where.push('m.title_id = ?')
    params.push(filters.titleId)
  }
  if (filters.episodeId) {
    where.push('m.episode_id = ?')
    params.push(filters.episodeId)
  }
  const sql = `${SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY m.created_at DESC`
  return db().prepare(sql).all(...params) as Moment[]
}

export function getMoment(id: number): Moment | null {
  return (db().prepare(`${SELECT} WHERE m.id = ?`).get(id) as Moment | undefined) ?? null
}

export function createMoment(data: {
  title_id: number
  episode_id: number | null
  timestamp_seconds: number
  screenshot_path: string | null
  note: string | null
  tag: MomentTag | null
}): Moment {
  const tx = db().transaction(() => {
    const info = db()
      .prepare(`
        INSERT INTO moments (title_id, episode_id, timestamp_seconds, screenshot_path, note, tag)
        VALUES (@title_id, @episode_id, @timestamp_seconds, @screenshot_path, @note, @tag)
      `)
      .run(data)
    const momentId = Number(info.lastInsertRowid)
    if (data.screenshot_path) {
      db().prepare('INSERT INTO screenshots (moment_id, file_path) VALUES (?, ?)').run(momentId, data.screenshot_path)
    }
    return momentId
  })
  return getMoment(tx())!
}

export function updateMoment(id: number, patch: { note?: string | null; tag?: MomentTag | null }): void {
  const sets: string[] = []
  const values: any[] = []
  if (patch.note !== undefined) {
    sets.push('note = ?')
    values.push(patch.note)
  }
  if (patch.tag !== undefined) {
    sets.push('tag = ?')
    values.push(patch.tag)
  }
  if (!sets.length) return
  values.push(id)
  db().prepare(`UPDATE moments SET ${sets.join(', ')} WHERE id = ?`).run(...values)
}

export function deleteMoment(id: number): void {
  db().prepare('DELETE FROM moments WHERE id = ?').run(id)
}
