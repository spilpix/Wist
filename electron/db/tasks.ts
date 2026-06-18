import { db, now } from './database'
import type { Task, TaskComment, TaskAttachment } from '../../src/types/models'

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

const SELECT = `SELECT t.*, p.name AS project_name, ti.title AS linked_title_name, ti.type AS linked_title_type
  FROM tasks t
  LEFT JOIN projects p ON p.id = t.project_id
  LEFT JOIN titles ti ON ti.id = t.linked_title_id`

export function listTasks(filters: { done?: boolean; projectId?: number } = {}): Task[] {
  const where: string[] = ['t.deleted_at IS NULL']
  const params: any[] = []
  if (filters.done !== undefined) {
    where.push('t.done = ?')
    params.push(filters.done ? 1 : 0)
  }
  if (filters.projectId !== undefined) {
    where.push('t.project_id = ?')
    params.push(filters.projectId)
  }
  const sql = `${SELECT} WHERE ${where.join(' AND ')}
       ORDER BY t.done ASC,
                t.position ASC,
                CASE t.priority WHEN 'high' THEN 0 WHEN 'low' THEN 1 ELSE 2 END ASC,
                t.created_at DESC`
  return (db().prepare(sql).all(...params) as any[]).map(rowToTask)
}

/** Persist a manual drag order: assign position 1..N to the given task ids, in order. */
export function reorderTasks(ids: number[]): void {
  const d = db()
  const stmt = d.prepare('UPDATE tasks SET position = ? WHERE id = ?')
  const tx = d.transaction((list: number[]) => {
    list.forEach((id, i) => stmt.run(i + 1, id))
  })
  tx(ids.filter((n) => Number.isFinite(n)))
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
      'INSERT INTO tasks (title, note, priority, due_date, remind_at, tags, project_id, linked_title_id, source, status, done, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
    .run(
      (data.title ?? '').trim() || 'Untitled',
      data.note ?? null,
      data.priority && ['none', 'low', 'high'].includes(data.priority) ? data.priority : 'none',
      data.due_date ?? null,
      data.remind_at ?? null,
      JSON.stringify(Array.isArray(data.tags) ? data.tags : []),
      data.project_id ?? null,
      data.linked_title_id ?? null,
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
  for (const key of ['title', 'note', 'due_date', 'remind_at', 'project_id', 'linked_title_id'] as const) {
    if (patch[key] === undefined) continue
    sets.push(`${key} = ?`)
    values.push(patch[key])
  }
  // a freshly (re)set reminder time must be eligible to fire again — but only reset the
  // flag when remind_at actually CHANGES, so re-saving the same value can't re-notify
  if (patch.remind_at !== undefined) {
    const cur = (db().prepare('SELECT remind_at FROM tasks WHERE id = ?').get(id) as { remind_at: string | null } | undefined)?.remind_at ?? null
    if (patch.remind_at !== cur) {
      sets.push('reminded = ?')
      values.push(0)
    }
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
    // scope to live rows so a late/stale write can't resurrect a trashed task
    db().prepare(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ? AND deleted_at IS NULL`).run(...values)
  }
  return getTask(id)!
}

export function deleteTask(id: number): void {
  // soft-delete → moves to Trash
  db().prepare('UPDATE tasks SET deleted_at = ? WHERE id = ?').run(now(), id)
}

// reminders that are due and not yet fired (used by the main-process scheduler)
export function dueReminders(): Task[] {
  const rows = db()
    .prepare(
      `${SELECT} WHERE t.deleted_at IS NULL AND t.done = 0 AND t.reminded = 0
         AND t.remind_at IS NOT NULL AND t.remind_at <= ?
       ORDER BY t.remind_at ASC LIMIT 20`
    )
    .all(now()) as any[]
  return rows.map(rowToTask)
}

export function markReminded(id: number): void {
  db().prepare('UPDATE tasks SET reminded = 1 WHERE id = ?').run(id)
}

export function clearCompleted(): number {
  // clearing completed tasks moves them to Trash (recoverable), not a hard delete
  return db().prepare('UPDATE tasks SET deleted_at = ? WHERE done = 1 AND deleted_at IS NULL').run(now()).changes
}

// ---- task comments (shown in the detail peek) ----
export function listComments(taskId: number): TaskComment[] {
  return db()
    .prepare('SELECT * FROM task_comments WHERE task_id = ? ORDER BY created_at ASC, id ASC')
    .all(taskId) as TaskComment[]
}

export function addComment(taskId: number, body: string): TaskComment {
  const info = db().prepare('INSERT INTO task_comments (task_id, body) VALUES (?, ?)').run(taskId, (body ?? '').trim())
  return db().prepare('SELECT * FROM task_comments WHERE id = ?').get(Number(info.lastInsertRowid)) as TaskComment
}

export function removeComment(id: number): void {
  db().prepare('DELETE FROM task_comments WHERE id = ?').run(id)
}

// ---- task attachments (images/files in the detail peek) ----
// Created lazily (IF NOT EXISTS) instead of via a numbered migration so it can't
// collide with migrations being added in parallel sessions.
let _attReady = false
function ensureAttachments(): void {
  if (_attReady) return
  db().exec(`
    CREATE TABLE IF NOT EXISTS task_attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      path TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_task_attachments_task ON task_attachments(task_id);
  `)
  _attReady = true
}

export function listAttachments(taskId: number): TaskAttachment[] {
  ensureAttachments()
  return db()
    .prepare('SELECT * FROM task_attachments WHERE task_id = ? ORDER BY created_at ASC, id ASC')
    .all(taskId) as TaskAttachment[]
}

export function addAttachment(taskId: number, filePath: string, name: string): TaskAttachment {
  ensureAttachments()
  const info = db()
    .prepare('INSERT INTO task_attachments (task_id, path, name) VALUES (?, ?, ?)')
    .run(taskId, filePath, (name ?? '').trim())
  return db().prepare('SELECT * FROM task_attachments WHERE id = ?').get(Number(info.lastInsertRowid)) as TaskAttachment
}

export function removeAttachment(id: number): void {
  ensureAttachments()
  db().prepare('DELETE FROM task_attachments WHERE id = ?').run(id)
}
