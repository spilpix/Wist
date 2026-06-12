import { db, now } from './database'
import type { Title, TitleFilters } from '../../src/types/models'

const DERIVED = `
  (SELECT COUNT(*) FROM episodes e WHERE e.title_id = t.id) AS episode_count,
  (SELECT COUNT(*) FROM episodes e WHERE e.title_id = t.id AND e.watched = 1) AS watched_count,
  (SELECT MAX(e.watch_date) FROM episodes e WHERE e.title_id = t.id) AS last_watched
`

function rowToTitle(row: any): Title {
  return {
    ...row,
    genres: safeParse(row.genres),
    tags: safeParse(row.tags),
  }
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

export function listTitles(filters: TitleFilters = {}): Title[] {
  const where: string[] = []
  const params: any[] = []

  if (filters.search) {
    where.push('(t.title LIKE ? OR t.original_title LIKE ?)')
    const q = `%${filters.search}%`
    params.push(q, q)
  }
  if (filters.type && filters.type !== 'all') {
    where.push('t.type = ?')
    params.push(filters.type)
  }
  if (filters.status && filters.status !== 'all') {
    where.push('t.status = ?')
    params.push(filters.status)
  }
  if (filters.genre) {
    where.push('t.genres LIKE ?')
    params.push(`%${JSON.stringify(filters.genre)}%`)
  }
  if (filters.year) {
    where.push('t.year = ?')
    params.push(filters.year)
  }
  if (filters.minRating) {
    where.push('t.rating >= ?')
    params.push(filters.minRating)
  }

  const dir = filters.sortDir === 'asc' ? 'ASC' : 'DESC'
  let orderBy: string
  switch (filters.sort) {
    case 'title':
      orderBy = `t.title COLLATE NOCASE ${dir === 'DESC' && filters.sortDir ? 'DESC' : 'ASC'}`
      break
    case 'rating':
      orderBy = `t.rating IS NULL, t.rating ${dir}`
      break
    case 'progress':
      orderBy = `CAST(watched_count AS REAL) / NULLIF(t.total_episodes, 0) ${dir}`
      break
    case 'last_watched':
      orderBy = `last_watched IS NULL, last_watched ${dir}`
      break
    case 'date_added':
    default:
      orderBy = `t.date_added ${dir}`
  }

  const sql = `
    SELECT t.*, ${DERIVED}
    FROM titles t
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY ${orderBy}
  `
  return (db().prepare(sql).all(...params) as any[]).map(rowToTitle)
}

export function getTitle(id: number): Title | null {
  const row = db().prepare(`SELECT t.*, ${DERIVED} FROM titles t WHERE t.id = ?`).get(id)
  return row ? rowToTitle(row) : null
}

const WRITABLE = [
  'title', 'original_title', 'type', 'status', 'rating', 'cover_path', 'total_episodes',
  'reading_progress', 'year', 'genres', 'tags', 'notes', 'intro_end_seconds', 'date_started', 'date_finished',
] as const

function normalizeValue(key: string, value: any): any {
  if (key === 'genres' || key === 'tags') return JSON.stringify(Array.isArray(value) ? value : [])
  if (value === undefined) return null
  return value
}

export function createTitle(data: Partial<Title>): Title {
  const cols: string[] = ['title']
  const values: any[] = [data.title ?? 'Untitled']
  for (const key of WRITABLE) {
    if (key === 'title' || data[key] === undefined) continue
    cols.push(key)
    values.push(normalizeValue(key, data[key]))
  }
  const placeholders = cols.map(() => '?').join(', ')
  const info = db().prepare(`INSERT INTO titles (${cols.join(', ')}) VALUES (${placeholders})`).run(...values)
  return getTitle(Number(info.lastInsertRowid))!
}

export function updateTitle(id: number, patch: Partial<Title>): Title {
  const sets: string[] = []
  const values: any[] = []
  for (const key of WRITABLE) {
    if (patch[key] === undefined) continue
    sets.push(`${key} = ?`)
    values.push(normalizeValue(key, patch[key]))
  }
  // auto-fill lifecycle dates on status changes
  if (patch.status === 'completed' && patch.date_finished === undefined) {
    const current = getTitle(id)
    if (current && !current.date_finished) {
      sets.push('date_finished = ?')
      values.push(now())
    }
  }
  if (patch.status === 'watching' && patch.date_started === undefined) {
    const current = getTitle(id)
    if (current && !current.date_started) {
      sets.push('date_started = ?')
      values.push(now())
    }
  }
  if (sets.length) {
    values.push(id)
    db().prepare(`UPDATE titles SET ${sets.join(', ')} WHERE id = ?`).run(...values)
  }
  return getTitle(id)!
}

export function deleteTitle(id: number): void {
  db().prepare('DELETE FROM titles WHERE id = ?').run(id)
}

export function setIntroEnd(id: number, seconds: number | null): void {
  db().prepare('UPDATE titles SET intro_end_seconds = ? WHERE id = ?').run(seconds, id)
}

export function distinctGenres(): string[] {
  const rows = db().prepare('SELECT genres FROM titles').all() as Array<{ genres: string }>
  const set = new Set<string>()
  for (const row of rows) for (const g of safeParse(row.genres)) set.add(g)
  return [...set].sort((a, b) => a.localeCompare(b))
}

export function distinctYears(): number[] {
  const rows = db().prepare('SELECT DISTINCT year FROM titles WHERE year IS NOT NULL ORDER BY year DESC').all() as Array<{ year: number }>
  return rows.map((r) => r.year)
}
