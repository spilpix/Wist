import { db } from './database'
import type { MemoryEvent } from '../../src/types/models'

/** Everything remembered in the last 12 months — leaves of the memory tree. */
export function memories(): MemoryEvent[] {
  const since = new Date()
  since.setDate(since.getDate() - 365)
  const p = (n: number) => String(n).padStart(2, '0')
  const cutoff = `${since.getFullYear()}-${p(since.getMonth() + 1)}-${p(since.getDate())} 00:00:00`

  const events: MemoryEvent[] = []

  const moments = db()
    .prepare(
      `SELECT m.id, m.created_at AS date, t.title AS label, COALESCE(NULLIF(m.note, ''), m.tag) AS sublabel, m.title_id
       FROM moments m JOIN titles t ON t.id = m.title_id
       WHERE m.created_at >= ?`
    )
    .all(cutoff) as any[]
  for (const m of moments) {
    events.push({ key: `m${m.id}`, kind: 'moment', date: m.date, label: m.label, sublabel: m.sublabel, ref_id: m.title_id })
  }

  const finished = db()
    .prepare(`SELECT id, date_finished AS date, title AS label, type FROM titles WHERE date_finished IS NOT NULL AND date_finished >= ?`)
    .all(cutoff) as any[]
  for (const t of finished) {
    events.push({ key: `t${t.id}`, kind: t.type === 'book' ? 'book' : 'title', date: t.date, label: t.label, sublabel: null, ref_id: t.id })
  }

  const notes = db()
    .prepare(
      `SELECT id, created_at AS date,
              CASE WHEN title <> '' THEN title ELSE substr(content, 1, 60) END AS label
       FROM notes WHERE created_at >= ?`
    )
    .all(cutoff) as any[]
  for (const n of notes) {
    events.push({ key: `n${n.id}`, kind: 'note', date: n.date, label: n.label, sublabel: null, ref_id: n.id })
  }

  const journal = db()
    .prepare(`SELECT id, day, substr(content, 1, 60) AS label FROM journal_entries WHERE day >= ? AND content <> ''`)
    .all(cutoff.slice(0, 10)) as any[]
  for (const j of journal) {
    events.push({ key: `j${j.id}`, kind: 'journal', date: `${j.day} 12:00:00`, label: j.day, sublabel: j.label, ref_id: j.id })
  }

  return events.sort((a, b) => a.date.localeCompare(b.date))
}
