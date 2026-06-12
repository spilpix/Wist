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

export function listTasks(filters: { done?: boolean } = {}): Task[] {
  const where = filters.done === undefined ? '' : `WHERE done = ${filters.done ? 1 : 0}`
  const rows = db()
    .prepare(
      `SELECT * FROM tasks ${where}
       ORDER BY done ASC,
                CASE priority WHEN 'high' THEN 0 WHEN 'low' THEN 1 ELSE 2 END ASC,
                created_at DESC`
    )
    .all() as any[]
  return rows.map(rowToTask)
}

export function getTask(id: number): Task | null {
  const row = db().prepare('SELECT * FROM tasks WHERE id = ?').get(id)
  return row ? rowToTask(row) : null
}

export function createTask(data: Partial<Task>): Task {
  const info = db()
    .prepare('INSERT INTO tasks (title, note, priority, due_date, tags, source) VALUES (?, ?, ?, ?, ?, ?)')
    .run(
      (data.title ?? '').trim() || 'Untitled',
      data.note ?? null,
      data.priority && ['none', 'low', 'high'].includes(data.priority) ? data.priority : 'none',
      data.due_date ?? null,
      JSON.stringify(Array.isArray(data.tags) ? data.tags : []),
      typeof data.source === 'string' && data.source ? data.source.slice(0, 64) : 'user'
    )
  return getTask(Number(info.lastInsertRowid))!
}

export function updateTask(id: number, patch: Partial<Task>): Task {
  const sets: string[] = []
  const values: any[] = []
  for (const key of ['title', 'note', 'priority', 'due_date'] as const) {
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
