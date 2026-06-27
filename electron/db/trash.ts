import { db } from './database'
import * as edges from './edges'
import type { Note, Project, Task } from '../../src/types/models'

function arr(v: unknown): string[] {
  if (typeof v !== 'string') return []
  try {
    const p = JSON.parse(v)
    return Array.isArray(p) ? p.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

// fixed whitelist — table names are never taken from caller input
const KIND_TABLE: Record<string, string> = { project: 'projects', note: 'notes', task: 'tasks' }

export interface TrashContents {
  projects: Project[]
  notes: Note[]
  tasks: Task[]
}

export function listTrash(): TrashContents {
  const projects = (db().prepare(`SELECT * FROM projects WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC`).all() as any[]).map((r) => ({
    ...r,
    tools: arr(r.tools),
  }))
  const notes = (db().prepare(`SELECT * FROM notes WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC`).all() as any[]).map((r) => ({
    ...r,
    tags: arr(r.tags),
  }))
  const tasks = (db().prepare(`SELECT * FROM tasks WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC`).all() as any[]).map((r) => ({
    ...r,
    tags: arr(r.tags),
  }))
  return { projects, notes, tasks }
}

export function restoreTrash(kind: string, id: number): void {
  const table = KIND_TABLE[kind]
  if (!table) return
  db().prepare(`UPDATE ${table} SET deleted_at = NULL WHERE id = ?`).run(id)
}

export function purgeTrash(kind: string, id: number): void {
  const table = KIND_TABLE[kind]
  if (!table) return
  // hard delete — FK cascades (project assets) / SET NULL (notes/tasks project_id) apply.
  // edges have no FK, so clean the object's relation rows explicitly to avoid dangling refs.
  db().prepare(`DELETE FROM ${table} WHERE id = ?`).run(id)
  edges.removeNode({ type: kind as edges.NodeType, id })
}

export function emptyTrash(): number {
  const d = db()
  let changes = 0
  for (const [kind, table] of Object.entries(KIND_TABLE)) {
    // collect ids first so we can drop their (FK-less) edges, then hard-delete the rows
    const ids = (d.prepare(`SELECT id FROM ${table} WHERE deleted_at IS NOT NULL`).all() as Array<{ id: number }>).map((r) => r.id)
    for (const id of ids) edges.removeNode({ type: kind as edges.NodeType, id })
    changes += d.prepare(`DELETE FROM ${table} WHERE deleted_at IS NOT NULL`).run().changes
  }
  return changes
}
