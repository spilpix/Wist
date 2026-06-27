// Small, dependency-free date helpers for the Calendar page. Everything works in LOCAL
// time and represents a calendar day as an ISO 'YYYY-MM-DD' string (the key used by the
// journal_entries table). Weeks are Monday-first (ru/most-of-the-world convention).

/** Local 'YYYY-MM-DD' for a Date (NOT toISOString — that shifts by timezone). */
export function isoDay(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Parse a 'YYYY-MM-DD' string into a Date at local midnight. Invalid input → today. */
export function parseDay(iso: string | null | undefined): Date {
  if (iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  }
  const t = new Date()
  return new Date(t.getFullYear(), t.getMonth(), t.getDate())
}

/** A fresh Date at local midnight today. */
export function today(): Date {
  const t = new Date()
  return new Date(t.getFullYear(), t.getMonth(), t.getDate())
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
}

export function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1)
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

export function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0)
}

/** Monday of the week containing d (Monday-first). */
export function startOfWeek(d: Date): Date {
  const dow = (d.getDay() + 6) % 7 // 0 = Monday … 6 = Sunday
  return addDays(d, -dow)
}

export function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

export function isToday(d: Date): boolean {
  return sameDay(d, new Date())
}

/** The 7 days of the week containing d (Monday → Sunday). */
export function weekDays(d: Date): Date[] {
  const start = startOfWeek(d)
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

/** A 6×7 grid (42 days) covering the month of d, Monday-first, including the leading/
 *  trailing days from the neighbouring months — the classic month calendar shape. */
export function monthGrid(d: Date): Date[] {
  const first = startOfMonth(d)
  const gridStart = startOfWeek(first)
  return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))
}

/** ISO-8601 week number (1..53) of the week containing d. */
export function isoWeek(d: Date): number {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  // Thursday of this week decides the year/week (ISO rule)
  const dayNr = (date.getDay() + 6) % 7
  date.setDate(date.getDate() - dayNr + 3)
  const firstThursday = new Date(date.getFullYear(), 0, 4)
  const firstDayNr = (firstThursday.getDay() + 6) % 7
  firstThursday.setDate(firstThursday.getDate() - firstDayNr + 3)
  return 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000))
}
