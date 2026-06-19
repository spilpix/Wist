import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { Bell, FolderKanban, Trash2, X } from 'lucide-react'
import Modal from './ui/Modal'
import DatePicker from './ui/DatePicker'
import TimeSelect from './ui/TimeSelect'
import { TASK_STATUSES, TASK_STATUS_COLORS, type Task, type TaskPriority, type TaskStatus } from '../types/models'
import { useI18n, DATE_LOCALE } from '../i18n'

type LinkOption = { id: number; name: string }

const PRIORITIES: TaskPriority[] = ['none', 'low', 'high']
const PRIORITY_DOT: Record<TaskPriority, string> = { none: 'var(--c-gray-text)', low: 'var(--accent)', high: 'var(--c-red-text)' }

const pad = (n: number) => String(n).padStart(2, '0')
const fmtDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const fmtTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`

/** Full editor for a single task — note, priority, due date, status, delete. */
export default function TaskDetailModal({
  task,
  onClose,
  onChanged,
}: {
  task: Task
  onClose: () => void
  onChanged: () => void
}) {
  const { t, lang } = useI18n()
  const navigate = useNavigate()
  const [title, setTitle] = useState(task.title)
  const [note, setNote] = useState(task.note ?? '')
  const [priority, setPriority] = useState<TaskPriority>(task.priority)
  const [status, setStatus] = useState<TaskStatus>(task.status)
  const [due, setDue] = useState(task.due_date ?? '')
  const [remindDate, setRemindDate] = useState(task.remind_at ? task.remind_at.slice(0, 10) : '')
  const [remindTime, setRemindTime] = useState(task.remind_at ? task.remind_at.slice(11, 16) : '')
  const [projectId, setProjectId] = useState(task.project_id)
  const [projects, setProjects] = useState<LinkOption[]>([])

  useEffect(() => {
    window.wist.projects.list().then((ps) => setProjects(ps.map((p) => ({ id: p.id, name: p.name })))).catch(() => undefined)
  }, [])

  const projectName = projects.find((p) => p.id === projectId)?.name ?? (projectId === task.project_id ? task.project_name ?? null : null)

  // compare edits against the LAST SAVED value, not the (stale-after-patch) prop —
  // otherwise editing then reverting within one open is silently dropped
  const saved = useRef({ title: task.title, note: task.note ?? '' })
  const patch = async (p: Partial<Task>) => {
    await window.wist.tasks.update(task.id, p)
    onChanged()
  }
  const saveTitle = () => {
    const v = title.trim()
    if (v && v !== saved.current.title) {
      saved.current.title = v
      patch({ title: v })
    }
  }
  const saveNote = () => {
    if (note !== saved.current.note) {
      saved.current.note = note
      patch({ note: note.trim() || null })
    }
  }
  const remove = async () => {
    await window.wist.tasks.remove(task.id)
    onChanged()
    onClose()
  }

  // reminder: commit only when both date+time are present; clearing either removes it
  const applyRemind = (date: string, time: string) => {
    if (date && time) patch({ remind_at: `${date} ${time}:00` })
    else patch({ remind_at: null })
  }
  const setRemind = (d: Date) => {
    const date = fmtDate(d)
    const time = fmtTime(d)
    setRemindDate(date)
    setRemindTime(time)
    applyRemind(date, time)
  }
  const clearRemind = () => {
    setRemindDate('')
    setRemindTime('')
    patch({ remind_at: null })
  }
  const quickRemind = (kind: 'hour' | 'evening' | 'tomorrow') => {
    const d = new Date()
    if (kind === 'hour') d.setTime(d.getTime() + 60 * 60 * 1000)
    else if (kind === 'evening') {
      d.setHours(18, 0, 0, 0)
      if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1) // already past 18:00 → tomorrow evening
    } else {
      d.setDate(d.getDate() + 1)
      d.setHours(9, 0, 0, 0)
    }
    setRemind(d)
  }
  const remindLabel =
    remindDate && remindTime
      ? new Date(`${remindDate}T${remindTime}:00`).toLocaleString(DATE_LOCALE[lang], {
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        })
      : null

  return (
    <Modal title={t('tasks.detail')} onClose={onClose} width="max-w-lg">
      <div className="space-y-5">
        <input
          autoFocus
          className="input !text-[15px] !font-medium"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={saveTitle}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />

        <div>
          <label className="mb-1.5 block text-xs font-medium text-zinc-400">{t('tasks.noteLabel')}</label>
          <textarea
            className="input min-h-[80px] resize-y text-sm"
            placeholder={t('tasks.notePh')}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={saveNote}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-zinc-400">{t('tasks.priority')}</label>
            <div className="flex gap-1.5">
              {PRIORITIES.map((p) => (
                <button
                  key={p}
                  onClick={() => {
                    setPriority(p)
                    patch({ priority: p })
                  }}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-full border px-2 py-1.5 text-[12px] font-medium transition-colors ${
                    priority === p ? 'border-transparent text-[#fff]' : 'border-edge text-zinc-400 hover:text-zinc-200'
                  }`}
                  style={priority === p ? { backgroundColor: PRIORITY_DOT[p] } : undefined}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: priority === p ? '#fff' : PRIORITY_DOT[p] }} />
                  {t(`tasks.prio.${p}` as 'tasks.prio.none')}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-zinc-400">{t('tasks.dueLabel')}</label>
            <DatePicker withTime value={due} onChange={(v) => { setDue(v); patch({ due_date: v || null }) }} placeholder={t('tasks.noDue')} />
          </div>
        </div>

        <div>
          <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-zinc-400">
            <Bell size={12} /> {t('tasks.reminder')}
          </label>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {(
              [
                ['hour', t('tasks.remindIn1h')],
                ['evening', t('tasks.remindThisEve')],
                ['tomorrow', t('tasks.remindTomorrow')],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                onClick={() => quickRemind(k)}
                className="rounded-full border border-edge bg-raised px-2.5 py-1 text-[12px] font-medium text-zinc-300 transition-colors hover:text-white"
              >
                {label}
              </button>
            ))}
            {remindLabel && (
              <button
                onClick={clearRemind}
                className="flex items-center gap-1 rounded-full border border-edge px-2.5 py-1 text-[12px] font-medium text-zinc-500 transition-colors hover:text-danger"
              >
                <X size={12} /> {t('tasks.remindClear')}
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <DatePicker
                value={remindDate}
                onChange={(v) => {
                  setRemindDate(v)
                  applyRemind(v, remindTime)
                }}
                placeholder={t('tasks.remindDatePh')}
              />
            </div>
            <TimeSelect
              value={remindTime}
              onChange={(v) => {
                setRemindTime(v)
                applyRemind(remindDate, v)
              }}
            />
          </div>
          {remindLabel && (
            <p className="mt-2 flex items-center gap-1.5 text-[12px] text-zinc-400">
              <Bell size={12} /> {t('tasks.remindSet')} {remindLabel}
            </p>
          )}
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-zinc-400">{t('tasks.statusLabel')}</label>
          <div className="flex gap-1.5">
            {TASK_STATUSES.map((s) => (
              <button
                key={s}
                onClick={() => {
                  setStatus(s)
                  patch({ status: s })
                }}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-full border px-2 py-1.5 text-[12px] font-medium transition-colors ${
                  status === s ? 'border-transparent text-[#fff]' : 'border-edge text-zinc-400 hover:text-zinc-200'
                }`}
                style={status === s ? { backgroundColor: TASK_STATUS_COLORS[s] } : undefined}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: status === s ? '#fff' : TASK_STATUS_COLORS[s] }} />
                {t(`tasks.status.${s}` as 'tasks.status.todo')}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-zinc-400">{t('tasks.links')}</label>
          <div className="space-y-2">
            <LinkField
              icon={FolderKanban}
              placeholder={t('tasks.linkProjectAdd')}
              currentName={projectName}
              options={projects}
              onSelect={(id) => {
                setProjectId(id)
                patch({ project_id: id })
              }}
              onClear={() => {
                setProjectId(null)
                patch({ project_id: null })
              }}
              onOpen={() => {
                if (projectId) {
                  navigate(`/project/${projectId}`)
                  onClose()
                }
              }}
              searchPh={t('tasks.searchProject')}
            />
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-edge pt-4">
          <button className="btn-danger !px-3" onClick={remove}>
            <Trash2 size={15} /> {t('common.delete')}
          </button>
          <button className="btn-accent" onClick={onClose}>
            {t('common.done')}
          </button>
        </div>
      </div>
    </Modal>
  )
}


/* a single cross-link row: shows the linked item (click → open, X → unlink) or a
   dashed "+ link" button that opens a searchable dropdown. The dropdown is PORTALED
   to document.body (fixed position, flips up/down) so the modal's overflow can't clip it. */
export function LinkField({
  icon: Icon,
  placeholder,
  currentName,
  options,
  onSelect,
  onClear,
  onOpen,
  searchPh,
}: {
  icon: typeof FolderKanban
  placeholder: string
  currentName: string | null
  options: LinkOption[]
  onSelect: (id: number) => void
  onClear: () => void
  onOpen: () => void
  searchPh: string
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!open) return
    const place = () => {
      const r = btnRef.current?.getBoundingClientRect()
      if (!r) return
      const H = 250
      const openUp = r.bottom + H > window.innerHeight && r.top - H > 0
      setPos({ top: openUp ? r.top - H - 6 : r.bottom + 6, left: r.left, width: r.width })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      const tgt = e.target as Node
      if (btnRef.current?.contains(tgt) || popRef.current?.contains(tgt)) return
      setOpen(false)
      setQ('')
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const list = q ? options.filter((o) => o.name.toLowerCase().includes(q.toLowerCase())) : options

  if (currentName) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-edge bg-raised px-2.5 py-1.5">
        <Icon size={14} className="shrink-0 text-zinc-400" />
        <button onClick={onOpen} className="min-w-0 flex-1 truncate text-left text-sm text-zinc-200 hover:text-white">
          {currentName}
        </button>
        <button onClick={onClear} className="shrink-0 text-zinc-500 hover:text-danger">
          <X size={13} />
        </button>
      </div>
    )
  }
  return (
    <>
      <button
        ref={btnRef}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 rounded-lg border border-dashed border-edge px-2.5 py-1.5 text-sm text-zinc-500 transition-colors hover:text-zinc-300"
      >
        <Icon size={14} /> {placeholder}
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={popRef}
            style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width }}
            className="z-[60] rounded-2xl border border-edge bg-card p-1.5 shadow-[var(--float-shadow)]"
          >
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={searchPh}
              className="mb-1 w-full rounded-lg border border-edge bg-field px-2.5 py-1.5 text-[13px] text-zinc-200 outline-none focus:border-accent"
            />
            <div className="max-h-52 overflow-y-auto">
              {list.map((o) => (
                <button
                  key={o.id}
                  onClick={() => {
                    onSelect(o.id)
                    setOpen(false)
                    setQ('')
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] text-zinc-300 hover:bg-highlight hover:text-white"
                >
                  <span className="truncate">{o.name}</span>
                </button>
              ))}
              {!list.length && <div className="px-2.5 py-3 text-center text-xs text-zinc-600">—</div>}
            </div>
          </div>,
          document.body
        )}
    </>
  )
}
