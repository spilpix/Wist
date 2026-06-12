import { db, now } from './database'
import type { JournalEntry } from '../../src/types/models'

export function listEntries(limit = 90): JournalEntry[] {
  return db()
    .prepare('SELECT * FROM journal_entries ORDER BY day DESC LIMIT ?')
    .all(limit) as JournalEntry[]
}

export function getEntry(day: string): JournalEntry | null {
  return (db().prepare('SELECT * FROM journal_entries WHERE day = ?').get(day) as JournalEntry) ?? null
}

export function upsertEntry(day: string, patch: { mood?: number | null; content?: string }): JournalEntry {
  const existing = getEntry(day)
  if (existing) {
    db()
      .prepare('UPDATE journal_entries SET mood = COALESCE(?, mood), content = COALESCE(?, content), updated_at = ? WHERE day = ?')
      .run(patch.mood ?? null, patch.content ?? null, now(), day)
  } else {
    db()
      .prepare('INSERT INTO journal_entries (day, mood, content) VALUES (?, ?, ?)')
      .run(day, patch.mood ?? null, patch.content ?? '')
  }
  return getEntry(day)!
}

/** Append a paragraph (used by the agent API) without clobbering existing text. */
export function appendToEntry(day: string, text: string, mood?: number | null): JournalEntry {
  const existing = getEntry(day)
  const content = existing?.content ? `${existing.content}\n\n${text}` : text
  return upsertEntry(day, { content, mood: mood ?? existing?.mood ?? null })
}

export function deleteEntry(day: string): void {
  db().prepare('DELETE FROM journal_entries WHERE day = ?').run(day)
}

/** consecutive days with entries, counting back from today (or yesterday) */
export function streak(): number {
  const days = new Set(
    (db().prepare('SELECT day FROM journal_entries').all() as Array<{ day: string }>).map((r) => r.day)
  )
  const p = (n: number) => String(n).padStart(2, '0')
  const key = (d: Date) => `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
  const cursor = new Date()
  if (!days.has(key(cursor))) cursor.setDate(cursor.getDate() - 1) // today not written yet still counts
  let n = 0
  while (days.has(key(cursor))) {
    n++
    cursor.setDate(cursor.getDate() - 1)
  }
  return n
}
