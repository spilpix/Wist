import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Pause, Play, RotateCcw, Target } from 'lucide-react'
import ProgressRing from '../ui/ProgressRing'
import Select from '../ui/Select'
import { SessionModal, fmtClock, localStamp } from './sessionShared'
import { type Task } from '../../types/models'
import { useI18n } from '../../i18n'

type FocusState = {
  durationSec: number
  startedAt: string // localStamp when the focus first started — used for the session row
  taskId: number | null
  taskTitle: string | null
  endsAt: number | null // ms epoch when it will complete (running); null when paused
  remainingSec: number | null // remaining seconds (paused); null when running
}

const PRESETS = [25, 50, 90] // minutes

/**
 * Focus / deep-work timer for a hub. Lives in the Overview as a widget (a compact,
 * horizontal "focus station" card). All timer state is persisted per-hub in localStorage
 * and is epoch-based, so it keeps counting across tab/hub switches and app restarts.
 */
export default function HubFocus({ projectId, accent }: { projectId: number; accent: string }) {
  const { t } = useI18n()
  const key = `hub:focus:${projectId}`
  const [state, setState] = useState<FocusState | null>(() => {
    try {
      const raw = localStorage.getItem(key)
      if (!raw) return null
      const s = JSON.parse(raw)
      return s && typeof s === 'object' && typeof s.durationSec === 'number' ? (s as FocusState) : null
    } catch {
      return null
    }
  })
  const [lengthMin, setLengthMin] = useState(25)
  const [taskId, setTaskId] = useState<number | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [, setTick] = useState(0)
  const [logging, setLogging] = useState<{ durationSeconds: number; startedAt: string | null; title?: string } | null>(null)

  // persist whenever state changes
  const persist = useCallback(
    (s: FocusState | null) => {
      setState(s)
      try {
        if (s) localStorage.setItem(key, JSON.stringify(s))
        else localStorage.removeItem(key)
      } catch {
        /* best-effort */
      }
    },
    [key]
  )

  // load open hub tasks for the (optional) target picker
  useEffect(() => {
    window.wist.tasks
      .list({ projectId })
      .then((ts) => setTasks(ts.filter((x) => !x.done)))
      .catch(() => setTasks([]))
  }, [projectId])

  // tick the clock while running
  const running = !!state && state.endsAt != null
  useEffect(() => {
    if (!running) return
    const id = setInterval(() => setTick((n) => n + 1), 500)
    return () => clearInterval(id)
  }, [running])

  // recomputed every render; the 500ms tick (while running) drives the re-render
  const remainingSec = !state ? 0 : state.endsAt != null ? Math.max(0, (state.endsAt - Date.now()) / 1000) : state.remainingSec ?? 0

  const pct = state && state.durationSec > 0 ? 1 - remainingSec / state.durationSec : 0
  const complete = !!state && remainingSec <= 0.001

  // when running and the timer reaches zero, freeze it (move to a paused-at-0 state) so it
  // stops ticking and shows the "time's up" state until the user logs or resets
  const frozeRef = useRef(false)
  useEffect(() => {
    if (running && complete && state && !frozeRef.current) {
      frozeRef.current = true
      persist({ ...state, endsAt: null, remainingSec: 0 })
    }
    if (!complete) frozeRef.current = false
  }, [running, complete, state, persist])

  const startFocus = () => {
    const durationSec = Math.max(60, Math.round(lengthMin * 60))
    const task = tasks.find((x) => x.id === taskId) || null
    persist({
      durationSec,
      startedAt: localStamp(new Date()),
      taskId: task?.id ?? null,
      taskTitle: task?.title ?? null,
      endsAt: Date.now() + durationSec * 1000,
      remainingSec: null,
    })
    // baseline the hub's files so the logged session's diff reflects only this focus block
    window.wist.projects.snapshot(projectId).catch(() => {})
  }

  const pause = () => {
    if (!state) return
    persist({ ...state, endsAt: null, remainingSec: Math.max(0, Math.round(remainingSec)) })
  }
  const resume = () => {
    if (!state) return
    const rem = Math.max(1, Math.round(state.remainingSec ?? 0))
    persist({ ...state, endsAt: Date.now() + rem * 1000, remainingSec: null })
  }
  const reset = () => persist(null)

  const finishAndLog = () => {
    if (!state) return
    const elapsed = state.durationSec - Math.max(0, remainingSec)
    setLogging({
      durationSeconds: Math.max(0, Math.round(elapsed)),
      startedAt: state.startedAt,
      title: state.taskTitle ?? '',
    })
  }

  const onLogged = () => {
    setLogging(null)
    persist(null)
  }

  // ---- idle (setup) — compact "start a focus block" row ----
  if (!state) {
    return (
      <div className="card p-5">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl" style={{ backgroundColor: `${accent}22`, color: accent }}>
              <Target size={22} />
            </span>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-zinc-100">{t('hub.focusTitle')}</div>
              <div className="truncate text-xs text-zinc-500">{t('hub.focusSubtitle')}</div>
            </div>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-0.5 rounded-lg bg-raised p-0.5">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  onClick={() => setLengthMin(p)}
                  title={`${p} ${t('hub.focusMin')}`}
                  className={`rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors ${
                    lengthMin === p ? 'text-[#fff]' : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                  style={lengthMin === p ? { backgroundColor: accent } : undefined}
                >
                  {p}
                </button>
              ))}
              <input
                type="number"
                min={1}
                max={600}
                value={lengthMin}
                onChange={(e) => setLengthMin(Math.min(600, Math.max(1, Number(e.target.value) || 1)))}
                className="w-10 rounded-lg bg-transparent px-1 py-1.5 text-center text-[13px] font-medium text-zinc-200 outline-none"
                title={t('hub.focusMin')}
              />
            </div>

            {tasks.length > 0 && (
              <Select
                className="max-w-[11rem]"
                ariaLabel={t('hub.focusTask')}
                value={taskId != null ? String(taskId) : ''}
                options={[{ value: '', label: t('hub.focusNoTask') }, ...tasks.map((x) => ({ value: String(x.id), label: x.title }))]}
                onChange={(v) => setTaskId(v ? Number(v) : null)}
              />
            )}

            <button className="btn-accent !py-2" onClick={startFocus}>
              <Play size={15} /> {t('hub.focusStart')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ---- running / paused / complete — ring + controls ----
  const paused = state.endsAt == null && !complete
  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-center gap-5">
        <ProgressRing
          value={complete ? 1 : pct}
          size={104}
          stroke={8}
          color={complete ? 'var(--c-green-text)' : accent}
          track="rgb(var(--edge))"
        >
          <span className="font-mono text-lg font-bold tabular-nums text-zinc-100">{fmtClock(Math.max(0, remainingSec))}</span>
        </ProgressRing>

        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            {complete ? t('hub.focusComplete') : paused ? t('hub.focusPaused') : t('hub.focusRunning')}
          </div>
          {state.taskTitle ? (
            <div className="mt-1 flex items-center gap-1.5 text-sm font-medium text-zinc-200">
              <Target size={14} className="shrink-0" style={{ color: accent }} />
              <span className="truncate">{state.taskTitle}</span>
            </div>
          ) : (
            <div className="mt-1 text-sm text-zinc-500">{t('hub.focusTitle')}</div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {complete ? (
              <button className="btn-accent !py-2" onClick={finishAndLog}>
                <Check size={15} /> {t('hub.focusFinish')}
              </button>
            ) : (
              <>
                {paused ? (
                  <button className="btn-accent !py-2" onClick={resume}>
                    <Play size={14} /> {t('hub.focusResume')}
                  </button>
                ) : (
                  <button className="btn !py-2" onClick={pause}>
                    <Pause size={14} /> {t('hub.focusPause')}
                  </button>
                )}
                <button className="btn-ghost !py-2" onClick={finishAndLog}>
                  <Check size={14} /> {t('hub.focusFinish')}
                </button>
              </>
            )}
            <button className="btn-ghost !px-2.5 !py-2" onClick={reset} title={t('hub.focusReset')}>
              <RotateCcw size={14} />
            </button>
          </div>
        </div>
      </div>

      {logging && <SessionModal projectId={projectId} initial={logging} onClose={() => setLogging(null)} onSaved={onLogged} />}
    </div>
  )
}
