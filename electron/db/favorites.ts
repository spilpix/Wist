import { db } from './database'
import type { Favorite, FavoriteInput } from '../../src/types/models'
export type { FavoriteInput }

// Re-resolve a favorite's live label / cover / route from its source table.
// Returns null when the entity no longer exists (so list() can self-clean the row).
// 'route' favorites have no backing row — they keep their snapshot, so return {}.
// Shared with Library collections, which group the same polymorphic entities.
export function resolveEntity(kind: string, ref: string): Partial<Favorite> | null {
  const id = Number(ref)
  switch (kind) {
    case 'note': {
      const r = db().prepare('SELECT title FROM notes WHERE id = ? AND deleted_at IS NULL').get(id) as
        | { title: string }
        | undefined
      if (!r) return null
      return { label: r.title ?? '', route: `/notes?open=${id}` }
    }
    case 'project': {
      const r = db().prepare('SELECT name, cover_path FROM projects WHERE id = ? AND deleted_at IS NULL').get(id) as
        | { name: string; cover_path: string | null }
        | undefined
      if (!r) return null
      return { label: r.name ?? '', cover_path: r.cover_path, route: `/project/${id}` }
    }
    case 'title': {
      const r = db().prepare('SELECT title, cover_path FROM titles WHERE id = ?').get(id) as
        | { title: string; cover_path: string | null }
        | undefined
      if (!r) return null
      return { label: r.title ?? '', cover_path: r.cover_path, route: `/title/${id}` }
    }
    case 'track': {
      const r = db().prepare('SELECT title, artist, cover_path FROM tracks WHERE id = ?').get(id) as
        | { title: string; artist: string | null; cover_path: string | null }
        | undefined
      if (!r) return null
      return { label: r.title ?? '', sublabel: r.artist, cover_path: r.cover_path, route: '/music' }
    }
    case 'canvas': {
      const r = db().prepare('SELECT name FROM canvases WHERE id = ?').get(id) as { name: string } | undefined
      if (!r) return null
      return { label: r.name ?? '', route: `/canvas/${id}` }
    }
    case 'task': {
      const r = db().prepare('SELECT title FROM tasks WHERE id = ? AND deleted_at IS NULL').get(id) as
        | { title: string }
        | undefined
      if (!r) return null
      return { label: r.title ?? '', route: '/tasks' }
    }
    case 'vault': {
      const r = db().prepare('SELECT name, path, kind FROM vault_files WHERE id = ?').get(id) as
        | { name: string; path: string; kind: string }
        | undefined
      if (!r) return null
      // images preview themselves; everything else falls back to a kind icon
      const isImg = r.kind === 'image' || /\.(png|jpe?g|webp|gif|bmp|avif|svg)$/i.test(r.path ?? '')
      return { label: r.name ?? '', cover_path: isImg ? r.path : null, route: '/vault' }
    }
    case 'playlist': {
      const r = db().prepare('SELECT title, cover_path, url FROM playlists WHERE id = ?').get(id) as
        | { title: string; cover_path: string | null; url: string }
        | undefined
      if (!r) return null
      // playlists open externally — the route IS the URL (the opener routes http → shell)
      return { label: r.title ?? '', cover_path: r.cover_path, route: r.url }
    }
    case 'route':
    default:
      return {}
  }
}

export function listFavorites(): Favorite[] {
  const rows = db().prepare('SELECT * FROM favorites ORDER BY sort ASC, created_at ASC').all() as Favorite[]
  const out: Favorite[] = []
  const stale: number[] = []
  for (const row of rows) {
    const live = resolveEntity(row.kind, row.ref)
    if (live === null) {
      stale.push(row.id) // backing entity was deleted → drop the dead favorite
      continue
    }
    out.push({ ...row, ...live })
  }
  if (stale.length) {
    db()
      .prepare(`DELETE FROM favorites WHERE id IN (${stale.map(() => '?').join(',')})`)
      .run(...stale)
  }
  return out
}

export function isFavorite(kind: string, ref: string): boolean {
  return !!db().prepare('SELECT 1 FROM favorites WHERE kind = ? AND ref = ?').get(kind, String(ref))
}

export function addFavorite(input: FavoriteInput): Favorite {
  const ref = String(input.ref)
  const max = (db().prepare('SELECT MAX(sort) AS m FROM favorites').get() as { m: number | null }).m ?? 0
  db()
    .prepare(
      `INSERT INTO favorites (kind, ref, label, sublabel, cover_path, route, sort)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(kind, ref) DO NOTHING`
    )
    .run(
      input.kind,
      ref,
      input.label ?? '',
      input.sublabel ?? null,
      input.cover_path ?? null,
      input.route ?? null,
      max + 1
    )
  return db().prepare('SELECT * FROM favorites WHERE kind = ? AND ref = ?').get(input.kind, ref) as Favorite
}

export function removeFavorite(kind: string, ref: string | number): void {
  db().prepare('DELETE FROM favorites WHERE kind = ? AND ref = ?').run(kind, String(ref))
}

// flip pinned state; returns the NEW state (true = now pinned)
export function toggleFavorite(input: FavoriteInput): boolean {
  const ref = String(input.ref)
  if (isFavorite(input.kind, ref)) {
    removeFavorite(input.kind, ref)
    return false
  }
  addFavorite(input)
  return true
}

export function reorderFavorites(ids: number[]): void {
  const stmt = db().prepare('UPDATE favorites SET sort = ? WHERE id = ?')
  const tx = db().transaction((list: number[]) => {
    list.forEach((id, i) => stmt.run(i, id))
  })
  tx(ids)
}
