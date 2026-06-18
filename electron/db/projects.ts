import { db, now } from './database'
import type { Project, ProjectAsset, ProjectSection } from '../../src/types/models'

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
    (SELECT COUNT(*) FROM notes n WHERE n.project_id = p.id AND n.deleted_at IS NULL) AS note_count,
    (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.done = 0 AND t.deleted_at IS NULL) AS open_task_count,
    (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.deleted_at IS NULL) AS task_count
  FROM projects p
`

export function listProjects(): Project[] {
  const rows = db()
    .prepare(`${SELECT} WHERE p.deleted_at IS NULL ORDER BY p.pinned DESC, p.sort ASC, p.updated_at DESC`)
    .all() as any[]
  return rows.map(rowToProject)
}

export function getProject(id: number): Project | null {
  // don't resolve a trashed hub (its detail page should show "not found")
  const row = db().prepare(`${SELECT} WHERE p.id = ? AND p.deleted_at IS NULL`).get(id)
  return row ? rowToProject(row) : null
}

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
      typeof data.kind === 'string' ? data.kind.trim() : 'video', // free-text type
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
  for (const key of ['name', 'client', 'kind', 'color', 'cover_path', 'deadline', 'description'] as const) {
    if (patch[key] === undefined) continue
    sets.push(`${key} = ?`)
    values.push(patch[key])
  }
  // status is CHECK-constrained — validate so a bad value can't throw a constraint error
  if (patch.status !== undefined && STATUSES.includes(patch.status)) {
    sets.push('status = ?')
    values.push(patch.status)
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
  // soft-delete → moves to Trash (its assets/notes/tasks are untouched until purge)
  db().prepare('UPDATE projects SET deleted_at = ? WHERE id = ?').run(now(), id)
}

export function reorderProjects(ids: number[]): void {
  const stmt = db().prepare('UPDATE projects SET sort = ? WHERE id = ?')
  const tx = db().transaction((order: number[]) => {
    order.forEach((id, i) => stmt.run(i, id))
  })
  tx(ids)
}

// ---- assets (folders / files / urls / reference images) ----

function touch(projectId: number): void {
  db().prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(now(), projectId)
}
function touchByAsset(assetId: number): void {
  const r = db().prepare('SELECT project_id FROM project_assets WHERE id = ?').get(assetId) as any
  if (r) touch(r.project_id)
}
function touchBySection(sectionId: number): void {
  const r = db().prepare('SELECT project_id FROM project_sections WHERE id = ?').get(sectionId) as any
  if (r) touch(r.project_id)
}

export function listAssets(projectId: number): ProjectAsset[] {
  return db()
    .prepare('SELECT * FROM project_assets WHERE project_id = ? ORDER BY sort ASC, id ASC')
    .all(projectId) as ProjectAsset[]
}

type NewAsset = { kind: ProjectAsset['kind']; path?: string | null; url?: string | null; label?: string | null }

export function addAssets(projectId: number, items: NewAsset[], sectionId?: number | null): number {
  if (!items.length) return 0
  // skip paths already in THIS SECTION so a re-drop can't duplicate it, while still
  // letting the same file live in a different section (the user organizes by category)
  const existing = new Set(
    (db()
      .prepare('SELECT path FROM project_assets WHERE project_id = ? AND section_id IS ? AND path IS NOT NULL')
      .all(projectId, sectionId ?? null) as any[]).map((r) => r.path as string)
  )
  const fresh = items.filter((it) => !it.path || !existing.has(it.path))
  if (!fresh.length) return 0
  const base = (db().prepare('SELECT COALESCE(MAX(sort), -1) AS m FROM project_assets WHERE project_id = ?').get(projectId) as any).m as number
  const stmt = db().prepare('INSERT INTO project_assets (project_id, kind, path, url, label, sort, section_id) VALUES (?, ?, ?, ?, ?, ?, ?)')
  const tx = db().transaction((rows: NewAsset[]) => {
    rows.forEach((it, i) => stmt.run(projectId, it.kind, it.path ?? null, it.url ?? null, it.label ?? null, base + 1 + i, sectionId ?? null))
  })
  tx(fresh)
  touch(projectId)
  return fresh.length
}

export function removeAsset(id: number): void {
  touchByAsset(id)
  db().prepare('DELETE FROM project_assets WHERE id = ?').run(id)
}

export function reorderAssets(ids: number[]): void {
  const stmt = db().prepare('UPDATE project_assets SET sort = ? WHERE id = ?')
  const tx = db().transaction((order: number[]) => order.forEach((id, i) => stmt.run(i, id)))
  tx(ids)
}

// move an asset into a section (sectionId = null → ungrouped). Bumps sort to the
// end of the project so it lands last where the user dropped it.
export function moveAsset(id: number, sectionId: number | null): void {
  const row = db().prepare('SELECT project_id FROM project_assets WHERE id = ?').get(id) as any
  if (!row) return
  const base = (db().prepare('SELECT COALESCE(MAX(sort), -1) AS m FROM project_assets WHERE project_id = ?').get(row.project_id) as any).m as number
  db().prepare('UPDATE project_assets SET section_id = ?, sort = ? WHERE id = ?').run(sectionId ?? null, base + 1, id)
  touch(row.project_id)
}

// ---- sections (user-created "folders" that group a hub's assets) ----

export function listSections(projectId: number): ProjectSection[] {
  return db()
    .prepare('SELECT * FROM project_sections WHERE project_id = ? ORDER BY sort ASC, id ASC')
    .all(projectId) as ProjectSection[]
}

export function createSection(projectId: number, name: string): ProjectSection {
  const base = (db().prepare('SELECT COALESCE(MAX(sort), -1) AS m FROM project_sections WHERE project_id = ?').get(projectId) as any).m as number
  const info = db()
    .prepare('INSERT INTO project_sections (project_id, name, sort) VALUES (?, ?, ?)')
    .run(projectId, name.trim() || 'Раздел', base + 1)
  touch(projectId)
  return db().prepare('SELECT * FROM project_sections WHERE id = ?').get(Number(info.lastInsertRowid)) as ProjectSection
}

export function renameSection(id: number, name: string): void {
  db().prepare('UPDATE project_sections SET name = ? WHERE id = ?').run(name.trim() || 'Раздел', id)
  touchBySection(id)
}

// delete a section; its assets fall back to ungrouped (ON DELETE SET NULL)
export function removeSection(id: number): void {
  touchBySection(id)
  db().prepare('DELETE FROM project_sections WHERE id = ?').run(id)
}

export function reorderSections(ids: number[]): void {
  const stmt = db().prepare('UPDATE project_sections SET sort = ? WHERE id = ?')
  const tx = db().transaction((order: number[]) => order.forEach((id, i) => stmt.run(i, id)))
  tx(ids)
}
