import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, CalendarDays, ChevronDown, ChevronRight, Clock, Copy, Film, Flag, FolderKanban, ImagePlus, Trash2, X } from 'lucide-react'
import DatePicker from './ui/DatePicker'
import TimeSelect from './ui/TimeSelect'
import { LinkField } from './TaskDetailModal'
import { formatRelative } from '../utils/formatters'
import { physKey } from '../lib/keyboard'
import { toast } from '../store/toastStore'
import { type Task, type TaskAttachment, type TaskComment, type TaskPriority, type TaskStatus } from '../types/models'
import { useI18n, DATE_LOCALE } from '../i18n'

type LinkOption = { id: number; name: string }
const PRIORITIES: TaskPriority[] = ['none', 'low', 'high']
const STATUSES: TaskStatus[] = ['todo', 'doing', 'done']
// each status / priority maps to a Notion content-palette hue → the coloured pill
const STATUS_HUE: Record<TaskStatus, string> = { todo: 'gray', doing: 'orange', done: 'green' }
const PRIORITY_HUE: Record<TaskPriority, string> = { none: 'gray', low: 'blue', high: 'red' }
const pad = (n: number) => String(n).padStart(2, '0')
const fmtDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const fmtTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`

/** A coloured pill that opens a dropdown of the other values (status / priority). */
function PillSelect<T extends string>({
  value,
  options,
  hue,
  label,
  onChange,
}: {
  value: T
  options: T[]
  hue: (v: T) => string
  label: (v: T) => string
  onChange: (v: T) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])
  const pill = (v: T) => (
    <span
      className="inline-flex rounded-full px-2.5 py-0.5 text-[12px] font-semibold"
      style={{ color: `var(--c-${hue(v)}-text)`, background: `var(--c-${hue(v)}-bg)` }}
    >
      {label(v)}
    </span>
  )
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="rounded-md transition-opacity hover:opacity-80">
        {pill(value)}
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1.5 w-max rounded-xl border border-edge bg-card p-1 shadow-[var(--float-shadow)]">
          {options.map((o) => (
            <button
              key={o}
              onClick={() => {
                onChange(o)
                setOpen(false)
              }}
              className="flex w-full items-center rounded-lg px-2 py-1.5 transition-colors hover:bg-highlight"
            >
              {pill(o)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** A property row: muted icon+label (fixed width) on the left, the control on the right. */
function Prop({ icon: Icon, label, children }: { icon: typeof Clock; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3.5 py-1.5 text-[13.5px]">
      <span className="flex w-[120px] shrink-0 items-center gap-2 pt-1 text-zinc-500">
        <Icon size={15} className="shrink-0" /> {label}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

/**
 * The Notion "peek" detail — the right column of the tasks card. Срок + Статус are
 * always shown; the rest (priority, reminder, links) hide behind "ещё свойства"
 * (progressive disclosure). Below: a comment thread. Rendered bare — the column
 * chrome (bg-card / padding) comes from the parent.
 */
export default function TaskPeek({ task, onClose, onChanged }: { task: Task; onClose: () => void; onChanged: () => void }) {
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
  const [titleId, setTitleId] = useState(task.linked_title_id)
  const [projects, setProjects] = useState<LinkOption[]>([])
  const [titles, setTitles] = useState<LinkOption[]>([])
  const [more, setMore] = useState(
    task.priority !== 'none' || !!task.remind_at || task.project_id != null || task.linked_title_id != null
  )
  const [comments, setComments] = useState<TaskComment[]>([])
  const [attachments, setAttachments] = useState<TaskAttachment[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [draft, setDraft] = useState('')
  const titleRef = useRef<HTMLTextAreaElement>(null)
  const noteRef = useRef<HTMLTextAreaElement>(null)

  // auto-grow the title so long names wrap to multiple lines instead of overflowing
  useEffect(() => {
    const el = titleRef.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = `${el.scrollHeight}px`
    }
  }, [title])

  // auto-grow the description too — a long note expands the panel instead of scrolling
  // inside a fixed box, so the whole task reads at a glance
  useEffect(() => {
    const el = noteRef.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = `${el.scrollHeight}px`
    }
  }, [note])

  const loadComments = () => window.wist.tasks.comments(task.id).then(setComments).catch(() => setComments([]))
  const loadAttachments = () => window.wist.tasks.attachments(task.id).then(setAttachments).catch(() => setAttachments([]))
  useEffect(() => {
    window.wist.projects.list().then((ps) => setProjects(ps.map((p) => ({ id: p.id, name: p.name })))).catch(() => undefined)
    window.wist.titles.list().then((ts) => setTitles(ts.map((x) => ({ id: x.id, name: x.title })))).catch(() => undefined)
    loadComments()
    loadAttachments()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id])

  const projectName = projects.find((p) => p.id === projectId)?.name ?? (projectId === task.project_id ? task.project_name ?? null : null)
  const titleName = titles.find((x) => x.id === titleId)?.name ?? (titleId === task.linked_title_id ? task.linked_title_name ?? null : null)

  const savedTitle = useRef(task.title)
  const savedNote = useRef(task.note ?? '')
  const patch = async (p: Partial<Task>) => {
    await window.wist.tasks.update(task.id, p)
    onChanged()
  }
  const saveTitle = () => {
    const v = title.trim()
    if (v && v !== savedTitle.current) {
      savedTitle.current = v
      patch({ title: v })
    }
  }
  const saveNote = () => {
    if (note !== savedNote.current) {
      savedNote.current = note
      patch({ note: note.trim() || null })
    }
  }
  const remove = async () => {
    await window.wist.tasks.remove(task.id)
    onChanged()
    onClose()
  }

  const applyRemind = (date: string, time: string) => patch(date && time ? { remind_at: `${date} ${time}:00` } : { remind_at: null })
  const setRemind = (d: Date) => {
    const date = fmtDate(d)
    const time = fmtTime(d)
    setRemindDate(date)
    setRemindTime(time)
    applyRemind(date, time)
  }
  const quickRemind = (kind: 'hour' | 'evening' | 'tomorrow') => {
    const d = new Date()
    if (kind === 'hour') d.setTime(d.getTime() + 60 * 60 * 1000)
    else if (kind === 'evening') {
      d.setHours(18, 0, 0, 0)
      if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1)
    } else {
      d.setDate(d.getDate() + 1)
      d.setHours(9, 0, 0, 0)
    }
    setRemind(d)
  }
  const clearRemind = () => {
    setRemindDate('')
    setRemindTime('')
    patch({ remind_at: null })
  }
  const remindLabel =
    remindDate && remindTime
      ? new Date(`${remindDate}T${remindTime}:00`).toLocaleString(DATE_LOCALE[lang], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
      : null

  const addComment = async () => {
    const body = draft.trim()
    if (!body) return
    setDraft('')
    await window.wist.tasks.addComment(task.id, body)
    loadComments()
  }
  const removeComment = async (id: number) => {
    await window.wist.tasks.removeComment(id)
    loadComments()
  }

  // ── image attachments — save the image to app storage, then record it on the task.
  // Reuses the existing cover-image IPC (saveCoverFromPath/Bytes return a media path).
  const fileName = (p: string) => p.split(/[\\/]/).pop() || 'image'
  const addAttachmentFromPath = async (src: string) => {
    const stored = await window.wist.files.saveCoverFromPath(src)
    await window.wist.tasks.addAttachment(task.id, stored, fileName(src))
    loadAttachments()
  }
  const addAttachmentBytes = async (name: string, bytes: ArrayBuffer) => {
    const stored = await window.wist.files.saveCoverFromBytes(name, bytes)
    await window.wist.tasks.addAttachment(task.id, stored, name)
    loadAttachments()
  }
  const pickAttachment = async () => {
    const src = await window.wist.files.pickImage()
    if (src) await addAttachmentFromPath(src)
  }
  const removeAttachment = async (id: number) => {
    await window.wist.tasks.removeAttachment(id)
    loadAttachments()
  }
  // copy a single attached image to the clipboard AS A REAL IMAGE (main process reads
  // the file → bitmap), so pasting into a chat/editor brings the picture through
  const copyImage = async (path: string) => {
    const ok = await window.wist.clipboard.copy({ imagePaths: [path] })
    toast(ok ? t('tasks.imgCopied') : t('tasks.copyFailed'), ok ? 'success' : 'error')
  }
  // paste an image directly into the description → attach it (don't dump binary as text)
  const onPasteImage = async (e: React.ClipboardEvent) => {
    const it = Array.from(e.clipboardData?.items ?? []).find((i) => i.kind === 'file' && i.type.startsWith('image/'))
    const file = it?.getAsFile()
    if (!file) return
    e.preventDefault()
    await addAttachmentBytes(file.name || `pasted.${(file.type.split('/')[1] || 'png')}`, await file.arrayBuffer())
  }
  const onDropFiles = async (e: React.DragEvent) => {
    const files = Array.from(e.dataTransfer?.files ?? []).filter((f) => f.type.startsWith('image/'))
    setDragOver(false)
    if (!files.length) return
    e.preventDefault()
    for (const f of files) await addAttachmentBytes(f.name, await f.arrayBuffer())
  }

  // copy the whole task (title + description + comments + attachments) as text
  const copyTask = async () => {
    const parts: string[] = [title.trim() || t('tasks.detail')]
    if (note.trim()) parts.push('', note.trim())
    if (comments.length) {
      parts.push('', `${t('tasks.comments')}:`)
      for (const c of comments) parts.push(`• ${c.body}`)
    }
    if (attachments.length) {
      parts.push('', `${t('tasks.attachments')}:`)
      for (const a of attachments) parts.push(`• ${a.name || fileName(a.path)}`)
    }
    // include the first attached image as a REAL picture, so pasting into a chat brings
    // the image through (not just its filename); the text rides along for text fields.
    const ok = await window.wist.clipboard.copy({ text: parts.join('\n'), imagePaths: attachments.map((a) => a.path) })
    toast(ok ? t('tasks.copied') : t('tasks.copyFailed'), ok ? 'success' : 'error')
  }

  // Ctrl/Cmd+C with nothing selected and focus outside a field → copy the whole task
  // (physKey so it fires on any keyboard layout). A live selection / focused field
  // keeps the native copy so text editing isn't hijacked.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || physKey(e) !== 'c') return
      const sel = window.getSelection()?.toString()
      const el = document.activeElement as HTMLElement | null
      const editable = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
      if (sel || editable) return
      e.preventDefault()
      copyTask()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, note, comments, attachments])

  return (
    <div className="relative h-full overflow-y-auto px-6 py-6">
      <div className="absolute right-3 top-4 z-10 flex items-center gap-0.5">
        <button
          onClick={copyTask}
          title={t('tasks.copyTask')}
          className="grid h-8 w-8 place-items-center rounded-lg text-zinc-500 transition-colors hover:bg-highlight hover:text-zinc-100"
        >
          <Copy size={15} />
        </button>
        <button
          onClick={onClose}
          title={t('common.close')}
          className="grid h-8 w-8 place-items-center rounded-lg text-zinc-500 transition-colors hover:bg-highlight hover:text-zinc-100"
        >
          <X size={16} />
        </button>
      </div>

      <textarea
        ref={titleRef}
        rows={1}
        className="mb-5 w-full resize-none break-words bg-transparent pr-16 text-[22px] font-bold leading-tight tracking-tight text-white outline-none placeholder:text-zinc-600"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={saveTitle}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            ;(e.target as HTMLTextAreaElement).blur()
          }
        }}
      />

      <Prop icon={CalendarDays} label={t('tasks.dueLabel')}>
        <DatePicker withTime value={due} onChange={(v) => { setDue(v); patch({ due_date: v || null }) }} placeholder={t('tasks.noDue')} />
      </Prop>
      <Prop icon={Clock} label={t('tasks.statusLabel')}>
        <PillSelect
          value={status}
          options={STATUSES}
          hue={(s) => STATUS_HUE[s]}
          label={(s) => t(`tasks.status.${s}` as 'tasks.status.todo')}
          onChange={(s) => { setStatus(s); patch({ status: s }) }}
        />
      </Prop>

      {!more ? (
        <button onClick={() => setMore(true)} className="mt-2.5 inline-flex items-center gap-1.5 text-[13px] text-zinc-500 transition-colors hover:text-zinc-300">
          <ChevronRight size={14} /> {t('tasks.moreProps')}
        </button>
      ) : (
        <>
          <Prop icon={Flag} label={t('tasks.priority')}>
            <PillSelect
              value={priority}
              options={PRIORITIES}
              hue={(p) => PRIORITY_HUE[p]}
              label={(p) => t(`tasks.prio.${p}` as 'tasks.prio.none')}
              onChange={(p) => { setPriority(p); patch({ priority: p }) }}
            />
          </Prop>
          <Prop icon={Bell} label={t('tasks.reminder')}>
            <div className="mb-1.5 flex flex-wrap gap-1.5">
              {([['hour', t('tasks.remindIn1h')], ['evening', t('tasks.remindThisEve')], ['tomorrow', t('tasks.remindTomorrow')]] as const).map(([k, label]) => (
                <button key={k} onClick={() => quickRemind(k)} className="rounded-full border border-edge bg-raised px-2.5 py-1 text-[11px] font-medium text-zinc-300 transition-colors hover:text-white">
                  {label}
                </button>
              ))}
            </div>
            <div className="flex gap-1.5">
              <div className="flex-1">
                <DatePicker value={remindDate} onChange={(v) => { setRemindDate(v); applyRemind(v, remindTime) }} placeholder={t('tasks.remindDatePh')} />
              </div>
              <TimeSelect value={remindTime} onChange={(v) => { setRemindTime(v); applyRemind(remindDate, v) }} />
            </div>
            {remindLabel && (
              <p className="mt-1.5 flex items-center gap-1.5 text-[11.5px] text-zinc-400">
                <Bell size={12} /> {remindLabel}
                <button onClick={clearRemind} className="text-zinc-500 hover:text-danger"><X size={12} /></button>
              </p>
            )}
          </Prop>
          <Prop icon={FolderKanban} label={t('tasks.links')}>
            <div className="space-y-2">
              <LinkField
                icon={FolderKanban}
                placeholder={t('tasks.linkProjectAdd')}
                currentName={projectName}
                options={projects}
                onSelect={(id) => { setProjectId(id); patch({ project_id: id }) }}
                onClear={() => { setProjectId(null); patch({ project_id: null }) }}
                onOpen={() => { if (projectId) { navigate(`/project/${projectId}`); onClose() } }}
                searchPh={t('tasks.searchProject')}
              />
              <LinkField
                icon={Film}
                placeholder={t('tasks.linkLibraryAdd')}
                currentName={titleName}
                options={titles}
                onSelect={(id) => { setTitleId(id); patch({ linked_title_id: id }) }}
                onClear={() => { setTitleId(null); patch({ linked_title_id: null }) }}
                onOpen={() => { if (titleId) { navigate(`/title/${titleId}`); onClose() } }}
                searchPh={t('tasks.searchLibrary')}
              />
            </div>
          </Prop>
          <button onClick={() => setMore(false)} className="mt-1 inline-flex items-center gap-1.5 text-[13px] text-zinc-500 transition-colors hover:text-zinc-300">
            <ChevronDown size={14} /> {t('tasks.lessProps')}
          </button>
        </>
      )}

      {/* description — borderless & auto-growing, so it writes clean (no box / highlight)
          like the note editor and the panel grows to fit a long description */}
      <div className="mt-5 border-t border-edge pt-4">
        <textarea
          ref={noteRef}
          rows={1}
          className="w-full resize-none break-words bg-transparent text-[14px] leading-relaxed text-zinc-300 outline-none placeholder:text-zinc-600"
          placeholder={t('tasks.descPh')}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={saveNote}
          onPaste={onPasteImage}
        />
      </div>

      {/* attachments — paste an image into the description, drop one here, or pick a file */}
      <div
        className="mt-4"
        onDragOver={(e) => {
          if (Array.from(e.dataTransfer.types).includes('Files')) {
            e.preventDefault()
            if (!dragOver) setDragOver(true)
          }
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false)
        }}
        onDrop={onDropFiles}
      >
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{t('tasks.attachments')}</div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {attachments.map((a) => (
            <div key={a.id} className="group/att relative aspect-square overflow-hidden rounded-lg border border-edge bg-raised">
              <img src={window.wist.media.fileUrl(a.path)} alt={a.name} loading="lazy" className="h-full w-full object-cover" />
              <div className="absolute inset-x-0 bottom-0 flex justify-end gap-1 bg-gradient-to-t from-black/70 to-transparent p-1 opacity-0 transition-opacity group-hover/att:opacity-100">
                <button onClick={() => copyImage(a.path)} title={t('tasks.copyImage')} className="grid h-6 w-6 place-items-center rounded bg-black/55 text-[#fff] transition-colors hover:bg-black/80">
                  <Copy size={12} />
                </button>
                <button onClick={() => removeAttachment(a.id)} title={t('common.delete')} className="grid h-6 w-6 place-items-center rounded bg-black/55 text-[#fff] transition-colors hover:bg-black/80">
                  <X size={12} />
                </button>
              </div>
            </div>
          ))}
          <button
            onClick={pickAttachment}
            className={`flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border border-dashed transition-colors ${
              dragOver ? 'border-accent bg-accent/10 text-accent-bright' : 'border-edge text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <ImagePlus size={18} />
            <span className="px-1 text-center text-[10px] leading-tight">{t('tasks.attach')}</span>
          </button>
        </div>
      </div>

      <hr className="my-5 border-edge" />

      <div className="mb-3.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{t('tasks.comments')}</div>
      <div className="space-y-3">
        {comments.map((c) => (
          <div key={c.id} className="group flex gap-2.5">
            <span className="mt-0.5 grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full text-[11px] font-bold text-[#fff]" style={{ background: 'var(--c-purple-text)' }}>
              {(c.body.trim()[0] || '•').toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <div className="whitespace-pre-wrap break-words text-[13.5px] leading-relaxed text-zinc-200">{c.body}</div>
              <div className="mt-0.5 flex items-center gap-2 text-[11px] text-zinc-600">
                {formatRelative(c.created_at)}
                <button onClick={() => removeComment(c.id)} className="opacity-0 transition-opacity hover:text-danger group-hover:opacity-100">{t('common.delete')}</button>
              </div>
            </div>
          </div>
        ))}
        <div className="flex items-center gap-2.5">
          <span className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full text-[11px] font-bold text-[#fff]" style={{ background: 'var(--c-purple-text)' }}>
            {(draft.trim()[0] || '+').toUpperCase()}
          </span>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addComment()}
            placeholder={t('tasks.commentPh')}
            className="min-w-0 flex-1 bg-transparent text-[13.5px] text-zinc-200 outline-none placeholder:text-zinc-500"
          />
          {draft.trim() && (
            <button onClick={addComment} className="btn-accent !px-2.5 !py-1 text-xs">{t('common.add')}</button>
          )}
        </div>
      </div>

      <hr className="my-5 border-edge" />
      <button className="flex items-center gap-1.5 text-[13px] text-zinc-500 transition-colors hover:text-danger" onClick={remove}>
        <Trash2 size={14} /> {t('common.delete')}
      </button>
    </div>
  )
}
