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

const STATUSES = ['todo', 'doing', 'done'] as const
type TaskStatus = (typeof STATUSES)[number]
const validStatus = (s: unknown): s is TaskStatus => typeof s === 'string' && (STATUSES as readonly string[]).includes(s)

const PRIORITIES = ['none', 'low', 'high'] as const
const validPriority = (p: unknown): p is (typeof PRIORITIES)[number] =>
  typeof p === 'string' && (PRIORITIES as readonly string[]).includes(p)

// normalize status/priority to the allowed unions so a bad agent/imported value
// (written outside these helpers) can never reach the renderer's index lookups
const rowToTask = (row: any): Task => ({
  ...row,
  tags: safeParse(row.tags),
  status: validStatus(row.status) ? row.status : row.done ? 'done' : 'todo',
  priority: validPriority(row.priority) ? row.priority : 'none',
})

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
  const status: TaskStatus = validStatus(data.status) ? data.status : 'todo'
  const done = status === 'done' ? 1 : 0
  const info = db()
    .prepare(
      'INSERT INTO tasks (title, note, priority, due_date, tags, project_id, source, status, done, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
    .run(
      (data.title ?? '').trim() || 'Untitled',
      data.note ?? null,
      data.priority && ['none', 'low', 'high'].includes(data.priority) ? data.priority : 'none',
      data.due_date ?? null,
      JSON.stringify(Array.isArray(data.tags) ? data.tags : []),
      data.project_id ?? null,
      typeof data.source === 'string' && data.source ? data.source.slice(0, 64) : 'user',
      status,
      done,
      done ? now() : null
    )
  return getTask(Number(info.lastInsertRowid))!
}

export function updateTask(id: number, patch: Partial<Task>): Task {
  const sets: string[] = []
  const values: any[] = []
  for (const key of ['title', 'note', 'due_date', 'project_id'] as const) {
    if (patch[key] === undefined) continue
    sets.push(`${key} = ?`)
    values.push(patch[key])
  }
  if (patch.priority !== undefined && validPriority(patch.priority)) {
    sets.push('priority = ?')
    values.push(patch.priority)
  }
  if (patch.tags !== undefined) {
    sets.push('tags = ?')
    values.push(JSON.stringify(Array.isArray(patch.tags) ? patch.tags : []))
  }
  // status drives done; a legacy `done` patch drives status. Keep all three coherent
  // so the kanban, the list checkbox, Home and the agent API never disagree.
  let status: TaskStatus | undefined
  if (patch.status !== undefined) status = validStatus(patch.status) ? patch.status : 'todo'
  else if (patch.done !== undefined) status = patch.done ? 'done' : 'todo'
  if (status !== undefined) {
    const done = status === 'done' ? 1 : 0
    sets.push('status = ?', 'done = ?')
    values.push(status, done)
    if (done) {
      // stamp completion only on the transition into done — re-dropping a done card
      // away and back must not rewrite its original completion time
      const wasDone = (db().prepare('SELECT done FROM tasks WHERE id = ?').get(id) as { done: number } | undefined)?.done === 1
      if (!wasDone) {
        sets.push('completed_at = ?')
        values.push(now())
      }
    } else {
      sets.push('completed_at = ?')
      values.push(null)
    }
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
