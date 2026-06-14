import { useEffect, useState } from 'react'
import {
  CalendarClock,
  FolderKanban,
  Paperclip,
  Pencil,
  Pin,
  Plus,
  StickyNote,
  ListTodo,
  Trash2,
} from 'lucide-react'
import EmptyState from '../components/ui/EmptyState'
import Spinner from '../components/ui/Spinner'
import Modal from '../components/ui/Modal'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import { useProjectStore } from '../store/projectStore'
import { toast } from '../store/toastStore'
import {
  PROJECT_COLORS,
  PROJECT_KINDS,
  PROJECT_STATUSES,
  PROJECT_STATUS_COLORS,
  PROJECT_TOOLS,
  type Project,
  type ProjectKind,
  type ProjectStatus,
} from '../types/models'
import { useI18n } from '../i18n'

// days until a YYYY-MM-DD deadline (negative = overdue)
function daysUntil(d: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(`${d}T00:00:00`)
  return Math.round((due.getTime() - today.getTime()) / 86_400_000)
}

export default function Projects() {
  const { t } = useI18n()
  const { projects, loading, load } = useProjectStore()
  const [editing, setEditing] = useState<Project | null>(null)
  const [creating, setCreating] = useState(false)
  const [confirm, setConfirm] = useState<Project | null>(null)

  useEffect(() => {
    load()
  }, [load])

  const togglePin = async (p: Project) => {
    await window.wist.projects.update(p.id, { pinned: p.pinned ? 0 : 1 })
    load()
  }

  const remove = async () => {
    if (!confirm) return
    await window.wist.projects.remove(confirm.id)
    setConfirm(null)
    load()
    toast(t('project.deleted'), 'success')
  }

  if (loading && !projects.length) return <Spinner />

  return (
    <div className="page">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="page-title !mb-0">{t('nav.projects')}</h1>
        <button className="btn-accent" onClick={() => setCreating(true)}>
          <Plus size={16} /> {t('project.new')}
        </button>
      </div>

      {!projects.length ? (
        <EmptyState
          icon={FolderKanban}
          title={t('project.emptyTitle')}
          subtitle={t('project.emptySubtitle')}
          action={
            <button className="btn-accent" onClick={() => setCreating(true)}>
              <Plus size={16} /> {t('project.new')}
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {projects.map((p) => (
            <ProjectCard key={p.id} project={p} t={t} onEdit={() => setEditing(p)} onPin={() => togglePin(p)} onDelete={() => setConfirm(p)} />
          ))}
        </div>
      )}

      {(creating || editing) && (
        <ProjectModal
          project={editing}
          onClose={() => {
            setCreating(false)
            setEditing(null)
          }}
          onSaved={() => {
            setCreating(false)
            setEditing(null)
            load()
          }}
        />
      )}

      {confirm && (
        <ConfirmDialog
          title={t('project.deleteTitle')}
          message={t('project.deleteConfirm')}
          confirmLabel={t('common.delete')}
          danger
          onConfirm={remove}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  )
}

type TFn = ReturnType<typeof useI18n>['t']

function ProjectCard({
  project: p,
  t,
  onEdit,
  onPin,
  onDelete,
}: {
  project: Project
  t: TFn
  onEdit: () => void
  onPin: () => void
  onDelete: () => void
}) {
  const accent = p.color || PROJECT_STATUS_COLORS[p.status]
  const left = p.deadline ? daysUntil(p.deadline) : null
  const dueColor =
    left === null ? '' : left < 0 ? 'text-red-400' : left <= 3 ? 'text-amber-400' : 'text-zinc-400'

  return (
    <button
      onClick={onEdit}
      className="group relative flex flex-col overflow-hidden rounded-xl border border-edge/60 bg-surface text-left transition-colors hover:border-edge"
    >
      <div className="h-1.5 w-full shrink-0" style={{ backgroundColor: accent }} />
      <div className="flex flex-1 flex-col p-4">
        <div className="mb-1 flex items-start justify-between gap-2">
          <h3 className="min-w-0 flex-1 truncate text-[15px] font-semibold text-zinc-100">{p.name}</h3>
          <span
            className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
            style={{ backgroundColor: `${PROJECT_STATUS_COLORS[p.status]}26`, color: PROJECT_STATUS_COLORS[p.status] }}
          >
            {t(`project.status.${p.status}` as 'project.status.active')}
          </span>
        </div>

        <div className="mb-3 truncate text-xs text-zinc-500">
          {p.client || t(`project.kind.${p.kind}` as 'project.kind.video')}
        </div>

        {p.tools.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-1">
            {p.tools.slice(0, 4).map((tool) => (
              <span key={tool} className="rounded-md bg-raised px-1.5 py-0.5 text-[10px] font-medium text-zinc-400">
                {t(`project.tool.${tool}` as 'project.tool.other')}
              </span>
            ))}
            {p.tools.length > 4 && <span className="px-1 text-[10px] text-zinc-600">+{p.tools.length - 4}</span>}
          </div>
        )}

        <div className="mt-auto flex items-center gap-3 text-[11px] text-zinc-500">
          <span className="flex items-center gap-1" title={t('project.statRefs')}>
            <Paperclip size={12} /> {p.asset_count ?? 0}
          </span>
          <span className="flex items-center gap-1" title={t('project.statNotes')}>
            <StickyNote size={12} /> {p.note_count ?? 0}
          </span>
          <span className="flex items-center gap-1" title={t('project.statTasks')}>
            <ListTodo size={12} /> {p.open_task_count ?? 0}
          </span>
          {p.deadline && (
            <span className={`ml-auto flex items-center gap-1 ${dueColor}`}>
              <CalendarClock size={12} /> {p.deadline}
            </span>
          )}
        </div>
      </div>

      {/* hover actions */}
      <div className="absolute right-2 top-3 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <span
          role="button"
          tabIndex={-1}
          onClick={(e) => {
            e.stopPropagation()
            onPin()
          }}
          className={`rounded-md p-1.5 backdrop-blur-sm transition-colors hover:bg-black/40 ${p.pinned ? 'text-accent-bright' : 'text-zinc-300'}`}
          title={t(p.pinned ? 'project.unpin' : 'project.pin')}
        >
          <Pin size={13} className={p.pinned ? 'fill-current' : ''} />
        </span>
        <span
          role="button"
          tabIndex={-1}
          onClick={(e) => {
            e.stopPropagation()
            onEdit()
          }}
          className="rounded-md p-1.5 text-zinc-300 backdrop-blur-sm transition-colors hover:bg-black/40 hover:text-white"
          title={t('common.edit')}
        >
          <Pencil size={13} />
        </span>
        <span
          role="button"
          tabIndex={-1}
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          className="rounded-md p-1.5 text-zinc-300 backdrop-blur-sm transition-colors hover:bg-black/40 hover:text-red-400"
          title={t('common.delete')}
        >
          <Trash2 size={13} />
        </span>
      </div>

      {p.pinned && (
        <Pin size={12} className="absolute left-2 top-3 fill-current text-accent-bright opacity-100 group-hover:opacity-0" />
      )}
    </button>
  )
}

function ProjectModal({ project, onClose, onSaved }: { project: Project | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n()
  const [name, setName] = useState(project?.name ?? '')
  const [client, setClient] = useState(project?.client ?? '')
  const [kind, setKind] = useState<ProjectKind>(project?.kind ?? 'video')
  const [status, setStatus] = useState<ProjectStatus>(project?.status ?? 'active')
  const [deadline, setDeadline] = useState(project?.deadline ?? '')
  const [tools, setTools] = useState<string[]>(project?.tools ?? [])
  const [color, setColor] = useState<string | null>(project?.color ?? null)
  const [description, setDescription] = useState(project?.description ?? '')
  const [saving, setSaving] = useState(false)

  const toggleTool = (tool: string) =>
    setTools((cur) => (cur.includes(tool) ? cur.filter((x) => x !== tool) : [...cur, tool]))

  const save = async () => {
    if (!name.trim() || saving) return
    setSaving(true)
    const data = {
      name: name.trim(),
      client: client.trim() || null,
      kind,
      status,
      deadline: deadline || null,
      tools,
      color,
      description: description.trim() || null,
    }
    try {
      if (project) await window.wist.projects.update(project.id, data)
      else await window.wist.projects.create(data)
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={project ? t('project.edit') : t('project.new')} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-400">{t('project.name')}</label>
          <input
            autoFocus
            className="input"
            placeholder={t('project.namePh')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && save()}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-400">{t('project.client')}</label>
            <input className="input" placeholder={t('project.clientPh')} value={client} onChange={(e) => setClient(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-400">{t('project.deadline')}</label>
            <input type="date" className="input" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-400">{t('project.kind')}</label>
            <select className="select w-full" value={kind} onChange={(e) => setKind(e.target.value as ProjectKind)}>
              {PROJECT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {t(`project.kind.${k}` as 'project.kind.video')}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-400">{t('project.status')}</label>
            <select className="select w-full" value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus)}>
              {PROJECT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`project.status.${s}` as 'project.status.active')}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-zinc-400">{t('project.tools')}</label>
          <div className="flex flex-wrap gap-1.5">
            {PROJECT_TOOLS.map((tool) => (
              <button
                key={tool}
                type="button"
                onClick={() => toggleTool(tool)}
                className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                  tools.includes(tool)
                    ? 'border-accent/50 bg-accent/15 text-accent-bright'
                    : 'border-edge bg-surface text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {t(`project.tool.${tool}` as 'project.tool.other')}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-zinc-400">{t('project.color')}</label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setColor(null)}
              className={`h-6 w-6 rounded-full border-2 text-[10px] text-zinc-500 ${color === null ? 'border-white' : 'border-edge'}`}
              title={t('project.colorAuto')}
            >
              ✕
            </button>
            {PROJECT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`h-6 w-6 rounded-full border-2 transition-transform hover:scale-110 ${color === c ? 'border-white' : 'border-transparent'}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-400">{t('project.description')}</label>
          <textarea
            className="input min-h-[72px] resize-y"
            placeholder={t('project.descriptionPh')}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button className="btn-ghost" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn-accent" disabled={!name.trim() || saving} onClick={save}>
            {project ? t('common.save') : t('project.create')}
          </button>
        </div>
      </div>
    </Modal>
  )
}
