import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronRight, Clock3, History, Pause, Play, Plus, Trash2 } from 'lucide-react'
import MarkdownView from './MarkdownView'
import {
  ChangeChips,
  ChangeList,
  SessionModal,
  fmtClock,
  fmtDuration,
  localStamp,
  parseChanges,
  parseStamp,
} from './hub/sessionShared'
import { type ProjectSession } from '../types/models'
import { useI18n } from '../i18n'

type TFn = ReturnType<typeof useI18n>['t']

export default function HubSessions({ projectId, accent }: { projectId: number; accent: string }) {
  const { t, lang } = useI18n()
  const locale = lang === 'ru' ? 'ru-RU' : 'en-US'
  const [sessions, setSessions] = useState<ProjectSession[]>([])
  const [composing, setComposing] = useState<{ durationSeconds: number; startedAt: string | null } | null>(null)
  const timerKey = `hub:session:${projectId}`
  const [startedAtMs, setStartedAtMs] = useState<number | null>(() => {
    const v = localStorage.getItem(timerKey)
    return v ? Number(v) : null
  })
  const [, setTick] = useState(0)

  const load = useCallback(() => {
    window.wist.projects.sessions(projectId).then(setSessions).catch(() => setSessions([]))
  }, [projectId])
  useEffect(() => {
    load()
  }, [load])

  // tick the running clock every second
  useEffect(() => {
    if (startedAtMs == null) return
    const id = setInterval(() => setTick((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [startedAtMs])

  const start = () => {
    const ms = Date.now()
    localStorage.setItem(timerKey, String(ms))
    setStartedAtMs(ms)
    // capture the baseline NOW so the diff reflects only what changes during this session
    window.wist.projects.snapshot(projectId).catch(() => {})
  }
  const cancelTimer = () => {
    localStorage.removeItem(timerKey)
    setStartedAtMs(null)
  }
  const finish = () => {
    const elapsed = startedAtMs != null ? (Date.now() - startedAtMs) / 1000 : 0
    setComposing({ durationSeconds: Math.round(elapsed), startedAt: startedAtMs != null ? localStamp(new Date(startedAtMs)) : null })
  }
  const remove = async (id: number) => {
    await window.wist.projects.removeSession(id)
    load()
  }

  const onSaved = () => {
    cancelTimer()
    setComposing(null)
    load()
  }

  // stats
  const totalSeconds = useMemo(() => sessions.reduce((s, x) => s + (x.duration_seconds || 0), 0), [sessions])
  const weekSeconds = useMemo(() => {
    const weekAgo = Date.now() - 7 * 86_400_000
    return sessions.reduce((s, x) => {
      const d = parseStamp(x.ended_at || x.created_at)
      return d && d.getTime() >= weekAgo ? s + (x.duration_seconds || 0) : s
    }, 0)
  }, [sessions])

  const elapsedNow = startedAtMs != null ? (Date.now() - startedAtMs) / 1000 : 0

  return (
    <div className="space-y-6">
      {/* timer / start */}
      <div className="card flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        {startedAtMs != null ? (
          <>
            <div className="flex items-center gap-3">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ backgroundColor: accent }} />
                <span className="inline-flex h-2.5 w-2.5 rounded-full" style={{ backgroundColor: accent }} />
              </span>
              <div>
                <div className="font-mono text-2xl font-semibold tabular-nums text-zinc-100">{fmtClock(elapsedNow)}</div>
                <div className="text-[11px] text-zinc-500">{t('hub.sessionRunning')}</div>
              </div>
            </div>
            <div className="flex gap-2">
              <button className="btn-ghost" onClick={cancelTimer}>
                {t('common.cancel')}
              </button>
              <button className="btn-accent" onClick={finish}>
                <Pause size={15} /> {t('hub.finishSession')}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl" style={{ backgroundColor: `${accent}22`, color: accent }}>
                <Clock3 size={20} />
              </span>
              <div>
                <div className="text-sm font-semibold text-zinc-200">{t('hub.sessionsTitle')}</div>
                <div className="text-[11px] text-zinc-500">{t('hub.sessionsSubtitle')}</div>
              </div>
            </div>
            <div className="flex gap-2">
              <button className="btn-ghost" onClick={() => setComposing({ durationSeconds: 0, startedAt: null })}>
                <Plus size={15} /> {t('hub.addManual')}
              </button>
              <button className="btn-accent" onClick={start}>
                <Play size={15} /> {t('hub.startSession')}
              </button>
            </div>
          </>
        )}
      </div>

      {/* stats */}
      {sessions.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <Stat label={t('hub.statSessions')} value={String(sessions.length)} />
          <Stat label={t('hub.statTotal')} value={fmtDuration(totalSeconds, t)} />
          <Stat label={t('hub.statWeek')} value={fmtDuration(weekSeconds, t)} />
        </div>
      )}

      {/* timeline */}
      {!sessions.length ? (
        <div className="rounded-xl border-2 border-dashed border-edge px-6 py-14 text-center">
          <History size={32} className="mx-auto mb-3 text-zinc-600" />
          <div className="text-sm font-medium text-zinc-300">{t('hub.noSessions')}</div>
          <div className="mx-auto mt-1 max-w-md text-xs text-zinc-500">{t('hub.noSessionsHint')}</div>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((s) => (
            <SessionCard key={s.id} session={s} t={t} locale={locale} onRemove={() => remove(s.id)} />
          ))}
        </div>
      )}

      {composing && (
        <SessionModal projectId={projectId} initial={composing} onClose={() => setComposing(null)} onSaved={onSaved} />
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{label}</div>
      <div className="mt-1 text-xl font-bold text-zinc-100">{value}</div>
    </div>
  )
}

function SessionCard({
  session: s,
  t,
  locale,
  onRemove,
}: {
  session: ProjectSession
  t: TFn
  locale: string
  onRemove: () => void
}) {
  const [open, setOpen] = useState(false)
  const date = parseStamp(s.ended_at || s.created_at)
  const dateStr = date ? new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(date) : ''
  const changes = parseChanges(s.changes_json)
  const hasBody = !!(s.report && s.report.trim())

  return (
    <div className="card overflow-hidden">
      <button onClick={() => setOpen((o) => !o)} className="group flex w-full items-center gap-3 px-4 py-3 text-left">
        <ChevronRight size={15} className={`shrink-0 text-zinc-500 transition-transform ${open ? 'rotate-90' : ''}`} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-zinc-100">{s.title?.trim() || dateStr || t('hub.sessionsTitle')}</span>
            <span className="shrink-0 rounded bg-raised px-1.5 py-0.5 text-[10px] font-semibold text-zinc-400">
              {fmtDuration(s.duration_seconds, t)}
            </span>
          </div>
          <div className="mt-0.5 flex items-center gap-3 text-[11px] text-zinc-500">
            <span>{dateStr}</span>
            {changes && <ChangeChips c={changes} t={t} />}
          </div>
        </div>
        <span
          role="button"
          tabIndex={-1}
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          className="shrink-0 rounded-lg p-1.5 text-zinc-600 opacity-0 transition-all hover:text-danger group-hover:opacity-100"
          title={t('common.delete')}
        >
          <Trash2 size={14} />
        </span>
      </button>

      {open && (hasBody || changes) && (
        <div className="space-y-4 border-t border-edge px-5 py-4">
          {hasBody && <MarkdownView content={s.report!} />}
          {changes && changes.scanned > 0 && (changes.added.length > 0 || changes.removed.length > 0 || changes.modified.length > 0) && (
            <div className="grid grid-cols-1 gap-4 rounded-xl bg-raised p-3 sm:grid-cols-3">
              <ChangeList title={t('hub.filesAdded')} paths={changes.added} color="text-success" />
              <ChangeList title={t('hub.filesModified')} paths={changes.modified} color="text-st-onhold" />
              <ChangeList title={t('hub.filesRemoved')} paths={changes.removed} color="text-danger" />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
