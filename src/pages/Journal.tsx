import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Flame } from 'lucide-react'
import Spinner from '../components/ui/Spinner'
import type { JournalEntry } from '../types/models'
import { useI18n, DATE_LOCALE, MONTHS_SHORT } from '../i18n'

const MOODS = ['😞', '😐', '🙂', '😄', '🤩'] // values 1..5

function dayKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export default function Journal() {
  const { t, lang } = useI18n()
  const todayKey = dayKey(new Date())
  const [entries, setEntries] = useState<Map<string, JournalEntry> | null>(null)
  const [selected, setSelected] = useState(todayKey)
  const [content, setContent] = useState('')
  const [mood, setMood] = useState<number | null>(null)
  const [streak, setStreak] = useState(0)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dirty = useRef(false)

  const load = useCallback(async () => {
    try {
      const [list, st] = await Promise.all([window.wist.journal.list(), window.wist.journal.streak()])
      setEntries(new Map(list.map((e) => [e.day, e])))
      setStreak(st)
    } catch (e) {
      console.error('journal load failed', e)
      setEntries((prev) => prev ?? new Map())
    }
  }, [])

  useEffect(() => {
    load()
    return window.wist.events.onDataChanged((kind) => {
      if (kind === 'journal') load()
    })
  }, [load])

  // hydrate editor when the selected day or data changes (unless user is mid-edit)
  useEffect(() => {
    if (!entries || dirty.current) return
    const e = entries.get(selected)
    setContent(e?.content ?? '')
    setMood(e?.mood ?? null)
  }, [entries, selected])

  const saveNow = useCallback(
    async (day: string, value: string, moodValue: number | null) => {
      setSaveState('saving')
      await window.wist.journal.upsert(day, { content: value, mood: moodValue })
      dirty.current = false
      setSaveState('saved')
      const [list, st] = await Promise.all([window.wist.journal.list(), window.wist.journal.streak()])
      setEntries(new Map(list.map((e) => [e.day, e])))
      setStreak(st)
    },
    []
  )

  const scheduleSave = (day: string, value: string, moodValue: number | null) => {
    dirty.current = true
    setSaveState('saving')
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => saveNow(day, value, moodValue), 700)
  }

  const selectDay = (day: string) => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
      if (dirty.current) saveNow(selected, content, mood)
    }
    dirty.current = false
    setSelected(day)
    const e = entries?.get(day)
    setContent(e?.content ?? '')
    setMood(e?.mood ?? null)
    setSaveState('idle')
  }

  // strip of the last 30 days
  const days = useMemo(() => {
    const out: Array<{ key: string; date: Date }> = []
    const cursor = new Date()
    for (let i = 0; i < 30; i++) {
      out.push({ key: dayKey(cursor), date: new Date(cursor) })
      cursor.setDate(cursor.getDate() - 1)
    }
    return out
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (!entries) return <Spinner />

  const selectedDate = new Date(`${selected}T12:00:00`)
  const heading = selectedDate.toLocaleDateString(DATE_LOCALE[lang], {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  return (
    <div className="page max-w-4xl">
      <div className="mb-6 flex items-baseline justify-between">
        <h1 className="page-title !mb-0">{t('nav.journal')}</h1>
        {streak > 0 && (
          <span className="flex items-center gap-1.5 text-sm text-zinc-400">
            <Flame size={15} className="text-amber-500" />
            {t('journal.streak', { n: streak })}
          </span>
        )}
      </div>

      {/* day strip */}
      <div className="no-scrollbar mb-6 flex gap-1.5 overflow-x-auto pb-1">
        {days.map(({ key, date }) => {
          const entry = entries.get(key)
          const active = key === selected
          return (
            <button
              key={key}
              onClick={() => selectDay(key)}
              className={`flex w-12 shrink-0 flex-col items-center rounded-xl border px-1 py-2 transition-colors ${
                active
                  ? 'border-accent bg-accent/15 text-accent-bright'
                  : 'border-edge/60 bg-surface text-zinc-500 hover:bg-raised'
              }`}
            >
              <span className="text-[10px] uppercase">{MONTHS_SHORT[lang][date.getMonth()]}</span>
              <span className={`text-base font-semibold ${active ? '' : 'text-zinc-300'}`}>{date.getDate()}</span>
              <span className="mt-0.5 h-1.5 w-1.5 rounded-full" style={{ backgroundColor: entry?.content ? 'var(--accent)' : 'transparent' }} />
            </button>
          )
        })}
      </div>

      <div className="card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold capitalize text-white">{heading}</h2>
          <span className="text-xs text-zinc-600">
            {saveState === 'saving' ? t('journal.saving') : saveState === 'saved' ? t('journal.saved') : ''}
          </span>
        </div>

        {/* mood */}
        <div className="mb-4 flex items-center gap-2">
          <span className="mr-1 text-xs text-zinc-500">{t('journal.mood')}</span>
          {MOODS.map((emoji, i) => {
            const value = i + 1
            const active = mood === value
            return (
              <button
                key={value}
                onClick={() => {
                  const next = active ? null : value
                  setMood(next)
                  scheduleSave(selected, content, next)
                }}
                className={`rounded-lg px-1.5 py-1 text-lg transition-all ${
                  active ? 'scale-125 bg-accent/15' : 'opacity-50 grayscale hover:opacity-100 hover:grayscale-0'
                }`}
              >
                {emoji}
              </button>
            )
          })}
        </div>

        <textarea
          className="min-h-[320px] w-full resize-none bg-transparent text-[15px] leading-relaxed text-zinc-200 outline-none placeholder:text-zinc-600"
          placeholder={t('journal.placeholder')}
          value={content}
          onChange={(e) => {
            setContent(e.target.value)
            scheduleSave(selected, e.target.value, mood)
          }}
        />
      </div>
    </div>
  )
}
