import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  CalendarClock,
  FolderKanban,
  LayoutGrid,
  Columns3,
  List as ListIcon,
  Paperclip,
  Pencil,
  Pin,
  Plus,
  Search,
  Star,
  StickyNote,
  ListTodo,
  Trash2,
} from 'lucide-react'
import EmptyState from '../components/ui/EmptyState'
import { SkeletonTiles } from '../components/ui/Skeleton'
import ProgressRing from '../components/ui/ProgressRing'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import ProjectModal from '../components/ProjectModal'
import ProjectCover from '../components/ProjectCover'
import DragHandle from '../components/ui/DragHandle'
import { liftDragSource } from '../lib/mediaDrag'
import { useProjectStore } from '../store/projectStore'
import { toast } from '../store/toastStore'
import { useFavoritesStore } from '../store/favoritesStore'
import { PROJECT_STATUS_COLORS, PROJECT_STATUSES, type Project, type ProjectStatus } from '../types/models'
import { useI18n } from '../i18n'

// days until a YYYY-MM-DD deadline (negative = overdue)
export function daysUntil(d: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(`${d}T00:00:00`)
  return Math.round((due.getTime() - today.getTime()) / 86_400_000)
}

// completed / total tasks for the progress ring
export function projectProgress(p: Project): { done: number; total: number; pct: number } {
  const total = p.task_count ?? 0
  const open = p.open_task_count ?? 0
  const done = Math.max(0, total - open)
  return { done, total, pct: total > 0 ? done / total : 0 }
}

type ViewMode = 'gallery' | 'board' | 'list'
// the order statuses appear in (active work first, archive last)
const STATUS_ORDER: ProjectStatus[] = ['active', 'review', 'idea', 'done', 'archived']

export default function Projects() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { projects, loading, load } = useProjectStore()
  const [editing, setEditing] = useState<Project | null>(null)
  const [creating, setCreating] = useState(false)
  const [confirm, setConfirm] = useState<Project | null>(null)
  const [query, setQuery] = useState('')
  const [view, setView] = useState<ViewMode>(() => (localStorage.getItem('hubs:view') as ViewMode) || 'gallery')

  const loadFavs = useFavoritesStore((s) => s.load)
  useEffect(() => {
    load()
    loadFavs()
  }, [load, loadFavs])
  useEffect(() => {
    localStorage.setItem('hubs:view', view)
  }, [view])

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
  const setStatus = async (p: Project, status: ProjectStatus) => {
    if (p.status === status) return
    await window.wist.projects.update(p.id, { status })
    load()
  }
  const remove = async () => {
    if (!confirm) return
    await window.wist.projects.remove(confirm.id)
    setConfirm(null)
    load()
    toast(t('project.deleted'), 'success')
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return projects
    return projects.filter((p) =>
      [p.name, p.client, p.kind, ...p.tools].filter(Boolean).some((s) => String(s).toLowerCase().includes(q))
    )
  }, [projects, query])

  const cardProps = (p: Project) => ({
    project: p,
    t,
    onOpen: () => navigate(`/project/${p.id}`),
    onEdit: () => setEditing(p),
    onPin: () => togglePin(p),
    onDelete: () => setConfirm(p),
  })

  if (loading && !projects.length)
    return (
      <div className="page">
        <SkeletonTiles count={6} />
      </div>
    )

  return (
    <div className="page">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="page-title !mb-0 mr-1">{t('nav.projects')}</h1>
        <ViewToggle view={view} setView={setView} t={t} />
        <div className="relative ml-auto">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            className="input !w-56 !py-1.5 !pl-8 text-sm"
            placeholder={t('common.search')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
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
      ) : !filtered.length ? (
        <p className="px-1 py-12 text-center text-sm text-zinc-500">{t('common.noResults')}</p>
      ) : view === 'board' ? (
        <BoardView projects={filtered} t={t} cardProps={cardProps} onSetStatus={setStatus} />
      ) : (
        <GroupedView view={view} projects={filtered} t={t} cardProps={cardProps} />
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
type CardProps = ReturnType<Projects_cardProps>
// helper type only — describes the object cardProps() returns
type Projects_cardProps = (p: Project) => {
  project: Project
  t: TFn
  onOpen: () => void
  onEdit: () => void
  onPin: () => void
  onDelete: () => void
}

function ViewToggle({ view, setView, t }: { view: ViewMode; setView: (v: ViewMode) => void; t: TFn }) {
  const opts: Array<{ id: ViewMode; icon: typeof LayoutGrid; label: string }> = [
    { id: 'gallery', icon: LayoutGrid, label: t('hub.viewGallery') },
    { id: 'board', icon: Columns3, label: t('hub.viewBoard') },
    { id: 'list', icon: ListIcon, label: t('hub.viewList') },
  ]
  return (
    <div className="inline-flex gap-0.5 rounded-lg border border-edge bg-raised p-0.5">
      {opts.map((o) => {
        const Icon = o.icon
        return (
          <button
            key={o.id}
            onClick={() => setView(o.id)}
            title={o.label}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
              view === o.id ? 'bg-card text-white' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Icon size={14} /> <span className="hidden sm:inline">{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}

// --- gallery + list share the same grouping (pinned, then by status) ---
function GroupedView({
  view,
  projects,
  t,
  cardProps,
}: {
  view: ViewMode
  projects: Project[]
  t: TFn
  cardProps: Projects_cardProps
}) {
  const pinned = projects.filter((p) => p.pinned)
  const groups = STATUS_ORDER.map((status) => ({
    status,
    items: projects.filter((p) => !p.pinned && p.status === status),
  })).filter((g) => g.items.length)

  const renderItems = (items: Project[]) =>
    view === 'list' ? (
      <div className="card divide-y divide-edge">
        {items.map((p) => (
          <ListRow key={p.id} {...cardProps(p)} />
        ))}
      </div>
    ) : (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {items.map((p) => (
          <ProjectCard key={p.id} {...cardProps(p)} />
        ))}
      </div>
    )

  return (
    <div className="space-y-8">
      {pinned.length > 0 && (
        <section>
          <GroupLabel icon={<Pin size={12} className="fill-current text-zinc-400" />} label={t('hub.pinned')} count={pinned.length} />
          {renderItems(pinned)}
        </section>
      )}
      {groups.map((g) => (
        <section key={g.status}>
          <GroupLabel
            icon={<span className="h-2 w-2 rounded-full" style={{ backgroundColor: PROJECT_STATUS_COLORS[g.status] }} />}
            label={t(`project.status.${g.status}` as 'project.status.active')}
            count={g.items.length}
          />
          {renderItems(g.items)}
        </section>
      ))}
    </div>
  )
}

function GroupLabel({ icon, label, count }: { icon: React.ReactNode; label: string; count: number }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      {icon}
      <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{label}</h2>
      <span className="text-xs text-zinc-600">{count}</span>
    </div>
  )
}

// --- board: a kanban column per status, drag a card to change its status ---
function BoardView({
  projects,
  t,
  cardProps,
  onSetStatus,
}: {
  projects: Project[]
  t: TFn
  cardProps: Projects_cardProps
  onSetStatus: (p: Project, s: ProjectStatus) => void
}) {
  const [over, setOver] = useState<ProjectStatus | null>(null)
  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {STATUS_ORDER.map((status) => {
        const items = projects.filter((p) => p.status === status)
        return (
          <div
            key={status}
            onDragOver={(e) => {
              e.preventDefault()
              if (over !== status) setOver(status)
            }}
            onDragLeave={(e) => {
              if (e.currentTarget === e.target) setOver(null)
            }}
            onDrop={(e) => {
              e.preventDefault()
              setOver(null)
              const id = Number(e.dataTransfer.getData('text/hub'))
              const p = projects.find((x) => x.id === id)
              if (p) onSetStatus(p, status)
            }}
            className={`flex w-72 shrink-0 flex-col rounded-xl border p-2 transition-colors ${
              over === status ? 'border-accent bg-accent/5' : 'border-edge bg-raised'
            }`}
          >
            <div className="mb-2 flex items-center gap-2 px-2 pt-1">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: PROJECT_STATUS_COLORS[status] }} />
              <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                {t(`project.status.${status}` as 'project.status.active')}
              </span>
              <span className="text-xs text-zinc-600">{items.length}</span>
            </div>
            <div className="flex flex-col gap-2">
              {items.map((p) => (
                <BoardCard key={p.id} {...cardProps(p)} />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ---------- cards ----------

function CardStats({ p, t }: { p: Project; t: TFn }) {
  const left = p.deadline ? daysUntil(p.deadline) : null
  const dueColor = left === null ? '' : left < 0 ? 'text-danger' : left <= 3 ? 'text-st-onhold' : 'text-zinc-400'
  return (
    <div className="flex items-center gap-3 text-[11px] text-zinc-500">
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
          <CalendarClock size={12} /> {left !== null ? t('hub.daysLeft').replace('{n}', String(left)) : p.deadline}
        </span>
      )}
    </div>
  )
}

function ProjectCard({ project: p, t, onOpen, onEdit, onPin, onDelete }: CardProps) {
  const accent = p.color || PROJECT_STATUS_COLORS[p.status]
  const { pct } = projectProgress(p)

  // design-system hubcard: cover band · bold title · "N задач · M заметки" · thin progress bar.
  // Status is conveyed by the gallery group label, so the per-card pill is dropped (calmer card).
  return (
    <button onClick={onOpen} className="tile group relative flex flex-col overflow-hidden !border-edge text-left">
      {p.cover_path ? (
        <ProjectCover cover={p.cover_path} className="h-[66px] w-full shrink-0" />
      ) : (
        <div className="h-[66px] w-full shrink-0" style={{ backgroundImage: `linear-gradient(135deg, ${accent}, ${accent}99)` }} />
      )}
      <div className="flex flex-1 flex-col px-3.5 py-3">
        <b className="truncate text-sm font-bold text-zinc-100">{p.name}</b>
        <div className="mt-0.5 truncate text-xs text-zinc-500">
          {p.task_count ?? 0} {t('hub.tasksShort')} · {p.note_count ?? 0} {t('hub.notesShort')}
        </div>
        <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-edge">
          <div className="h-full rounded-full transition-all" style={{ width: `${Math.round(pct * 100)}%`, backgroundColor: accent }} />
        </div>
      </div>

      <HoverActions p={p} t={t} onEdit={onEdit} onPin={onPin} onDelete={onDelete} />
      {p.pinned && (
        <Pin size={12} className="absolute left-2 top-2.5 fill-current text-zinc-400 opacity-100 group-hover:opacity-0" />
      )}
    </button>
  )
}

function BoardCard({ project: p, t, onOpen, onEdit, onPin, onDelete }: CardProps) {
  const accent = p.color || PROJECT_STATUS_COLORS[p.status]
  const { total, pct } = projectProgress(p)
  const dragged = useRef(false)
  return (
    <div
      draggable
      onMouseDown={() => (dragged.current = false)}
      onDragStart={(e) => {
        dragged.current = true
        e.dataTransfer.setData('text/hub', String(p.id))
        e.dataTransfer.effectAllowed = 'move'
        liftDragSource(e, e.currentTarget)
      }}
      onClick={() => {
        if (dragged.current) return
        onOpen()
      }}
      className="tile group relative cursor-grab overflow-hidden !rounded-xl !border-edge p-3 text-left active:cursor-grabbing"
    >
      <div className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: accent }} />
      <div className="mb-1.5 flex items-start gap-2 pl-1.5">
        <DragHandle className="-ml-0.5" />
        <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-zinc-100">{p.name}</h3>
        {p.pinned && <Pin size={11} className="mt-0.5 shrink-0 fill-current text-zinc-400" />}
      </div>
      {(p.client || p.kind) && <div className="mb-2 truncate pl-1.5 text-[11px] text-zinc-500">{p.client || p.kind}</div>}
      <div className="flex items-center gap-2 pl-1.5">
        {total > 0 && <ProgressRing value={pct} size={22} stroke={3} color={accent} />}
        <CardStats p={p} t={t} />
      </div>
      <HoverActions p={p} t={t} onEdit={onEdit} onPin={onPin} onDelete={onDelete} />
    </div>
  )
}

function ListRow({ project: p, t, onOpen, onEdit, onPin, onDelete }: CardProps) {
  const accent = p.color || PROJECT_STATUS_COLORS[p.status]
  const { done, total, pct } = projectProgress(p)
  const left = p.deadline ? daysUntil(p.deadline) : null
  const dueColor = left === null ? 'text-zinc-500' : left < 0 ? 'text-danger' : left <= 3 ? 'text-st-onhold' : 'text-zinc-500'
  return (
    <div onClick={onOpen} className="group flex cursor-pointer items-center gap-3 px-4 py-2.5 transition-colors hover:bg-highlight">
      <span className="h-7 w-1 shrink-0 rounded-full" style={{ backgroundColor: accent }} />
      {total > 0 ? <ProgressRing value={pct} size={26} stroke={3} color={accent} /> : <span className="w-[26px]" />}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-zinc-200 group-hover:text-white">{p.name}</div>
        <div className="truncate text-[11px] text-zinc-500">{p.client || p.kind}</div>
      </div>
      <span
        className="hidden shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide sm:inline"
        style={{ backgroundColor: `${PROJECT_STATUS_COLORS[p.status]}26`, color: PROJECT_STATUS_COLORS[p.status] }}
      >
        {t(`project.status.${p.status}` as 'project.status.active')}
      </span>
      {total > 0 && <span className="hidden w-14 shrink-0 text-right text-xs text-zinc-500 md:inline">{done}/{total}</span>}
      {p.deadline && <span className={`hidden w-24 shrink-0 text-right text-xs md:inline ${dueColor}`}>{p.deadline}</span>}
      <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        <RowBtn title={t(p.pinned ? 'project.unpin' : 'project.pin')} onClick={onPin} active={!!p.pinned}>
          <Pin size={13} className={p.pinned ? 'fill-current' : ''} />
        </RowBtn>
        <RowBtn title={t('common.edit')} onClick={onEdit}>
          <Pencil size={13} />
        </RowBtn>
        <RowBtn title={t('common.delete')} onClick={onDelete} danger>
          <Trash2 size={13} />
        </RowBtn>
      </div>
    </div>
  )
}

function RowBtn({
  children,
  onClick,
  title,
  danger,
  active,
}: {
  children: React.ReactNode
  onClick: () => void
  title: string
  danger?: boolean
  active?: boolean
}) {
  return (
    <span
      role="button"
      tabIndex={-1}
      title={title}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className={`rounded-lg p-1.5 transition-colors hover:bg-highlight ${
        active ? 'text-zinc-100' : danger ? 'text-zinc-400 hover:text-danger' : 'text-zinc-400 hover:text-white'
      }`}
    >
      {children}
    </span>
  )
}

function HoverActions({
  p,
  t,
  onEdit,
  onPin,
  onDelete,
}: {
  p: Project
  t: TFn
  onEdit: () => void
  onPin: () => void
  onDelete: () => void
}) {
  const toggleFav = useFavoritesStore((s) => s.toggle)
  const fav = useFavoritesStore((s) => s.isPinned('project', p.id))
  return (
    <div className="absolute right-2 top-2.5 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
      <span
        role="button"
        tabIndex={-1}
        onClick={(e) => {
          e.stopPropagation()
          toggleFav({ kind: 'project', ref: p.id, label: p.name, cover_path: p.cover_path, route: `/project/${p.id}` })
        }}
        className={`rounded-lg p-1.5 border border-edge bg-card/80 backdrop-blur-sm transition-colors hover:bg-raised ${fav ? 'text-[var(--c-yellow-text)]' : 'text-zinc-300'}`}
        title={fav ? t('fav.unpin') : t('fav.pin')}
      >
        <Star size={13} className={fav ? 'fill-current' : ''} />
      </span>
      <span
        role="button"
        tabIndex={-1}
        onClick={(e) => {
          e.stopPropagation()
          onPin()
        }}
        className={`rounded-lg p-1.5 border border-edge bg-card/80 backdrop-blur-sm transition-colors hover:bg-raised ${p.pinned ? 'text-zinc-100' : 'text-zinc-300'}`}
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
        className="rounded-lg p-1.5 text-zinc-300 border border-edge bg-card/80 backdrop-blur-sm transition-colors hover:bg-raised hover:text-white"
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
        className="rounded-lg p-1.5 text-zinc-300 border border-edge bg-card/80 backdrop-blur-sm transition-colors hover:bg-raised hover:text-danger"
        title={t('common.delete')}
      >
        <Trash2 size={13} />
      </span>
    </div>
  )
}
