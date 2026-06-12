import { db, now } from './database'
import { markTitleStarted } from './episodes'

export function startSession(titleId: number | null, episodeId: number | null): number {
  const info = db()
    .prepare('INSERT INTO watch_sessions (title_id, episode_id, started_at) VALUES (?, ?, ?)')
    .run(titleId, episodeId, now())
  if (titleId) markTitleStarted(titleId)
  return Number(info.lastInsertRowid)
}

export function endSession(id: number, durationSeconds: number): void {
  db()
    .prepare('UPDATE watch_sessions SET ended_at = ?, duration_seconds = ? WHERE id = ?')
    .run(now(), Math.max(0, Math.round(durationSeconds)), id)
}
