import { db } from './database'
import type { NoteFolder } from '../../src/types/models'

/**
 * Folders for the Notes vault (Obsidian-style). Folders nest via parent_id; a note
 * references one folder via notes.folder_id (NULL = lives at the root). Deleting a
 * folder reparents its direct children (sub-folders + notes) up to its own parent so
 * nothing is orphaned, then removes the row.
 */

export function listFolders(): NoteFolder[] {
  return db()
    .prepare('SELECT * FROM note_folders ORDER BY sort, name COLLATE NOCASE')
    .all() as NoteFolder[]
}

export function getFolder(id: number): NoteFolder | null {
  return (db().prepare('SELECT * FROM note_folders WHERE id = ?').get(id) as NoteFolder) ?? null
}

function nextSort(parentId: number | null): number {
  const row = db()
    .prepare('SELECT COALESCE(MAX(sort), -1) + 1 AS s FROM note_folders WHERE parent_id IS ?')
    .get(parentId) as { s: number }
  return row.s
}

export function createFolder(name: string, parentId: number | null = null): NoteFolder {
  const clean = (name ?? '').trim() || 'New folder'
  const pid = typeof parentId === 'number' ? parentId : null
  const info = db()
    .prepare('INSERT INTO note_folders (name, parent_id, sort) VALUES (?, ?, ?)')
    .run(clean, pid, nextSort(pid))
  return getFolder(Number(info.lastInsertRowid))!
}

export function renameFolder(id: number, name: string): NoteFolder | null {
  const clean = (name ?? '').trim()
  if (clean) db().prepare('UPDATE note_folders SET name = ? WHERE id = ?').run(clean, id)
  return getFolder(id)
}

/** all descendant folder ids of `id` (used to block moving a folder into itself) */
function descendantIds(id: number): Set<number> {
  const all = listFolders()
  const byParent = new Map<number | null, NoteFolder[]>()
  for (const f of all) {
    const arr = byParent.get(f.parent_id) ?? []
    arr.push(f)
    byParent.set(f.parent_id, arr)
  }
  const out = new Set<number>()
  const walk = (pid: number) => {
    for (const c of byParent.get(pid) ?? []) {
      if (!out.has(c.id)) {
        out.add(c.id)
        walk(c.id)
      }
    }
  }
  walk(id)
  return out
}

export function moveFolder(id: number, parentId: number | null): void {
  const pid = typeof parentId === 'number' ? parentId : null
  if (pid === id) return // can't be its own parent
  if (pid != null && descendantIds(id).has(pid)) return // would create a cycle
  db().prepare('UPDATE note_folders SET parent_id = ?, sort = ? WHERE id = ?').run(pid, nextSort(pid), id)
}

export function removeFolder(id: number): void {
  const folder = getFolder(id)
  if (!folder) return
  const parent = folder.parent_id ?? null
  // lift direct children (sub-folders + notes) up to the deleted folder's parent
  db().prepare('UPDATE note_folders SET parent_id = ? WHERE parent_id = ?').run(parent, id)
  db().prepare('UPDATE notes SET folder_id = ? WHERE folder_id = ?').run(parent, id)
  db().prepare('DELETE FROM note_folders WHERE id = ?').run(id)
}

export function reorderFolders(ids: number[]): void {
  const stmt = db().prepare('UPDATE note_folders SET sort = ? WHERE id = ?')
  const tx = db().transaction((list: number[]) => {
    list.forEach((id, i) => stmt.run(i, id))
  })
  tx(ids ?? [])
}
