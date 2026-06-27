// Shared date helpers (kept tiny + dependency-free).

/** Whole days until a YYYY-MM-DD deadline, relative to today (negative = overdue). */
export function daysUntil(d: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(`${d}T00:00:00`)
  return Math.round((due.getTime() - today.getTime()) / 86_400_000)
}

/**
 * Compact "time ago" label for a 'YYYY-MM-DD HH:MM:SS' (localtime) stamp, e.g.
 * "2 ч", "вчера", "3 дн". `t` is the i18n translator (loosely typed so callers
 * can pass the keyed `t` without a contravariance error).
 */
export function timeAgo(iso: string | null | undefined, t: (key: any) => string): string {
  if (!iso) return ''
  const then = new Date(iso.replace(' ', 'T')).getTime()
  if (Number.isNaN(then)) return ''
  const sec = Math.max(0, Math.round((Date.now() - then) / 1000))
  if (sec < 45) return t('time.now')
  const min = Math.floor(sec / 60)
  if (min < 60) return `${Math.max(1, min)} ${t('time.minShort')}`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} ${t('time.hourShort')}`
  const day = Math.floor(hr / 24)
  if (day === 1) return t('hub.yesterday')
  if (day < 7) return `${day} ${t('time.dayShort')}`
  const wk = Math.floor(day / 7)
  if (wk < 5) return `${wk} ${t('time.weekShort')}`
  const mo = Math.floor(day / 30)
  if (mo < 12) return `${Math.max(1, mo)} ${t('time.monthShort')}`
  return `${Math.max(1, Math.floor(day / 365))} ${t('time.yearShort')}`
}
