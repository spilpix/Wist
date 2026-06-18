import { db } from './database'
import { resolveEntity } from './favorites'
import type { Collection, CollectionItem } from '../../src/types/models'

// A Library "folder": its name/color/sort come straight from the row, but item_count
// and the up-to-4 preview covers are computed live from current membership (so a tile
// never shows a stale count or a cover for a deleted item).
function toCollection(r: any): Collection {
  const members = db()
    .prepare('SELECT kind, ref FROM collection_items WHERE collection_id = ? ORDER BY sort ASC, created_at ASC')
    .all(r.id) as Array<{ kind: string; ref: string }>
  const covers: string[] = []
  let count = 0
  for (const m of members) {
    const live = resolveEntity(m.kind, m.ref)
    if (live === null) continue // backing entity gone — skip (item-list self-cleans it)
    count++
    if (live.cover_path && covers.length < 4) covers.push(live.cover_path)
  }
  return {
    id: r.id,
    name: r.name,
    icon: r.icon ?? null,
    color: r.color ?? null,
    sort: r.sort,
    created_at: r.created_at,
    item_count: count,
    covers,
  }
}

export function listCollections(): Collection[] {
  return (db().prepare('SELECT * FROM collections ORDER BY sort ASC, created_at ASC').all() as any[]).map(toCollection)
}

export function getCollection(id: number): Collection | null {
  const row = db().prepare('SELECT * FROM collections WHERE id = ?').get(id)
  return row ? toCollection(row) : null
}

export interface CollectionInput {
  name?: string
  color?: string | null
  icon?: string | null
}

export function createCollection(input: CollectionInput): Collection {
  const max = (db().prepare('SELECT MAX(sort) AS m FROM collections').get() as { m: number | null }).m ?? 0
  const info = db()
    .prepare('INSERT INTO collections (name, color, icon, sort) VALUES (?, ?, ?, ?)')
    .run((input.name ?? '').trim() || 'New folder', input.color ?? null, input.icon ?? null, max + 1)
  return toCollection(db().prepare('SELECT * FROM collections WHERE id = ?').get(Number(info.lastInsertRowid)))
}

export function updateCollection(id: number, patch: CollectionInput): Collection | null {
  const sets: string[] = []
  const vals: unknown[] = []
  if (patch.name !== undefined) {
    sets.push('name = ?')
    vals.push((patch.name ?? '').trim() || 'New folder')
  }
  if (patch.color !== undefined) {
    sets.push('color = ?')
    vals.push(patch.color ?? null)
  }
  if (patch.icon !== undefined) {
    sets.push('icon = ?')
    vals.push(patch.icon ?? null)
  }
  if (sets.length) db().prepare(`UPDATE collections SET ${sets.join(', ')} WHERE id = ?`).run(...vals, id)
  return getCollection(id)
}

export function removeCollection(id: number): void {
  db().prepare('DELETE FROM collections WHERE id = ?').run(id) // collection_items cascade
}

export function reorderCollections(ids: number[]): void {
  const stmt = db().prepare('UPDATE collections SET sort = ? WHERE id = ?')
  const tx = db().transaction((list: number[]) => list.forEach((id, i) => stmt.run(i, id)))
  tx(ids)
}

export function addCollectionItem(collectionId: number, kind: string, ref: string | number): void {
  const r = String(ref)
  const max = (
    db().prepare('SELECT MAX(sort) AS m FROM collection_items WHERE collection_id = ?').get(collectionId) as {
      m: number | null
    }
  ).m ?? 0
  db()
    .prepare(
      `INSERT INTO collection_items (collection_id, kind, ref, sort) VALUES (?, ?, ?, ?)
       ON CONFLICT(collection_id, kind, ref) DO NOTHING`
    )
    .run(collectionId, kind, r, max + 1)
}

export function removeCollectionItem(collectionId: number, kind: string, ref: string | number): void {
  db()
    .prepare('DELETE FROM collection_items WHERE collection_id = ? AND kind = ? AND ref = ?')
    .run(collectionId, kind, String(ref))
}

// Resolved members for the folder's detail view; drops + self-cleans any whose
// backing entity has since been deleted.
export function listCollectionItems(collectionId: number): CollectionItem[] {
  const rows = db()
    .prepare('SELECT * FROM collection_items WHERE collection_id = ? ORDER BY sort ASC, created_at ASC')
    .all(collectionId) as Array<{ id: number; kind: string; ref: string }>
  const out: CollectionItem[] = []
  const stale: number[] = []
  for (const row of rows) {
    const live = resolveEntity(row.kind, row.ref)
    if (live === null) {
      stale.push(row.id)
      continue
    }
    out.push({
      id: row.id,
      kind: row.kind,
      ref: row.ref,
      label: live.label ?? '',
      sublabel: live.sublabel ?? null,
      cover_path: live.cover_path ?? null,
      route: live.route ?? null,
    })
  }
  if (stale.length) {
    db()
      .prepare(`DELETE FROM collection_items WHERE id IN (${stale.map(() => '?').join(',')})`)
      .run(...stale)
  }
  return out
}

// Which folders already contain a given entity — powers the "✓ already added" state
// in the item picker.
export function collectionsForItem(kind: string, ref: string | number): number[] {
  return (
    db()
      .prepare('SELECT collection_id FROM collection_items WHERE kind = ? AND ref = ?')
      .all(kind, String(ref)) as Array<{ collection_id: number }>
  ).map((r) => r.collection_id)
}
