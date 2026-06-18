import path from 'node:path'
import fs from 'node:fs'
import { db } from './database'
import type { VaultFile, VaultKind, VaultDiskEntry } from '../../src/types/models'

const KIND_BY_EXT: Record<string, VaultKind> = {
  '.jpg': 'image', '.jpeg': 'image', '.png': 'image', '.webp': 'image', '.gif': 'image', '.svg': 'image', '.bmp': 'image', '.avif': 'image',
  '.mp4': 'video', '.mkv': 'video', '.avi': 'video', '.mov': 'video', '.webm': 'video',
  '.mp3': 'audio', '.flac': 'audio', '.wav': 'audio', '.m4a': 'audio', '.ogg': 'audio',
  '.pdf': 'doc', '.doc': 'doc', '.docx': 'doc', '.txt': 'doc', '.md': 'doc',
  '.xls': 'doc', '.xlsx': 'doc', '.ppt': 'doc', '.pptx': 'doc', '.csv': 'doc',
  '.zip': 'archive', '.rar': 'archive', '.7z': 'archive', '.tar': 'archive', '.gz': 'archive',
}

export function kindFor(filePath: string): VaultKind {
  return KIND_BY_EXT[path.extname(filePath).toLowerCase()] ?? 'other'
}

function safeParse(v: unknown): string[] {
  if (typeof v !== 'string') return []
  try {
    const parsed = JSON.parse(v)
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

const rowToVault = (r: any): VaultFile => ({ ...r, tags: safeParse(r.tags) })

/** List the contents of one vault folder (parentId null = root). Folders first, then files. */
export function listVaultFiles(parentId: number | null = null): VaultFile[] {
  const where = parentId == null ? 'parent_id IS NULL' : 'parent_id = ?'
  const params = parentId == null ? [] : [parentId]
  const rows = db()
    .prepare(
      `SELECT * FROM vault_files WHERE ${where}
       ORDER BY (kind IN ('folder','diskfolder')) DESC, name COLLATE NOCASE ASC`
    )
    .all(...params) as any[]
  return rows.map(rowToVault)
}

/** Register files by absolute path (no copying — the vault is an index). Lands them in parentId. */
export function addVaultFiles(paths: string[], parentId: number | null = null): number {
  const existing = new Set(
    (db().prepare("SELECT path FROM vault_files WHERE kind NOT IN ('folder','diskfolder')").all() as Array<{ path: string }>).map((r) =>
      r.path.toLowerCase()
    )
  )
  const insert = db().prepare('INSERT INTO vault_files (name, path, size, kind, parent_id) VALUES (?, ?, ?, ?, ?)')
  let added = 0
  for (const p of paths) {
    if (existing.has(p.toLowerCase())) continue
    let stat: fs.Stats
    try {
      stat = fs.statSync(p)
    } catch {
      continue // unreadable / vanished
    }
    if (stat.isDirectory()) {
      added += addDiskFolders([p], parentId)
      continue
    }
    insert.run(path.basename(p), p, stat.size, kindFor(p), parentId)
    existing.add(p.toLowerCase())
    added++
  }
  return added
}

/** Add OS directories as live folder links (one row each, no recursive flattening). */
export function addDiskFolders(paths: string[], parentId: number | null = null): number {
  const insert = db().prepare("INSERT INTO vault_files (name, path, size, kind, parent_id) VALUES (?, ?, 0, 'diskfolder', ?)")
  const dupe = db().prepare("SELECT 1 FROM vault_files WHERE kind = 'diskfolder' AND lower(path) = ? AND (parent_id IS ? OR parent_id = ?)")
  let added = 0
  for (const p of paths) {
    try {
      if (!fs.statSync(p).isDirectory()) continue
    } catch {
      continue
    }
    if (dupe.get(p.toLowerCase(), parentId, parentId)) continue
    insert.run(path.basename(p) || p, p, parentId)
    added++
  }
  return added
}

/** Absolute paths of every live OS-folder link in the vault (for media re-sync). */
export function diskFolderPaths(): string[] {
  return (db().prepare("SELECT path FROM vault_files WHERE kind = 'diskfolder'").all() as Array<{ path: string }>).map(
    (r) => r.path
  )
}

/** Create a virtual folder inside parentId. */
export function createVaultFolder(name: string, parentId: number | null = null): VaultFile {
  const info = db()
    .prepare("INSERT INTO vault_files (name, path, size, kind, parent_id) VALUES (?, '', 0, 'folder', ?)")
    .run((name ?? '').trim() || 'New folder', parentId)
  return rowToVault(db().prepare('SELECT * FROM vault_files WHERE id = ?').get(Number(info.lastInsertRowid)))
}

export function renameVaultItem(id: number, name: string): void {
  const n = (name ?? '').trim()
  if (!n) return
  db().prepare('UPDATE vault_files SET name = ? WHERE id = ?').run(n, id)
}

/** Move an item into another folder (or root). Guards against cycles (self or descendant). */
export function moveVaultItem(id: number, parentId: number | null): void {
  if (id === parentId) return
  // walk the target's ancestor chain — refuse if `id` is anywhere above it
  const getParent = db().prepare('SELECT parent_id FROM vault_files WHERE id = ?')
  let cur: number | null = parentId
  while (cur != null) {
    if (cur === id) return // would create a cycle and orphan the subtree
    cur = (getParent.get(cur) as { parent_id: number | null } | undefined)?.parent_id ?? null
  }
  db().prepare('UPDATE vault_files SET parent_id = ? WHERE id = ?').run(parentId, id)
}

export function removeVaultFile(id: number): void {
  // children cascade via FK (only the index entries are removed — never the real files)
  db().prepare('DELETE FROM vault_files WHERE id = ?').run(id)
}

/** Live-read a real OS directory (used when opening a diskfolder). Capped for huge trees. */
export function browseDir(dir: string): VaultDiskEntry[] {
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }
  const out: VaultDiskEntry[] = []
  const MAX = 2000
  for (const e of entries) {
    if (out.length >= MAX) break
    if (e.name.startsWith('.')) continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      out.push({ name: e.name, path: p, isDir: true, size: 0, kind: 'other' })
    } else if (e.isFile()) {
      let size = 0
      try {
        size = fs.statSync(p).size
      } catch {
        /* keep 0 */
      }
      out.push({ name: e.name, path: p, isDir: false, size, kind: kindFor(p) })
    }
  }
  out.sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1))
  return out
}
