import { db, now } from './database'
import type { Project } from '../../src/types/models'

function safeParse(v: unknown): string[] {
  if (typeof v !== 'string') return []
  try {
    const parsed = JSON.parse(v)
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

const rowToProject = (row: any): Project => ({ ...row, tools: safeParse(row.tools) })

// list with derived counts so cards can show refs / notes / open tasks at a glance
const SELECT = `
  SELECT p.*,
    (SELECT COUNT(*) FROM project_assets a WHERE a.project_id = p.id) AS asset_count,
    (SELECT COUNT(*) FROM notes n WHERE n.project_id = p.id) AS note_count,
    (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.done = 0) AS open_task_count
  FROM projects p
`

export function listProjects(): Project[] {
  const rows = db()
    .prepare(`${SELECT} ORDER BY p.pinned DESC, p.sort ASC, p.updated_at DESC`)
    .all() as any[]
  return rows.map(rowToProject)
}

export function getProject(id: number): Project | null {
  const row = db().prepare(`${SELECT} WHERE p.id = ?`).get(id)
  return row ? rowToProject(row) : null
}

const KINDS = ['video', 'motion', 'edit', '3d', 'design', 'other']
const STATUSES = ['idea', 'active', 'review', 'done', 'archived']

export function createProject(data: Partial<Project>): Project {
  const info = db()
    .prepare(
      `INSERT INTO projects (name, client, kind, status, color, cover_path, deadline, tools, description, pinned)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      (data.name ?? '').trim() || 'Untitled',
      data.client ?? null,
      data.kind && KINDS.includes(data.kind) ? data.kind : 'video',
      data.status && STATUSES.includes(data.status) ? data.status : 'active',
      data.color ?? null,
      data.cover_path ?? null,
      data.deadline ?? null,
      JSON.stringify(Array.isArray(data.tools) ? data.tools : []),
      data.description ?? null,
      data.pinned ? 1 : 0
    )
  return getProject(Number(info.lastInsertRowid))!
}

export function updateProject(id: number, patch: Partial<Project>): Project {
  const sets: string[] = []
  const values: any[] = []
  for (const key of ['name', 'client', 'kind', 'status', 'color', 'cover_path', 'deadline', 'description'] as const) {
    if (patch[key] === undefined) continue
    sets.push(`${key} = ?`)
    values.push(patch[key])
  }
  if (patch.tools !== undefined) {
    sets.push('tools = ?')
    values.push(JSON.stringify(Array.isArray(patch.tools) ? patch.tools : []))
  }
  if (patch.pinned !== undefined) {
    sets.push('pinned = ?')
    values.push(patch.pinned ? 1 : 0)
  }
  if (sets.length) {
    sets.push('updated_at = ?')
    values.push(now(), id)
    db().prepare(`UPDATE projects SET ${sets.join(', ')} WHERE id = ?`).run(...values)
  }
  return getProject(id)!
}

export function deleteProject(id: number): void {
  // assets cascade; linked notes/tasks keep their rows (project_id → NULL)
  db().prepare('DELETE FROM projects WHERE id = ?').run(id)
}

export function reorderProjects(ids: number[]): void {
  const stmt = db().prepare('UPDATE projects SET sort = ? WHERE id = ?')
  const tx = db().transaction((order: number[]) => {
    order.forEach((id, i) => stmt.run(i, id))
  })
  tx(ids)
}
