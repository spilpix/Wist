import { useMemo } from 'react'
import type { HeatmapDay } from '../types/models'
import { formatDurationHuman } from '../utils/formatters'
import { useI18n, MONTHS_SHORT } from '../i18n'

const LEVEL_CLASSES = [
  'bg-raised',
  'bg-accent/25',
  'bg-accent/45',
  'bg-accent/70',
  'bg-accent',
]

function levelFor(seconds: number): number {
  if (seconds <= 0) return 0
  if (seconds < 30 * 60) return 1
  if (seconds < 60 * 60) return 2
  if (seconds < 2.5 * 60 * 60) return 3
  return 4
}

function dayKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** GitHub-style activity grid for the last 12 months. */
export default function Heatmap({ data }: { data: HeatmapDay[] }) {
  const { t, lang } = useI18n()
  const { weeks, monthLabels } = useMemo(() => {
    const MONTH_NAMES = MONTHS_SHORT[lang]
    const byDay = new Map(data.map((d) => [d.day, d.seconds]))
    const today = new Date()
    const start = new Date(today)
    start.setDate(start.getDate() - 364)
    start.setDate(start.getDate() - start.getDay()) // align to Sunday

    const weeks: Array<Array<{ key: string; seconds: number; future: boolean }>> = []
    const monthLabels: Array<{ index: number; label: string }> = []
    let cursor = new Date(start)
    let lastMonth = -1

    while (cursor <= today) {
      const week: Array<{ key: string; seconds: number; future: boolean }> = []
      for (let i = 0; i < 7; i++) {
        const key = dayKey(cursor)
        week.push({ key, seconds: byDay.get(key) ?? 0, future: cursor > today })
        cursor = new Date(cursor.getTime() + 86400000)
      }
      const firstDay = new Date(week[0].key + 'T12:00:00')
      if (firstDay.getMonth() !== lastMonth) {
        lastMonth = firstDay.getMonth()
        monthLabels.push({ index: weeks.length, label: MONTH_NAMES[lastMonth] })
      }
      weeks.push(week)
    }
    return { weeks, monthLabels: monthLabels.slice(1) }
  }, [data, lang])

  return (
    <div className="overflow-x-auto pb-1">
      <div className="inline-block">
        <div className="relative mb-1 h-4" style={{ width: weeks.length * 13 }}>
          {monthLabels.map((m) => (
            <span
              key={`${m.label}-${m.index}`}
              className="absolute text-[10px] text-zinc-600"
              style={{ left: m.index * 13 }}
            >
              {m.label}
            </span>
          ))}
        </div>
        <div className="flex gap-[3px]">
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-[3px]">
              {week.map((day) =>
                day.future ? (
                  <span key={day.key} className="h-[10px] w-[10px]" />
                ) : (
                  <span
                    key={day.key}
                    title={`${day.key} — ${day.seconds > 0 ? formatDurationHuman(day.seconds) : t('heat.noActivity')}`}
                    className={`h-[10px] w-[10px] rounded-sm ${LEVEL_CLASSES[levelFor(day.seconds)]}`}
                  />
                )
              )}
            </div>
          ))}
        </div>
        <div className="mt-2 flex items-center justify-end gap-1 text-[10px] text-zinc-600">
          {t('heat.less')}
          {LEVEL_CLASSES.map((c) => (
            <span key={c} className={`h-[10px] w-[10px] rounded-sm ${c}`} />
          ))}
          {t('heat.more')}
        </div>
      </div>
    </div>
  )
}
