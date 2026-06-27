import { db } from './database'
import type { ObjectType, PropField } from '../../src/types/models'

function safeFields(v: unknown): PropField[] {
  if (typeof v !== 'string') return []
  try {
    const p = JSON.parse(v)
    return Array.isArray(p) ? p : []
  } catch {
    return []
  }
}
const rowToType = (row: any): ObjectType => ({ ...row, fields: safeFields(row.fields) })

export function listObjectTypes(): ObjectType[] {
  return (db().prepare('SELECT * FROM object_types ORDER BY name ASC').all() as any[]).map(rowToType)
}

export function getObjectType(id: number): ObjectType | null {
  const row = db().prepare('SELECT * FROM object_types WHERE id = ?').get(id)
  return row ? rowToType(row) : null
}

export function createObjectType(data: Partial<ObjectType>): ObjectType {
  const info = db()
    .prepare('INSERT INTO object_types (name, icon, hue, fields) VALUES (?, ?, ?, ?)')
    .run(
      (data.name ?? '').trim() || 'Тип',
      typeof data.icon === 'string' && data.icon ? data.icon : 'Box',
      typeof data.hue === 'string' && data.hue ? data.hue : 'slate',
      JSON.stringify(Array.isArray(data.fields) ? data.fields : [])
    )
  return getObjectType(Number(info.lastInsertRowid))!
}

export function updateObjectType(id: number, patch: Partial<ObjectType>): ObjectType {
  const sets: string[] = []
  const values: any[] = []
  for (const key of ['name', 'icon', 'hue'] as const) {
    if (patch[key] === undefined) continue
    sets.push(`${key} = ?`)
    values.push(patch[key])
  }
  if (patch.fields !== undefined) {
    sets.push('fields = ?')
    values.push(JSON.stringify(Array.isArray(patch.fields) ? patch.fields : []))
  }
  if (sets.length) {
    values.push(id)
    db().prepare(`UPDATE object_types SET ${sets.join(', ')} WHERE id = ?`).run(...values)
  }
  return getObjectType(id)!
}

export function deleteObjectType(id: number): void {
  db().prepare('DELETE FROM object_types WHERE id = ?').run(id)
}
