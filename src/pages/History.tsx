import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { History as HistoryIcon, Trash2 } from 'lucide-react'
import EmptyState from '../components/ui/EmptyState'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import { useHistoryStore, type HistoryEntry } from '../store/historyStore'
import { useTabStore } from '../store/tabStore'
import { routeMeta } from '../lib/routeMeta'
import { useI18n, DATE_LOCALE } from '../i18n'

function dayKey(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

export default function History() {
  const { t, lang } = useI18n()
  const navigate = useNavigate()
  const entries = useHistoryStore((s) => s.entries)
  const clear = useHistoryStore((s) => s.clear)
  const closeOthers = useTabStore((s) => s.closeOthers)
  const [confirming, setConfirming] = useState(false)

  const clearAll = () => {
    clear()
    closeOthers() // clearing history also closes every tab except the active one
    setConfirming(false)
  }

  const groups = useMemo(() => {
    const today = dayKey(Date.now())
    const yd = new Date()
    yd.setDate(yd.getDate() - 1) // calendar-correct (DST-safe) yesterday
    const yesterday = dayKey(yd.getTime())
    const out: Array<{ label: string; items: HistoryEntry[] }> = []
    const byKey = new Map<string, HistoryEntry[]>()
    for (const e of entries) {
      const k = dayKey(e.ts)
      if (!byKey.has(k)) byKey.set(k, [])
      byKey.get(k)!.push(e)
    }
    for (const [k, items] of byKey) {
      const label =
        k === today
          ? t('history.today')
          : k === yesterday
            ? t('history.yesterday')
            : new Date(items[0].ts).toLocaleDateString(DATE_LOCALE[lang], { day: 'numeric', month: 'long' })
      out.push({ label, items })
    }
    return out
  }, [entries, t, lang])

  const timeStr = (ts: number) => new Date(ts).toLocaleTimeString(DATE_LOCALE[lang], { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="page">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="page-title !mb-0">{t('nav.history')}</h1>
            <p className="mt-1 text-sm text-zinc-500">{t('history.subtitle')}</p>
          </div>
          {entries.length > 0 && (
            <button onClick={() => setConfirming(true)} className="btn-ghost">
              <Trash2 size={15} /> {t('history.clear')}
            </button>
          )}
        </div>

        {confirming && (
          <ConfirmDialog
            title={t('history.clear')}
            message={t('history.clearConfirm')}
            confirmLabel={t('history.clear')}
            danger
            onConfirm={clearAll}
            onCancel={() => setConfirming(false)}
          />
        )}

        {entries.length === 0 ? (
          <EmptyState icon={HistoryIcon} title={t('history.emptyTitle')} subtitle={t('history.emptySubtitle')} />
        ) : (
          <div className="space-y-7">
            {groups.map((g) => (
              <section key={g.label}>
                <h2 className="section-title">{g.label}</h2>
                <div className="space-y-px">
                  {g.items.map((e, i) => {
                    const { icon: Icon, label } = routeMeta(e.path, t)
                    return (
                      <button
                        key={`${e.path}-${e.ts}-${i}`}
                        onClick={() => navigate(e.path)}
                        className="group flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-highlight"
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-raised text-zinc-400 group-hover:text-zinc-100">
                          <Icon size={16} />
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-zinc-200">{e.title || label}</span>
                        <span className="shrink-0 text-[12px] text-zinc-500">{timeStr(e.ts)}</span>
                      </button>
                    )
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
