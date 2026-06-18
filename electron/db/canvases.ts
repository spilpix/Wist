import { db, now } from './database'
import type { Canvas, CanvasData } from '../../src/types/models'

const EMPTY: CanvasData = { nodes: [], edges: [] }

function parse(v: unknown): CanvasData {
  if (typeof v !== 'string') return { ...EMPTY }
  try {
    const d = JSON.parse(v)
    const out: CanvasData = {
      nodes: Array.isArray(d?.nodes) ? d.nodes : [],
      edges: Array.isArray(d?.edges) ? d.edges : [],
    }
    // restore the saved camera (viewport) if present
    if (d?.viewport && typeof d.viewport === 'object') {
      const { x, y, k } = d.viewport
      if ([x, y, k].every((n) => typeof n === 'number' && isFinite(n))) out.viewport = { x, y, k }
    }
    // restore ruler guides if present
    if (Array.isArray(d?.guides)) {
      out.guides = d.guides.filter(
        (g: any) => g && (g.axis === 'h' || g.axis === 'v') && typeof g.pos === 'number' && isFinite(g.pos)
      )
    }
    return out
  } catch {
    return { ...EMPTY }
  }
}

const rowToCanvas = (r: any): Canvas => ({ ...r, data: parse(r.data) })

export function listCanvases(): Canvas[] {
  return (db().prepare('SELECT * FROM canvases ORDER BY updated_at DESC').all() as any[]).map(rowToCanvas)
}

export function getCanvas(id: number): Canvas | null {
  const row = db().prepare('SELECT * FROM canvases WHERE id = ?').get(id)
  return row ? rowToCanvas(row) : null
}

export function createCanvas(name: string): Canvas {
  const info = db()
    .prepare('INSERT INTO canvases (name) VALUES (?)')
    .run((name ?? '').trim() || 'Untitled canvas')
  return getCanvas(Number(info.lastInsertRowid))!
}

export function updateCanvas(id: number, patch: { name?: string; data?: CanvasData }): Canvas {
  const sets: string[] = []
  const values: any[] = []
  if (patch.name !== undefined) {
    sets.push('name = ?')
    values.push(patch.name)
  }
  if (patch.data !== undefined) {
    sets.push('data = ?')
    values.push(JSON.stringify(patch.data))
  }
  if (sets.length) {
    sets.push('updated_at = ?')
    values.push(now(), id)
    db().prepare(`UPDATE canvases SET ${sets.join(', ')} WHERE id = ?`).run(...values)
  }
  return getCanvas(id)!
}

export function deleteCanvas(id: number): void {
  db().prepare('DELETE FROM canvases WHERE id = ?').run(id)
}
