import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { CalendarClock, FolderKanban, Paperclip, Pencil, Pin, Plus, StickyNote, ListTodo, Trash2 } from 'lucide-react'
import EmptyState from '../components/ui/EmptyState'
import Spinner from '../components/ui/Spinner'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import ProjectModal from '../components/ProjectModal'
import { useProjectStore } from '../store/projectStore'
import { toast } from '../store/toastStore'
import { PROJECT_STATUS_COLORS, type Project } from '../types/models'
import { useI18n } from '../i18n'

// days until a YYYY-MM-DD deadline (negative = overdue)
export function daysUntil(d: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(`${d}T00:00:00`)
  return Math.round((due.getTime() - today.getTime()) / 86_400_000)
}

export default function Projects() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { projects, loading, load } = useProjectStore()
  const [editing, setEditing] = useState<Project | null>(null)
  const [creating, setCreating] = useState(false)
  const [confirm, setConfirm] = useState<Project | null>(null)

  useEffect(() => {
    load()
  }, [load])

  // command palette deep link: /projects?new=1 opens the create modal
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setCreating(true)
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams])

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
            <ProjectCard
              key={p.id}
              project={p}
              t={t}
              onOpen={() => navigate(`/project/${p.id}`)}
              onEdit={() => setEditing(p)}
              onPin={() => togglePin(p)}
              onDelete={() => setConfirm(p)}
            />
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
  onOpen,
  onEdit,
  onPin,
  onDelete,
}: {
  project: Project
  t: TFn
  onOpen: () => void
  onEdit: () => void
  onPin: () => void
  onDelete: () => void
}) {
  const accent = p.color || PROJECT_STATUS_COLORS[p.status]
  const left = p.deadline ? daysUntil(p.deadline) : null
  const dueColor = left === null ? '' : left < 0 ? 'text-red-400' : left <= 3 ? 'text-amber-400' : 'text-zinc-400'

  return (
    <button
      onClick={onOpen}
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
