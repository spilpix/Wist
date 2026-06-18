import { db, now } from './database'
import type { ProjectPatch } from '../../src/types/models'

function safeTags(v: unknown): string[] {
  if (typeof v !== 'string') return []
  try {
    const parsed = JSON.parse(v)
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

const rowToPatch = (row: any): ProjectPatch => ({ ...row, tags: safeTags(row.tags) })

// newest entries first — by release date when set, else creation time
export function listPatches(projectId: number): ProjectPatch[] {
  const rows = db()
    .prepare(
      'SELECT * FROM project_patches WHERE project_id = ? ORDER BY COALESCE(released_at, created_at) DESC, id DESC'
    )
    .all(projectId) as any[]
  return rows.map(rowToPatch)
}

const STATUSES = ['planned', 'in_progress', 'released']

type NewPatch = {
  version?: string | null
  title?: string | null
  body?: string | null
  status?: string
  tags?: string[]
  released_at?: string | null
}

function touch(projectId: number): void {
  db().prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(now(), projectId)
}

export function createPatch(projectId: number, data: NewPatch): ProjectPatch {
  const info = db()
    .prepare(
      `INSERT INTO project_patches (project_id, version, title, body, status, tags, released_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      projectId,
      data.version?.trim() || null,
      data.title?.trim() || null,
      data.body ?? null,
      data.status && STATUSES.includes(data.status) ? data.status : 'released',
      JSON.stringify(Array.isArray(data.tags) ? data.tags : []),
      data.released_at ?? null
    )
  touch(projectId)
  return rowToPatch(db().prepare('SELECT * FROM project_patches WHERE id = ?').get(Number(info.lastInsertRowid)))
}

export function updatePatch(id: number, patch: NewPatch): ProjectPatch {
  const sets: string[] = []
  const values: any[] = []
  for (const key of ['version', 'title', 'body', 'released_at'] as const) {
    if (patch[key] === undefined) continue
    sets.push(`${key} = ?`)
    values.push(key === 'version' || key === 'title' ? (patch[key]?.toString().trim() || null) : patch[key])
  }
  if (patch.status !== undefined && STATUSES.includes(patch.status)) {
    sets.push('status = ?')
    values.push(patch.status)
  }
  if (patch.tags !== undefined) {
    sets.push('tags = ?')
    values.push(JSON.stringify(Array.isArray(patch.tags) ? patch.tags : []))
  }
  if (sets.length) {
    values.push(id)
    db().prepare(`UPDATE project_patches SET ${sets.join(', ')} WHERE id = ?`).run(...values)
  }
  const row = db().prepare('SELECT * FROM project_patches WHERE id = ?').get(id) as any
  if (row) touch(row.project_id)
  return rowToPatch(row)
}

export function removePatch(id: number): void {
  const row = db().prepare('SELECT project_id FROM project_patches WHERE id = ?').get(id) as any
  db().prepare('DELETE FROM project_patches WHERE id = ?').run(id)
  if (row) touch(row.project_id)
}
