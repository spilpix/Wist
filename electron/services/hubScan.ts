import fs from 'node:fs'
import path from 'node:path'
import * as projects from '../db/projects'
import * as projectSessions from '../db/projectSessions'

/**
 * Hub folder scanning + change-diffing. Extracted out of the IPC router so the
 * handlers stay thin (handle → service) and this filesystem-walking logic is unit-
 * reachable and reusable. A hub's linked folders are walked into a `path -> "<mtime>:<size>"`
 * fingerprint map; comparing two maps yields the added/removed/modified set shown
 * between work sessions.
 */

const CAP = 40000
const SKIP = new Set(['node_modules', '.git', '.cache', 'dist', 'build', '$RECYCLE.BIN'])

/** Walk a hub's linked folders/files → a fingerprint map (path → "<mtimeMs>:<size>"). */
export function scanHub(projectId: number): { files: Record<string, string>; scanned: number } {
  const assets = projects.listAssets(projectId)
  const scanned: Record<string, string> = {}
  const seen = new Set<string>()
  let count = 0
  const record = (full: string) => {
    try {
      const st = fs.statSync(full)
      scanned[full] = `${Math.round(st.mtimeMs)}:${st.size}`
      count++
    } catch {
      /* skip */
    }
  }
  const walk = (dir: string, depth: number) => {
    if (depth > 14 || count >= CAP) return
    let real: string
    try {
      real = fs.realpathSync.native(dir)
    } catch {
      real = dir
    }
    if (seen.has(real)) return
    seen.add(real)
    let ents: fs.Dirent[]
    try {
      ents = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const en of ents) {
      if (count >= CAP) break
      if (en.name.startsWith('.') || SKIP.has(en.name)) continue
      const full = path.join(dir, en.name)
      let isDir = en.isDirectory()
      if (!isDir && en.isSymbolicLink()) {
        try {
          isDir = fs.statSync(full).isDirectory()
        } catch {
          continue
        }
      }
      if (isDir) walk(full, depth + 1)
      else record(full)
    }
  }
  for (const a of assets) {
    if (!a.path) continue
    if (a.kind === 'folder') walk(a.path, 0)
    else if (a.kind === 'file' || a.kind === 'image') record(a.path)
  }
  return { files: scanned, scanned: count }
}

export interface HubChanges {
  added: string[]
  removed: string[]
  modified: string[]
  addedCount: number
  removedCount: number
  modifiedCount: number
  scanned: number
}

/** Diff a hub's current scan against its last saved snapshot. */
export function computeDiff(projectId: number): { files: Record<string, string>; changes: HubChanges } {
  const prev = projectSessions.getSnapshot(projectId)
  const { files: current, scanned } = scanHub(projectId)
  const hadSnapshot = Object.keys(prev).length > 0
  const added: string[] = []
  const removed: string[] = []
  const modified: string[] = []
  if (hadSnapshot) {
    for (const p of Object.keys(current)) {
      if (!(p in prev)) added.push(p)
      else if (prev[p] !== current[p]) modified.push(p)
    }
    for (const p of Object.keys(prev)) if (!(p in current)) removed.push(p)
  }
  const cap = (arr: string[]) => arr.slice(0, 1000)
  const changes: HubChanges = {
    added: cap(added),
    removed: cap(removed),
    modified: cap(modified),
    addedCount: added.length,
    removedCount: removed.length,
    modifiedCount: modified.length,
    scanned,
  }
  return { files: current, changes }
}
