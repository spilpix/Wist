import { db } from './database'
import { listTitles } from './titles'
import type { HeatmapDay, MonthBar, StatsSummary, Title, TypeSlice } from '../../src/types/models'

export function heatmap(): HeatmapDay[] {
  return db()
    .prepare(`
      SELECT date(started_at) AS day, SUM(duration_seconds) AS seconds
      FROM watch_sessions
      WHERE started_at >= date('now', 'localtime', '-366 days')
      GROUP BY day
      ORDER BY day
    `)
    .all() as HeatmapDay[]
}

function allActivityDays(): string[] {
  const rows = db()
    .prepare(`SELECT DISTINCT date(started_at) AS day FROM watch_sessions WHERE duration_seconds > 0 ORDER BY day`)
    .all() as Array<{ day: string }>
  return rows.map((r) => r.day)
}

export function computeStreaks(): { current: number; longest: number } {
  const days = allActivityDays()
  if (!days.length) return { current: 0, longest: 0 }

  const daySet = new Set(days)
  let longest = 1
  let run = 1
  for (let i = 1; i < days.length; i++) {
    if (dayDiff(days[i - 1], days[i]) === 1) {
      run++
      longest = Math.max(longest, run)
    } else {
      run = 1
    }
  }

  // current streak: walk back from today (or yesterday if nothing today)
  const today = localDay(new Date())
  const yesterday = localDay(new Date(Date.now() - 86400000))
  let cursor: string | null = daySet.has(today) ? today : daySet.has(yesterday) ? yesterday : null
  let current = 0
  while (cursor && daySet.has(cursor)) {
    current++
    cursor = localDay(new Date(new Date(cursor + 'T12:00:00').getTime() - 86400000))
  }
  return { current, longest }
}

function localDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function dayDiff(a: string, b: string): number {
  return Math.round((new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 86400000)
}

export function summary(): StatsSummary {
  const row = db()
    .prepare(`
      SELECT
        (SELECT COUNT(*) FROM titles) AS titles,
        (SELECT COUNT(*) FROM episodes WHERE watched = 1) AS episodesWatched,
        (SELECT COALESCE(SUM(duration_seconds), 0) FROM watch_sessions) AS secondsWatched,
        (SELECT COUNT(DISTINCT date(started_at)) FROM watch_sessions WHERE duration_seconds > 0) AS daysWithActivity,
        (SELECT COUNT(*) FROM moments) AS moments
    `)
    .get() as Omit<StatsSummary, 'currentStreak' | 'longestStreak'>
  const streaks = computeStreaks()
  return { ...row, currentStreak: streaks.current, longestStreak: streaks.longest }
}

export function byType(): TypeSlice[] {
  return db()
    .prepare(`
      SELECT t.type AS type, COUNT(DISTINCT t.id) AS count, COALESCE(SUM(ws.total), 0) AS seconds
      FROM titles t
      LEFT JOIN (SELECT title_id, SUM(duration_seconds) AS total FROM watch_sessions GROUP BY title_id) ws
        ON ws.title_id = t.id
      GROUP BY t.type
      ORDER BY count DESC
    `)
    .all() as TypeSlice[]
}

export function monthly(): MonthBar[] {
  return db()
    .prepare(`
      SELECT strftime('%Y-%m', started_at) AS month, SUM(duration_seconds) AS seconds
      FROM watch_sessions
      WHERE started_at >= date('now', 'localtime', '-12 months')
      GROUP BY month
      ORDER BY month
    `)
    .all() as MonthBar[]
}

export function topRated(): Title[] {
  return listTitles({ sort: 'rating', sortDir: 'desc' })
    .filter((t) => t.rating != null)
    .slice(0, 10)
}

export function recentlyAdded(): Title[] {
  return listTitles({ sort: 'date_added', sortDir: 'desc' }).slice(0, 12)
}
