import { db } from './database'

// The universal relations layer. Every object in Bard is a NODE addressed by
// (type, id); every relationship is a directed EDGE `src --kind--> dst`. One table,
// one mechanism — containment, references and (later) tags all flow through here.

export type NodeType = 'task' | 'note' | 'project' | 'canvas' | 'vault' | 'tag'
export type EdgeKind = 'contains' | 'refers' | 'tagged'

export interface NodeRef {
  type: NodeType
  id: string | number
}

interface EdgeRow {
  id: number
  src_type: string
  src_id: string
  kind: string
  dst_type: string
  dst_id: string
  sort: number
  created_at: string
}

// a node resolved against its live source row, ready to render
export interface ResolvedNode {
  type: NodeType
  id: string
  label: string
  route: string | null
  cover: string | null
  missing?: boolean // the referenced row was deleted — show a tombstone, allow unlink
}

// one neighbour of a focus node + the edge that connects them
export interface RelatedEdge {
  edgeId: number
  kind: EdgeKind
  direction: 'in' | 'out' // out = focus points at node; in = node points at focus
  node: ResolvedNode
}

/**
 * Resolve a (type, id) pair to a displayable object by looking up its live source
 * row. Soft-deleted rows resolve to a `missing` tombstone so a stale edge never
 * crashes the UI and can still be unlinked.
 */
export function resolveNode(type: string, id: string): ResolvedNode {
  const base = { type: type as NodeType, id, route: null as string | null, cover: null as string | null }
  try {
    switch (type) {
      case 'task': {
        const r = db().prepare('SELECT title FROM tasks WHERE id=? AND deleted_at IS NULL').get(id) as { title: string } | undefined
        if (r) return { ...base, label: r.title || 'Без названия', route: '/tasks' }
        break
      }
      case 'note': {
        const r = db().prepare('SELECT title FROM notes WHERE id=? AND deleted_at IS NULL').get(id) as { title: string } | undefined
        if (r) return { ...base, label: r.title || 'Без названия', route: `/notes?open=${id}` }
        break
      }
      case 'project': {
        const r = db().prepare('SELECT name, cover_path FROM projects WHERE id=? AND deleted_at IS NULL').get(id) as
          | { name: string; cover_path: string | null }
          | undefined
        if (r) return { ...base, label: r.name || 'Без названия', route: `/project/${id}`, cover: r.cover_path }
        break
      }
      case 'canvas': {
        const r = db().prepare('SELECT name FROM canvases WHERE id=?').get(id) as { name: string } | undefined
        if (r) return { ...base, label: r.name || 'Без названия', route: `/canvas/${id}` }
        break
      }
      case 'vault': {
        const r = db().prepare('SELECT name FROM vault_files WHERE id=?').get(id) as { name: string } | undefined
        if (r) return { ...base, label: r.name || 'Файл', route: '/vault' }
        break
      }
      case 'tag':
        // tags are not backed by a source row — the id IS the tag slug. Always resolvable.
        return { ...base, label: `#${id}` }
    }
  } catch {
    /* source table/row gone — fall through to tombstone */
  }
  return { ...base, label: 'Удалённый объект', missing: true }
}

/** Create a directed edge `src --kind--> dst`. Idempotent (unique index dedups). */
export function link(src: NodeRef, kind: EdgeKind, dst: NodeRef): void {
  db()
    .prepare('INSERT OR IGNORE INTO edges (src_type, src_id, kind, dst_type, dst_id) VALUES (?, ?, ?, ?, ?)')
    .run(src.type, String(src.id), kind, dst.type, String(dst.id))
}

/** Remove a single edge by id. */
export function unlink(edgeId: number): void {
  db().prepare('DELETE FROM edges WHERE id=?').run(edgeId)
}

/**
 * Make `project:projectId --contains--> child` the child's ONE containment edge.
 * Drops any existing `contains` edge pointing at the child (from whatever project),
 * then re-adds it for the new parent (if any). Call this whenever a task/note's
 * `project_id` is created or changed so the edges layer stays in lockstep with the
 * column instead of drifting (migration 025 only backfilled the initial state).
 */
export function setContainer(child: NodeRef, projectId: number | null | undefined): void {
  db()
    .prepare("DELETE FROM edges WHERE kind='contains' AND src_type='project' AND dst_type=? AND dst_id=?")
    .run(child.type, String(child.id))
  if (projectId != null) link({ type: 'project', id: projectId }, 'contains', child)
}

/**
 * Drop every edge touching a node (either endpoint). Call on HARD delete / purge so a
 * removed object never leaves dangling edge rows behind (edges have no FKs to cascade).
 */
export function removeNode(node: NodeRef): void {
  db()
    .prepare('DELETE FROM edges WHERE (src_type=? AND src_id=?) OR (dst_type=? AND dst_id=?)')
    .run(node.type, String(node.id), node.type, String(node.id))
}

/**
 * Every object connected to (type, id) in either direction, resolved for display.
 * Optionally restrict to certain edge kinds. De-dupes a neighbour reached by the
 * same kind from both sides and drops self-loops.
 */
export function related(type: string, id: string, kinds?: EdgeKind[]): RelatedEdge[] {
  const kindSet = kinds && kinds.length ? new Set(kinds) : null
  const out = db().prepare('SELECT * FROM edges WHERE src_type=? AND src_id=?').all(type, String(id)) as EdgeRow[]
  const inc = db().prepare('SELECT * FROM edges WHERE dst_type=? AND dst_id=?').all(type, String(id)) as EdgeRow[]

  const result: RelatedEdge[] = []
  const seen = new Set<string>()
  const add = (e: EdgeRow, direction: 'in' | 'out', other: { type: string; id: string }) => {
    if (kindSet && !kindSet.has(e.kind as EdgeKind)) return
    if (other.type === type && other.id === String(id)) return // self-loop
    const key = `${other.type}:${other.id}:${e.kind}`
    if (seen.has(key)) return
    seen.add(key)
    result.push({ edgeId: e.id, kind: e.kind as EdgeKind, direction, node: resolveNode(other.type, other.id) })
  }
  for (const e of out) add(e, 'out', { type: e.dst_type, id: e.dst_id })
  for (const e of inc) add(e, 'in', { type: e.src_type, id: e.src_id })
  return result
}

/**
 * Search the knowledge objects (tasks / notes / hubs / canvases) by title for the
 * link picker. Empty query → the most recently touched of each. `exclude` drops the
 * focus node itself. Matching runs in JS (not SQL LIKE) so it's correctly
 * case-insensitive for Cyrillic — SQLite's LIKE/lower() only case-fold ASCII.
 */
export function search(query: string, exclude?: NodeRef, limit = 24): ResolvedNode[] {
  const term = query.trim().toLowerCase()
  const perType = term ? 8 : 6
  const isExcluded = (type: NodeType, id: string) => !!exclude && type === exclude.type && id === String(exclude.id)

  const pick = (rows: Array<{ id: number; title: string }>, type: NodeType): ResolvedNode[] => {
    const out: ResolvedNode[] = []
    for (const r of rows) {
      const id = String(r.id)
      if (isExcluded(type, id)) continue
      if (term && !(r.title || '').toLowerCase().includes(term)) continue
      const n = resolveNode(type, id)
      if (!n.missing) out.push(n)
      if (out.length >= perType) break
    }
    return out
  }

  // scan the recent slice of each table (plenty for a personal app), filter in JS
  // NB: tasks has no updated_at column — order by created_at (recency proxy)
  const tasks = db().prepare('SELECT id, title FROM tasks WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 120').all() as Array<{ id: number; title: string }>
  const notes = db().prepare('SELECT id, title FROM notes WHERE deleted_at IS NULL ORDER BY updated_at DESC LIMIT 120').all() as Array<{ id: number; title: string }>
  const projects = db().prepare('SELECT id, name AS title FROM projects WHERE deleted_at IS NULL ORDER BY updated_at DESC LIMIT 120').all() as Array<{ id: number; title: string }>
  const canvases = db().prepare('SELECT id, name AS title FROM canvases ORDER BY updated_at DESC LIMIT 120').all() as Array<{ id: number; title: string }>

  return [...pick(tasks, 'task'), ...pick(notes, 'note'), ...pick(projects, 'project'), ...pick(canvases, 'canvas')].slice(0, limit)
}

export interface RawEdge {
  id: number
  src_type: NodeType
  src_id: string
  kind: EdgeKind
  dst_type: NodeType
  dst_id: string
}

/** Returns every edge row (no resolution) — used by the graph to build the world. */
export function listAllRaw(): RawEdge[] {
  return db().prepare('SELECT id, src_type, src_id, kind, dst_type, dst_id FROM edges ORDER BY id').all() as RawEdge[]
}

// ── Note link sync (wikilinks + hashtags → edges) ────────────────────────────
//
// Notes author links as plain `[[Title]]` text and inline `#tags`. On every note
// write we parse those out and reconcile the note's `refers` (note→note) and
// `tagged` (note→tag) edges so the graph, backlinks and the Relations panel all
// reflect what the note actually links to. Edges are keyed by the TARGET row id
// (not its title), so renaming a target never breaks the link — resolveNode reads
// the live title. This is what turns notes into real graph citizens.

const WIKILINK_RE = /\[\[([^\]|\n]+)(?:\|[^\]\n]*)?\]\]/g
const HASHTAG_RE = /(?:^|\s)#([\p{L}\d][\p{L}\d_-]*)/gu

/** Distinct link target titles + tag slugs parsed from a note body. */
function parseNoteRefs(content: string): { titles: string[]; tags: string[] } {
  const titles = new Set<string>()
  for (const m of content.matchAll(WIKILINK_RE)) {
    const t = m[1].trim()
    if (t) titles.add(t)
  }
  const tags = new Set<string>()
  for (const m of content.matchAll(HASHTAG_RE)) {
    const t = m[1].trim().toLowerCase()
    if (t) tags.add(t)
  }
  return { titles: [...titles], tags: [...tags] }
}

/** lowercased trimmed note title → id. Freshest note wins on duplicate titles. */
function noteTitleIndex(): Map<string, number> {
  const rows = db()
    .prepare('SELECT id, title FROM notes WHERE deleted_at IS NULL ORDER BY updated_at DESC, id DESC')
    .all() as Array<{ id: number; title: string }>
  const map = new Map<string, number>()
  for (const r of rows) {
    const key = (r.title || '').trim().toLowerCase()
    if (key && !map.has(key)) map.set(key, r.id) // first seen = freshest (ORDER BY updated_at DESC)
  }
  return map
}

/**
 * Reconcile a note's outgoing `refers`/`tagged` edges to exactly match the links and
 * tags in its current body. Diffs against existing edges and writes only the delta —
 * no delete-all-reinsert — so the graph never churns on a hot 700ms autosave.
 */
export function syncNoteLinks(noteId: number, content: string, titleIx?: Map<string, number>): void {
  const src: NodeRef = { type: 'note', id: noteId }
  const { titles, tags } = parseNoteRefs(content)
  const ix = titleIx ?? noteTitleIndex()

  // desired set: key = `${kind}:${dst_type}:${dst_id}`
  const desired = new Set<string>()
  const desiredEdges: Array<{ kind: EdgeKind; dst: NodeRef }> = []
  for (const title of titles) {
    const tid = ix.get(title.toLowerCase())
    if (tid == null || tid === noteId) continue // unresolved target or self-link
    const key = `refers:note:${tid}`
    if (!desired.has(key)) {
      desired.add(key)
      desiredEdges.push({ kind: 'refers', dst: { type: 'note', id: tid } })
    }
  }
  for (const tag of tags) {
    const key = `tagged:tag:${tag}`
    if (!desired.has(key)) {
      desired.add(key)
      desiredEdges.push({ kind: 'tagged', dst: { type: 'tag', id: tag } })
    }
  }

  const existing = db()
    .prepare("SELECT id, kind, dst_type, dst_id FROM edges WHERE src_type='note' AND src_id=? AND kind IN ('refers','tagged')")
    .all(String(noteId)) as Array<{ id: number; kind: string; dst_type: string; dst_id: string }>

  const existingKeys = new Set<string>()
  for (const e of existing) {
    const key = `${e.kind}:${e.dst_type}:${e.dst_id}`
    existingKeys.add(key)
    if (!desired.has(key)) unlink(e.id) // removed from the body → drop the edge
  }
  for (const d of desiredEdges) {
    const key = `${d.kind}:${d.dst.type}:${d.dst.id}`
    if (!existingKeys.has(key)) link(src, d.kind, d.dst) // new in the body → add the edge
  }
}

/**
 * When a note is created, other notes may already link to its title via [[Title]]
 * but couldn't form an edge (the target didn't exist yet). Scan existing notes and
 * add the missing inbound `refers` edges so the link resolves without re-saving.
 */
export function reconcileInbound(noteId: number, title: string): void {
  const target = (title || '').trim().toLowerCase()
  if (!target) return
  const rows = db()
    .prepare('SELECT id, content FROM notes WHERE deleted_at IS NULL AND id != ?')
    .all(noteId) as Array<{ id: number; content: string }>
  const dst: NodeRef = { type: 'note', id: noteId }
  for (const r of rows) {
    for (const m of (r.content || '').matchAll(WIKILINK_RE)) {
      if (m[1].trim().toLowerCase() === target) {
        link({ type: 'note', id: r.id }, 'refers', dst) // INSERT OR IGNORE — idempotent
        break
      }
    }
  }
}

/**
 * One-time backfill: parse every existing note body into `refers`/`tagged` edges.
 * Runs only when no note-sourced `refers` edge exists yet — a cheap gate that needs
 * no migration or sentinel table (edge writes are idempotent). Mirrors migration
 * 025's `contains` backfill so pre-existing links feed the graph from first launch.
 */
export function backfillNoteLinkEdges(): void {
  if (db().prepare("SELECT 1 FROM edges WHERE kind='refers' AND src_type='note' LIMIT 1").get()) return
  const notes = db().prepare('SELECT id, content FROM notes WHERE deleted_at IS NULL').all() as Array<{ id: number; content: string }>
  if (!notes.length) return
  const ix = noteTitleIndex() // build once, reuse across all notes
  db().transaction(() => {
    for (const n of notes) syncNoteLinks(n.id, n.content || '', ix)
  })()
}

// ── Canvas card sync (board note/task cards → edges) ─────────────────────────
//
// A canvas board can hold note/task cards (CanvasNode.noteId / .taskId). We mirror
// those into universal `canvas --refers--> {note,task}` edges so a board is a real
// graph citizen — its cards show as backlinks and the canvas appears wired in the
// knowledge graph. Same diff-reconcile shape as syncNoteLinks (delta only, no churn).

interface CanvasCardData {
  nodes?: Array<{ noteId?: number | null; taskId?: number | null }>
}

/** Reconcile a canvas's outgoing `refers` edges to match the note/task cards on it. */
export function syncCanvasCards(canvasId: number, data: CanvasCardData | null | undefined): void {
  const src: NodeRef = { type: 'canvas', id: canvasId }
  const nodes = data && Array.isArray(data.nodes) ? data.nodes : []

  const desired = new Set<string>()
  const desiredEdges: NodeRef[] = []
  for (const n of nodes) {
    if (n.noteId != null) {
      const k = `note:${n.noteId}`
      if (!desired.has(k)) (desired.add(k), desiredEdges.push({ type: 'note', id: n.noteId }))
    }
    if (n.taskId != null) {
      const k = `task:${n.taskId}`
      if (!desired.has(k)) (desired.add(k), desiredEdges.push({ type: 'task', id: n.taskId }))
    }
  }

  const existing = db()
    .prepare("SELECT id, dst_type, dst_id FROM edges WHERE src_type='canvas' AND src_id=? AND kind='refers'")
    .all(String(canvasId)) as Array<{ id: number; dst_type: string; dst_id: string }>

  const existingKeys = new Set<string>()
  for (const e of existing) {
    const k = `${e.dst_type}:${e.dst_id}`
    existingKeys.add(k)
    if (!desired.has(k)) unlink(e.id) // card removed from the board → drop the edge
  }
  for (const dst of desiredEdges) {
    if (!existingKeys.has(`${dst.type}:${dst.id}`)) link(src, 'refers', dst)
  }
}

/** One-time backfill of canvas card edges (idempotent gate, mirrors note backfill). */
export function backfillCanvasCardEdges(): void {
  if (db().prepare("SELECT 1 FROM edges WHERE kind='refers' AND src_type='canvas' LIMIT 1").get()) return
  const rows = db().prepare('SELECT id, data FROM canvases').all() as Array<{ id: number; data: string }>
  if (!rows.length) return
  db().transaction(() => {
    for (const r of rows) {
      let data: CanvasCardData | null = null
      try {
        data = r.data ? JSON.parse(r.data) : null
      } catch {
        data = null
      }
      syncCanvasCards(r.id, data)
    }
  })()
}
