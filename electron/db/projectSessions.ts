import { db, now } from './database'
import type { ProjectSession } from '../../src/types/models'

export function listSessions(projectId: number): ProjectSession[] {
  return db()
    .prepare('SELECT * FROM project_sessions WHERE project_id = ? ORDER BY COALESCE(ended_at, created_at) DESC, id DESC')
    .all(projectId) as ProjectSession[]
}

type NewSession = {
  started_at?: string | null
  ended_at?: string | null
  duration_seconds?: number
  title?: string | null
  report?: string | null
  changes_json?: string | null
}

export function createSession(projectId: number, data: NewSession): ProjectSession {
  const info = db()
    .prepare(
      `INSERT INTO project_sessions (project_id, started_at, ended_at, duration_seconds, title, report, changes_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      projectId,
      data.started_at ?? null,
      data.ended_at ?? now(),
      Math.max(0, Math.round(data.duration_seconds ?? 0)),
      data.title ?? null,
      data.report ?? null,
      data.changes_json ?? null
    )
  db().prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(now(), projectId)
  return db().prepare('SELECT * FROM project_sessions WHERE id = ?').get(Number(info.lastInsertRowid)) as ProjectSession
}

export function updateSession(id: number, patch: NewSession & { title?: string | null }): ProjectSession {
  const sets: string[] = []
  const values: any[] = []
  for (const key of ['started_at', 'ended_at', 'title', 'report', 'changes_json'] as const) {
    if (patch[key] === undefined) continue
    sets.push(`${key} = ?`)
    values.push(patch[key])
  }
  if (patch.duration_seconds !== undefined) {
    sets.push('duration_seconds = ?')
    values.push(Math.max(0, Math.round(patch.duration_seconds)))
  }
  if (sets.length) {
    values.push(id)
    db().prepare(`UPDATE project_sessions SET ${sets.join(', ')} WHERE id = ?`).run(...values)
  }
  return db().prepare('SELECT * FROM project_sessions WHERE id = ?').get(id) as ProjectSession
}

export function removeSession(id: number): void {
  db().prepare('DELETE FROM project_sessions WHERE id = ?').run(id)
}

// create the session row AND advance the folder snapshot in one transaction, so the
// session's recorded diff and the baseline it diffs from can never get out of sync
export function saveSessionAndSnapshot(
  projectId: number,
  data: NewSession,
  files: Record<string, string>
): ProjectSession {
  const tx = db().transaction(() => {
    const s = createSession(projectId, data)
    saveSnapshot(projectId, files)
    return s
  })
  return tx()
}

// ---- folder snapshots (for the file-change diff) ----

export function getSnapshot(projectId: number): Record<string, string> {
  const row = db().prepare('SELECT files_json FROM project_snapshots WHERE project_id = ?').get(projectId) as any
  if (!row) return {}
  try {
    const parsed = JSON.parse(row.files_json)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function saveSnapshot(projectId: number, files: Record<string, string>): void {
  db()
    .prepare(
      `INSERT INTO project_snapshots (project_id, files_json, taken_at) VALUES (?, ?, ?)
       ON CONFLICT(project_id) DO UPDATE SET files_json = excluded.files_json, taken_at = excluded.taken_at`
    )
    .run(projectId, JSON.stringify(files), now())
}
