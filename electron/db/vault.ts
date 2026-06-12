import path from 'node:path'
import fs from 'node:fs'
import { db } from './database'
import type { VaultFile } from '../../src/types/models'

const KIND_BY_EXT: Record<string, VaultFile['kind']> = {
  '.jpg': 'image', '.jpeg': 'image', '.png': 'image', '.webp': 'image', '.gif': 'image', '.svg': 'image',
  '.mp4': 'video', '.mkv': 'video', '.avi': 'video', '.mov': 'video', '.webm': 'video',
  '.mp3': 'audio', '.flac': 'audio', '.wav': 'audio', '.m4a': 'audio', '.ogg': 'audio',
  '.pdf': 'doc', '.doc': 'doc', '.docx': 'doc', '.txt': 'doc', '.md': 'doc',
  '.xls': 'doc', '.xlsx': 'doc', '.ppt': 'doc', '.pptx': 'doc', '.csv': 'doc',
  '.zip': 'archive', '.rar': 'archive', '.7z': 'archive', '.tar': 'archive', '.gz': 'archive',
}

export function kindFor(filePath: string): VaultFile['kind'] {
  return KIND_BY_EXT[path.extname(filePath).toLowerCase()] ?? 'other'
}

export function listVaultFiles(): VaultFile[] {
  const rows = db().prepare('SELECT * FROM vault_files ORDER BY created_at DESC').all() as any[]
  return rows.map((r) => ({ ...r, tags: safeParse(r.tags) }))
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

/** Register files by absolute path (no copying — the vault is an index, files stay where they are). */
export function addVaultFiles(paths: string[]): number {
  const existing = new Set(
    (db().prepare('SELECT path FROM vault_files').all() as Array<{ path: string }>).map((r) => r.path.toLowerCase())
  )
  const insert = db().prepare('INSERT INTO vault_files (name, path, size, kind) VALUES (?, ?, ?, ?)')
  let added = 0
  for (const p of paths) {
    if (existing.has(p.toLowerCase())) continue
    let size = 0
    try {
      size = fs.statSync(p).size
    } catch {
      continue // unreadable / vanished
    }
    insert.run(path.basename(p), p, size, kindFor(p))
    added++
  }
  return added
}

export function removeVaultFile(id: number): void {
  db().prepare('DELETE FROM vault_files WHERE id = ?').run(id)
}
