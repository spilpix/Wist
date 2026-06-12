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
  SELECT n.*, t.title AS linked_title_name
  FROM notes n
  LEFT JOIN titles t ON t.id = n.linked_title_id
`

export function listNotes(filters: { search?: string; tag?: string } = {}): Note[] {
  const where: string[] = []
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
  const sql = `${SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY n.pinned DESC, n.updated_at DESC`
  return (db().prepare(sql).all(...params) as any[]).map(rowToNote)
}

export function getNote(id: number): Note | null {
  const row = db().prepare(`${SELECT} WHERE n.id = ?`).get(id)
  return row ? rowToNote(row) : null
}

export function createNote(data: Partial<Note>): Note {
  const info = db()
    .prepare('INSERT INTO notes (title, content, tags, linked_title_id, pinned) VALUES (?, ?, ?, ?, ?)')
    .run(
      data.title ?? '',
      data.content ?? '',
      JSON.stringify(Array.isArray(data.tags) ? data.tags : []),
      data.linked_title_id ?? null,
      data.pinned ? 1 : 0
    )
  return getNote(Number(info.lastInsertRowid))!
}

const WRITABLE = ['title', 'content', 'tags', 'linked_title_id', 'pinned'] as const

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
  db().prepare('DELETE FROM notes WHERE id = ?').run(id)
}

export function distinctNoteTags(): string[] {
  const rows = db().prepare('SELECT tags FROM notes').all() as Array<{ tags: string }>
  const set = new Set<string>()
  for (const row of rows) for (const tag of safeParse(row.tags)) set.add(tag)
  return [...set].sort((a, b) => a.localeCompare(b))
}
