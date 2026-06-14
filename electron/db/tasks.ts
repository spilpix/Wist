import { db, now } from './database'
import type { Task } from '../../src/types/models'

function safeParse(v: unknown): string[] {
  if (typeof v !== 'string') return []
  try {
    const parsed = JSON.parse(v)
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

const rowToTask = (row: any): Task => ({ ...row, tags: safeParse(row.tags) })

const SELECT = `SELECT t.*, p.name AS project_name FROM tasks t LEFT JOIN projects p ON p.id = t.project_id`

export function listTasks(filters: { done?: boolean; projectId?: number } = {}): Task[] {
  const where: string[] = []
  const params: any[] = []
  if (filters.done !== undefined) {
    where.push('t.done = ?')
    params.push(filters.done ? 1 : 0)
  }
  if (filters.projectId !== undefined) {
    where.push('t.project_id = ?')
    params.push(filters.projectId)
  }
  const sql = `${SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY t.done ASC,
                CASE t.priority WHEN 'high' THEN 0 WHEN 'low' THEN 1 ELSE 2 END ASC,
                t.created_at DESC`
  return (db().prepare(sql).all(...params) as any[]).map(rowToTask)
}

export function getTask(id: number): Task | null {
  const row = db().prepare(`${SELECT} WHERE t.id = ?`).get(id)
  return row ? rowToTask(row) : null
}

export function createTask(data: Partial<Task>): Task {
  const info = db()
    .prepare('INSERT INTO tasks (title, note, priority, due_date, tags, project_id, source) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(
      (data.title ?? '').trim() || 'Untitled',
      data.note ?? null,
      data.priority && ['none', 'low', 'high'].includes(data.priority) ? data.priority : 'none',
      data.due_date ?? null,
      JSON.stringify(Array.isArray(data.tags) ? data.tags : []),
      data.project_id ?? null,
      typeof data.source === 'string' && data.source ? data.source.slice(0, 64) : 'user'
    )
  return getTask(Number(info.lastInsertRowid))!
}

export function updateTask(id: number, patch: Partial<Task>): Task {
  const sets: string[] = []
  const values: any[] = []
  for (const key of ['title', 'note', 'priority', 'due_date', 'project_id'] as const) {
    if (patch[key] === undefined) continue
    sets.push(`${key} = ?`)
    values.push(patch[key])
  }
  if (patch.tags !== undefined) {
    sets.push('tags = ?')
    values.push(JSON.stringify(Array.isArray(patch.tags) ? patch.tags : []))
  }
  if (patch.done !== undefined) {
    sets.push('done = ?', 'completed_at = ?')
    values.push(patch.done ? 1 : 0, patch.done ? now() : null)
  }
  if (sets.length) {
    values.push(id)
    db().prepare(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`).run(...values)
  }
  return getTask(id)!
}

export function deleteTask(id: number): void {
  db().prepare('DELETE FROM tasks WHERE id = ?').run(id)
}

export function clearCompleted(): number {
  return db().prepare('DELETE FROM tasks WHERE done = 1').run().changes
}
