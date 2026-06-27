import { db, now } from './database'
import type { JournalEntry } from '../../src/types/models'

// Daily notes (Capacities-style) live in the `journal_entries` table (migration 003):
// one row per calendar day, keyed by `day` (a 'YYYY-MM-DD' string). The Calendar page
// upserts the day's note here; the month/week grids ask for a whole range at once.

function rowToEntry(row: any): JournalEntry {
  return {
    id: row.id,
    day: row.day,
    mood: row.mood ?? null,
    content: row.content ?? '',
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

/** The entry for a single day, or null if nothing has been written yet. */
export function getDay(day: string): JournalEntry | null {
  const row = db().prepare('SELECT * FROM journal_entries WHERE day = ?').get(day)
  return row ? rowToEntry(row) : null
}

/** Every entry whose day falls in [from, to] inclusive (ISO 'YYYY-MM-DD' strings),
 *  oldest first — feeds the month/week dot indicators. */
export function range(from: string, to: string): JournalEntry[] {
  const rows = db()
    .prepare('SELECT * FROM journal_entries WHERE day >= ? AND day <= ? ORDER BY day ASC')
    .all(from, to) as any[]
  return rows.map(rowToEntry)
}

/** Upsert the day's note. Only the fields present in `patch` are written; `updated_at`
 *  is always refreshed. A row is created on first save (the `day` UNIQUE constraint
 *  makes this idempotent). Returns the saved entry. */
export function saveDay(day: string, patch: { content?: string; mood?: number | null }): JournalEntry {
  const existing = getDay(day)
  if (!existing) {
    db()
      .prepare('INSERT INTO journal_entries (day, content, mood) VALUES (?, ?, ?)')
      .run(day, patch.content ?? '', patch.mood ?? null)
    return getDay(day)!
  }
  const sets: string[] = []
  const values: any[] = []
  if (patch.content !== undefined) {
    sets.push('content = ?')
    values.push(patch.content)
  }
  if (patch.mood !== undefined) {
    sets.push('mood = ?')
    values.push(patch.mood)
  }
  sets.push('updated_at = ?')
  values.push(now(), day)
  db().prepare(`UPDATE journal_entries SET ${sets.join(', ')} WHERE day = ?`).run(...values)
  return getDay(day)!
}
