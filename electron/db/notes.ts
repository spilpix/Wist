import { db, now } from './database'
import * as edges from './edges'
import { safeParse, safeParseObject, stringifyProps } from './_row'
import type { Note } from '../../src/types/models'

function rowToNote(row: any): Note {
  return { ...row, tags: safeParse(row.tags), props: safeParseObject(row.props) }
}

// [[Title]] or [[Title|alias]] — alias captured separately so a rename preserves it
const WIKILINK_RE = /\[\[([^\]|\n]+)((?:\|[^\]\n]*)?)\]\]/g

/**
 * Rename support: rewrite `[[oldTitle]]` → `[[newTitle]]` (keeping any |alias) in every
 * note that links to it, so the visible link text and outgoing panels track the rename.
 * The edges themselves are id-based and stay valid regardless; we re-sync each rewritten
 * note so its parsed links/tags converge.
 */
function rewriteWikilinkTarget(oldTitle: string, newTitle: string): void {
  const from = (oldTitle || '').trim().toLowerCase()
  if (!from || from === (newTitle || '').trim().toLowerCase()) return
  const rows = db().prepare('SELECT id, content FROM notes WHERE deleted_at IS NULL').all() as Array<{ id: number; content: string }>
  for (const r of rows) {
    if (!r.content) continue
    let changed = false
    const next = r.content.replace(WIKILINK_RE, (full, target: string, alias: string) => {
      if (target.trim().toLowerCase() === from) {
        changed = true
        return `[[${newTitle}${alias}]]`
      }
      return full
    })
    if (changed) {
      db().prepare('UPDATE notes SET content = ?, updated_at = ? WHERE id = ?').run(next, now(), r.id)
      edges.syncNoteLinks(r.id, next)
    }
  }
}

const SELECT = `
  SELECT n.*, p.name AS project_name
  FROM notes n
  LEFT JOIN projects p ON p.id = n.project_id
`

export function listNotes(filters: { search?: string; tag?: string; projectId?: number } = {}): Note[] {
  // hide notes whose hub is in the Trash (they return on restore) — mirrors listTasks
  const where: string[] = ['n.deleted_at IS NULL', '(n.project_id IS NULL OR p.deleted_at IS NULL)']
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
    .prepare('INSERT INTO notes (title, content, tags, project_id, folder_id, pinned, source, props) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(
      data.title ?? '',
      data.content ?? '',
      JSON.stringify(Array.isArray(data.tags) ? data.tags : []),
      data.project_id ?? null,
      data.folder_id ?? null,
      data.pinned ? 1 : 0,
      typeof data.source === 'string' && data.source ? data.source.slice(0, 64) : 'user',
      stringifyProps(data.props)
    )
  const id = Number(info.lastInsertRowid)
  edges.setContainer({ type: 'note', id }, data.project_id ?? null)
  // parse this note's [[links]]/#tags into edges, and pick up any pre-existing notes
  // that already link to this (now-created) title
  edges.syncNoteLinks(id, data.content ?? '')
  edges.reconcileInbound(id, (data.title ?? '').toString())
  return getNote(id)!
}

const WRITABLE = ['title', 'content', 'tags', 'project_id', 'folder_id', 'pinned', 'props'] as const

export function updateNote(id: number, patch: Partial<Note>): Note {
  // capture the pre-rename title so we can rewrite links that point at it
  const oldTitle =
    patch.title !== undefined
      ? ((db().prepare('SELECT title FROM notes WHERE id=?').get(id) as { title: string } | undefined)?.title ?? '')
      : null

  const sets: string[] = []
  const values: any[] = []
  for (const key of WRITABLE) {
    if (patch[key] === undefined) continue
    sets.push(`${key} = ?`)
    values.push(
      key === 'tags' ? JSON.stringify(Array.isArray(patch.tags) ? patch.tags : []) : key === 'props' ? stringifyProps(patch.props) : patch[key]
    )
  }
  if (sets.length) {
    sets.push('updated_at = ?')
    values.push(now(), id)
    db().prepare(`UPDATE notes SET ${sets.join(', ')} WHERE id = ?`).run(...values)
  }
  // keep the containment edge in lockstep with the project_id column
  if (patch.project_id !== undefined) edges.setContainer({ type: 'note', id }, patch.project_id ?? null)
  // keep this note's link/tag edges in lockstep with its body
  if (patch.content !== undefined) edges.syncNoteLinks(id, patch.content ?? '')
  // on a real title change, rewrite [[oldTitle]] in every note that references it
  if (oldTitle !== null) {
    const newTitle = (patch.title ?? '').toString()
    if (oldTitle.trim().toLowerCase() !== newTitle.trim().toLowerCase()) rewriteWikilinkTarget(oldTitle, newTitle)
  }
  return getNote(id)!
}

export function deleteNote(id: number): void {
  // soft-delete → moves to Trash; purge happens from there
  db().prepare('UPDATE notes SET deleted_at = ? WHERE id = ?').run(now(), id)
}

export interface NoteSearchHit {
  id: number
  title: string
  snippet: string
}

// Turn free user text into a safe FTS5 prefix-AND query: each token quoted (so
// punctuation can't break MATCH syntax) and prefix-matched. Empty input → '' (skip).
function ftsQuery(input: string): string {
  return input
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((tok) => `"${tok.replace(/"/g, '')}"*`)
    .join(' ')
}

/**
 * Full-text search across note titles + bodies via the FTS5 index (migration 027).
 * Cyrillic-correct (unicode61), ranked, with a content snippet for each hit. Hides
 * trashed notes and notes whose hub is trashed.
 */
export function searchNotesFts(query: string, limit = 20): NoteSearchHit[] {
  const q = ftsQuery(query)
  if (!q) return []
  try {
    return db()
      .prepare(
        `SELECT n.id AS id, n.title AS title,
                snippet(notes_fts, 1, '', '', '…', 10) AS snippet
         FROM notes_fts f
         JOIN notes n ON n.id = f.rowid
         WHERE notes_fts MATCH ? AND n.deleted_at IS NULL
           AND (n.project_id IS NULL OR (SELECT deleted_at FROM projects WHERE id = n.project_id) IS NULL)
         ORDER BY rank
         LIMIT ?`
      )
      .all(q, limit) as NoteSearchHit[]
  } catch {
    return [] // a malformed MATCH (e.g. a lone operator) → no results rather than throw
  }
}

export function distinctNoteTags(): string[] {
  const rows = db().prepare('SELECT tags FROM notes WHERE deleted_at IS NULL').all() as Array<{ tags: string }>
  const set = new Set<string>()
  for (const row of rows) for (const tag of safeParse(row.tags)) set.add(tag)
  return [...set].sort((a, b) => a.localeCompare(b))
}
