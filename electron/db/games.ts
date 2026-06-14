import path from 'node:path'
import { db, now } from './database'
import type { Game } from '../../src/types/models'

const rowToGame = (r: any): Game => r as Game

export function listGames(): Game[] {
  return db()
    .prepare('SELECT * FROM games ORDER BY (last_played IS NULL), last_played DESC, total_seconds DESC, name COLLATE NOCASE ASC')
    .all() as Game[]
}

export function getGame(id: number): Game | null {
  const row = db().prepare('SELECT * FROM games WHERE id = ?').get(id)
  return row ? rowToGame(row) : null
}

/** All registered exe basenames (lowercased) → game id, for the process scanner. */
export function gameExeMap(): Array<{ id: number; exe_name: string }> {
  return db().prepare('SELECT id, exe_name FROM games').all() as Array<{ id: number; exe_name: string }>
}

export function createGame(data: { name?: string; exe_path: string; cover_path?: string | null }): Game {
  const exe = data.exe_path
  const exeName = path.basename(exe).toLowerCase()
  const name = (data.name ?? '').trim() || path.basename(exe).replace(/\.exe$/i, '')
  const info = db()
    .prepare('INSERT INTO games (name, exe_path, exe_name, cover_path) VALUES (?, ?, ?, ?)')
    .run(name, exe, exeName, data.cover_path ?? null)
  return getGame(Number(info.lastInsertRowid))!
}

export function updateGame(id: number, patch: Partial<Game>): Game {
  const sets: string[] = []
  const values: any[] = []
  for (const key of ['name', 'cover_path', 'exe_path'] as const) {
    if (patch[key] === undefined) continue
    sets.push(`${key} = ?`)
    values.push(patch[key])
  }
  if (patch.exe_path !== undefined) {
    sets.push('exe_name = ?')
    values.push(path.basename(patch.exe_path).toLowerCase())
  }
  if (sets.length) {
    values.push(id)
    db().prepare(`UPDATE games SET ${sets.join(', ')} WHERE id = ?`).run(...values)
  }
  return getGame(id)!
}

export function deleteGame(id: number): void {
  db().prepare('DELETE FROM games WHERE id = ?').run(id)
}

// ---- playtime accrual (called by the background process tracker) ----

export function startGameSession(gameId: number): number {
  const info = db().prepare('INSERT INTO game_sessions (game_id) VALUES (?)').run(gameId)
  return Number(info.lastInsertRowid)
}

export function accrueSeconds(gameId: number, sessionId: number, seconds: number): void {
  if (seconds <= 0) return
  const tx = db().transaction(() => {
    db().prepare('UPDATE games SET total_seconds = total_seconds + ?, last_played = ? WHERE id = ?').run(seconds, now(), gameId)
    db().prepare('UPDATE game_sessions SET seconds = seconds + ? WHERE id = ?').run(seconds, sessionId)
  })
  tx()
}

export function endGameSession(sessionId: number): void {
  db().prepare('UPDATE game_sessions SET ended_at = ? WHERE id = ?').run(now(), sessionId)
}
