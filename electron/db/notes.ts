import { db, now } from './database'
import type { Note } from '../../src/types/models'

function safeParse(v: unknown): string[] {
  if (typeof v !== 'string') return []
  try {
    const parsed = JSON.parse(v)
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

function rowToNote(row: any): Note {
  return { ...row, tags: safeParse(row.tags) }
}

const SELECT = `
  SELECT n.*, t.title AS linked_title_name, p.name AS project_name
  FROM notes n
  LEFT JOIN titles t ON t.id = n.linked_title_id
  LEFT JOIN projects p ON p.id = n.project_id
`

export function listNotes(filters: { search?: string; tag?: string; projectId?: number } = {}): Note[] {
  const where: string[] = ['n.deleted_at IS NULL']
  const params: any[] = []
  if (filters.search) {
    where.push('(n.title LIKE ? OR n.content LIKE ?)')
    const q = `%${filters.search}%`
    params.push(q, q)
  }
  if (filters.tag) {
    where.push('n.tags LIKE ?')
    params.push(`%${JSON.stringify(filters.tag)}%`)
  }
  if (filters.projectId !== undefined) {
    where.push('n.project_id = ?')
    params.push(filters.projectId)
  }
  // id DESC tiebreak keeps same-second notes in a deterministic (newest-first) order
  const sql = `${SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY n.pinned DESC, n.updated_at DESC, n.id DESC`
  return (db().prepare(sql).all(...params) as any[]).map(rowToNote)
}

export function getNote(id: number): Note | null {
  const row = db().prepare(`${SELECT} WHERE n.id = ?`).get(id)
  return row ? rowToNote(row) : null
}

export function createNote(data: Partial<Note>): Note {
  const info = db()
    .prepare('INSERT INTO notes (title, content, tags, linked_title_id, project_id, folder_id, pinned, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(
      data.title ?? '',
      data.content ?? '',
      JSON.stringify(Array.isArray(data.tags) ? data.tags : []),
      data.linked_title_id ?? null,
      data.project_id ?? null,
      data.folder_id ?? null,
      data.pinned ? 1 : 0,
      typeof data.source === 'string' && data.source ? data.source.slice(0, 64) : 'user'
    )
  return getNote(Number(info.lastInsertRowid))!
}

const WRITABLE = ['title', 'content', 'tags', 'linked_title_id', 'project_id', 'folder_id', 'pinned'] as const

export function updateNote(id: number, patch: Partial<Note>): Note {
  const sets: string[] = []
  const values: any[] = []
  for (const key of WRITABLE) {
    if (patch[key] === undefined) continue
    sets.push(`${key} = ?`)
    values.push(key === 'tags' ? JSON.stringify(Array.isArray(patch.tags) ? patch.tags : []) : patch[key])
  }
  if (sets.length) {
    sets.push('updated_at = ?')
    values.push(now(), id)
    db().prepare(`UPDATE notes SET ${sets.join(', ')} WHERE id = ?`).run(...values)
  }
  return getNote(id)!
}

export function deleteNote(id: number): void {
  // soft-delete → moves to Trash; purge happens from there
  db().prepare('UPDATE notes SET deleted_at = ? WHERE id = ?').run(now(), id)
}

export function distinctNoteTags(): string[] {
  const rows = db().prepare('SELECT tags FROM notes WHERE deleted_at IS NULL').all() as Array<{ tags: string }>
  const set = new Set<string>()
  for (const row of rows) for (const tag of safeParse(row.tags)) set.add(tag)
  return [...set].sort((a, b) => a.localeCompare(b))
}
