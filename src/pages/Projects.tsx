import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  BookOpen,
  CalendarClock,
  Columns3,
  Compass,
  History,
  LayoutGrid,
  List as ListIcon,
  ListTodo,
  Paperclip,
  Pencil,
  Pin,
  Plus,
  Search,
  Sparkles,
  Star,
  StickyNote,
  Target,
  Trash2,
} from 'lucide-react'
import { SkeletonTiles } from '../components/ui/Skeleton'
import ProgressRing from '../components/ui/ProgressRing'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import ProjectModal from '../components/ProjectModal'
import DragHandle from '../components/ui/DragHandle'
import { liftDragSource } from '../lib/mediaDrag'
import { useProjectStore } from '../store/projectStore'
import { toast } from '../store/toastStore'
import { useFavoritesStore } from '../store/favoritesStore'
import { PROJECT_STATUS_COLORS, hubColor, type HubRecentItem, type Project, type ProjectStatus } from '../types/models'
import { DATE_LOCALE, useI18n } from '../i18n'
import { daysUntil, timeAgo } from '../lib/date'
import { updateProject, removeProject } from '../data/projects'

// completed / total tasks for the progress ring (board + list views)
export function projectProgress(p: Project): { done: number; total: number; pct: number } {
  const total = p.task_count ?? 0
  const open = p.open_task_count ?? 0
  const done = Math.max(0, total - open)
  return { done, total, pct: total > 0 ? done / total : 0 }
}

type ViewMode = 'gallery' | 'board' | 'list'
// board groups by status (the structured/pipeline view); gallery + list lead by recency
const STATUS_ORDER: ProjectStatus[] = ['active', 'review', 'idea', 'done', 'archived']

// newest first, by the hub's true last activity (own stamp or freshest inner item)
const byRecency = (a: Project, b: Project) =>
  (b.last_activity || b.updated_at).localeCompare(a.last_activity || a.updated_at)

export default function Projects() {
  const { t, tn, lang } = useI18n()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { projects, loading, load } = useProjectStore()
  const [editing, setEditing] = useState<Project | null>(null)
  const [creating, setCreating] = useState(false)
  const [seed, setSeed] = useState<Partial<Project> | null>(null)
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

  const openCreate = (s?: Partial<Project> | null) => {
    setSeed(s ?? null)
    setCreating(true)
  }

  const togglePin = async (p: Project) => {
    await updateProject(p.id, { pinned: p.pinned ? 0 : 1 })
    load()
  }
  const setStatus = async (p: Project, status: ProjectStatus) => {
    if (p.status === status) return
    await updateProject(p.id, { status })
    load()
  }
  const remove = async () => {
    if (!confirm) return
    await removeProject(confirm.id)
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

  // "Продолжить" rail — the freshest hubs, a quick way back into recent work.
  // Only worth showing once there are enough hubs that scanning the grid is slower.
  const recentHubs = useMemo(() => [...projects].sort(byRecency).slice(0, 4), [projects])

  // one-line orientation: weekday + date · pluralized hub count
  const subline = useMemo(() => {
    const date = new Date().toLocaleDateString(DATE_LOCALE[lang], { weekday: 'long', day: 'numeric', month: 'long' })
    const cap = date.charAt(0).toUpperCase() + date.slice(1)
    return `${cap} · ${tn('hub.hubsCount', projects.length)}`
  }, [projects.length, lang, tn])

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
      <div className="hubs-skin min-h-full bg-bg">
        <div className="page">
          <SkeletonTiles count={6} />
        </div>
      </div>
    )

  return (
    <div className="hubs-skin min-h-full bg-bg">
      <div className="page">
        {/* header — editorial serif title + orientation line, then tools on the right */}
        <div className="mb-7 flex flex-wrap items-end gap-x-4 gap-y-3">
          <div className="mr-auto">
            <h1 className="hub-serif text-[34px] leading-none text-zinc-100">{t('hub.title')}</h1>
            {!!projects.length && <div className="mt-2 text-[13px] text-zinc-400">{subline}</div>}
          </div>
          {!!projects.length && (
            <>
              <div className="relative">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  className="input !w-52 !py-1.5 !pl-8 text-sm"
                  placeholder={t('hub.searchPh')}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <ViewToggle view={view} setView={setView} t={t} />
            </>
          )}
          <button className="btn-accent" onClick={() => openCreate()}>
            <Plus size={16} /> {t('project.new')}
          </button>
        </div>

        {!projects.length ? (
          <HubEmptyState t={t} onBlank={() => openCreate()} onTemplate={(s) => openCreate(s)} />
        ) : (
          <>
            {!query && recentHubs.length >= 4 && (
              <ContinueRail items={recentHubs} t={t} onOpen={(p) => navigate(`/project/${p.id}`)} />
            )}
            {!filtered.length ? (
              <p className="px-1 py-12 text-center text-sm text-zinc-500">{t('common.noResults')}</p>
            ) : view === 'board' ? (
              <BoardView projects={filtered} t={t} cardProps={cardProps} onSetStatus={setStatus} />
            ) : (
              <RecencyView view={view} projects={filtered} t={t} cardProps={cardProps} />
            )}
          </>
        )}
      </div>

      {(creating || editing) && (
        <ProjectModal
          project={editing}
          seed={seed}
          onClose={() => {
            setCreating(false)
            setEditing(null)
            setSeed(null)
          }}
          onSaved={() => {
            setCreating(false)
            setEditing(null)
            setSeed(null)
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

// the round-cornered identity tile: emoji if set, else a serif monogram, on a soft
// tint of the hub's colour. `sm` is the compact size used in the Continue rail.
function HubIcon({ p, size = 'md' }: { p: Project; size?: 'sm' | 'md' }) {
  const color = hubColor(p)
  const dim = size === 'sm' ? 'h-9 w-9 text-base' : 'h-11 w-11 text-xl'
  const letter = (p.name.trim().charAt(0) || '•').toUpperCase()
  return (
    <div
      className={`flex ${dim} shrink-0 items-center justify-center rounded-xl`}
      style={{ backgroundColor: `${color}24`, color }}
    >
      {p.icon ? <span className="leading-none">{p.icon}</span> : <span className="hub-serif leading-none">{letter}</span>}
    </div>
  )
}

// dot colour for a pulse item: notes carry the hub's identity colour; open tasks
// glow terracotta; finished tasks fade.
function pulseDotColor(it: HubRecentItem, hub: string): string {
  if (it.kind === 'task') return it.done ? 'rgb(var(--ink-700))' : '#c4622d'
  return hub
}

// ---------- the PKM hub card: identity · type · pulse · last activity ----------
function HubCard({ project: p, t, onOpen, onEdit, onPin, onDelete }: CardProps) {
  const color = hubColor(p)
  const recent = p.recent ?? []
  const notes = p.note_count ?? 0
  const openTasks = p.open_task_count ?? 0
  return (
    <button
      onClick={onOpen}
      className="group relative flex flex-col rounded-2xl border border-edge bg-card p-4 text-left shadow-[var(--card-shadow)] transition-all duration-150 hover:-translate-y-0.5 hover:border-accent/40 hover:bg-raised hover:shadow-[var(--card-shadow-hover)]"
    >
      <div className="flex items-center gap-3">
        <HubIcon p={p} />
        <div className="min-w-0 flex-1">
          <div className="hub-serif truncate text-[19px] leading-tight text-zinc-100">{p.name}</div>
          <div className="truncate text-xs text-zinc-400">{p.kind?.trim() || t('hub.typeGeneric')}</div>
        </div>
      </div>

      {/* pulse — the freshest items inside, so the hub reads as alive, not a folder */}
      {recent.length > 0 ? (
        <div className="mt-3 flex flex-col gap-1.5 border-t border-edge pt-3">
          {recent.map((it) => (
            <div key={`${it.kind}-${it.id}`} className="flex items-center gap-2 text-[12.5px]">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: pulseDotColor(it, color) }} />
              <span className={`min-w-0 flex-1 truncate ${it.done ? 'text-zinc-500 line-through' : 'text-zinc-300'}`}>
                {it.title?.trim() || t('hub.untitledItem')}
              </span>
              <span className="shrink-0 text-[11px] text-zinc-600">{timeAgo(it.at, t)}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-3 border-t border-edge pt-3 text-[12.5px] italic text-zinc-600">{t('hub.pulseEmpty')}</div>
      )}

      {/* footer — counts at a glance (icon+number, language-neutral) + last touched */}
      <div className="mt-3 flex items-center gap-3 text-[11.5px] text-zinc-600">
        <span className="flex items-center gap-1" title={t('project.statNotes')}>
          <StickyNote size={12} /> {notes}
        </span>
        {openTasks > 0 && (
          <span className="flex items-center gap-1" title={t('project.statTasks')}>
            <ListTodo size={12} /> {openTasks}
          </span>
        )}
        <span className="ml-auto">{t('hub.editedAgo', { x: timeAgo(p.last_activity, t) })}</span>
      </div>

      <HoverActions p={p} t={t} onEdit={onEdit} onPin={onPin} onDelete={onDelete} />
    </button>
  )
}

// the Continue rail — compact chips for the most recently touched hubs
function ContinueRail({ items, t, onOpen }: { items: Project[]; t: TFn; onOpen: (p: Project) => void }) {
  return (
    <section className="mb-7">
      <SectionLabel icon={<History size={12} className="text-zinc-500" />} label={t('hub.continue')} />
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((p) => (
          <button
            key={p.id}
            onClick={() => onOpen(p)}
            className="flex items-center gap-2.5 rounded-xl border border-edge bg-card px-3 py-2.5 text-left transition-colors hover:border-accent/40 hover:bg-raised"
          >
            <HubIcon p={p} size="sm" />
            <div className="min-w-0">
              <div className="truncate text-[13px] font-medium text-zinc-100">{p.name}</div>
              <div className="truncate text-[11px] text-zinc-500">{timeAgo(p.last_activity, t)}</div>
            </div>
          </button>
        ))}
      </div>
    </section>
  )
}

// gallery + list, led by recency: pinned first, then everything by last activity
function RecencyView({
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
  const sorted = [...projects].sort(byRecency)
  const pinned = sorted.filter((p) => p.pinned)
  const rest = sorted.filter((p) => !p.pinned)

  const renderItems = (items: Project[]) =>
    view === 'list' ? (
      <div className="card divide-y divide-edge">
        {items.map((p) => (
          <ListRow key={p.id} {...cardProps(p)} />
        ))}
      </div>
    ) : (
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((p) => (
          <HubCard key={p.id} {...cardProps(p)} />
        ))}
      </div>
    )

  return (
    <div className="space-y-7">
      {pinned.length > 0 && (
        <section>
          <SectionLabel icon={<Pin size={12} className="fill-current text-zinc-400" />} label={t('hub.pinned')} count={pinned.length} />
          {renderItems(pinned)}
        </section>
      )}
      {rest.length > 0 && (
        <section>
          {pinned.length > 0 && <SectionLabel label={t('hub.allHubs')} count={rest.length} />}
          {renderItems(rest)}
        </section>
      )}
    </div>
  )
}

function SectionLabel({ icon, label, count }: { icon?: React.ReactNode; label: string; count?: number }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      {icon}
      <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{label}</h2>
      {count !== undefined && <span className="text-xs text-zinc-600">{count}</span>}
    </div>
  )
}

// inviting empty state — an editorial headline + starter templates that pre-seed the
// create modal, so the first hub is one click and a name away.
function HubEmptyState({
  t,
  onBlank,
  onTemplate,
}: {
  t: TFn
  onBlank: () => void
  onTemplate: (seed: Partial<Project>) => void
}) {
  const tpls: Array<{ icon: typeof Compass; color: string; kind: string; title: string; desc: string }> = [
    { icon: Compass, color: '#8a9a5b', kind: t('hub.tplAreaKind'), title: t('hub.tplAreaTitle'), desc: t('hub.tplAreaDesc') },
    { icon: Target, color: '#c4622d', kind: t('hub.tplProjectKind'), title: t('hub.tplProjectTitle'), desc: t('hub.tplProjectDesc') },
    { icon: BookOpen, color: '#c89a3c', kind: t('hub.tplResourceKind'), title: t('hub.tplResourceTitle'), desc: t('hub.tplResourceDesc') },
  ]
  return (
    <div className="mx-auto max-w-2xl py-12 text-center animate-fade-in">
      <div className="mx-auto mb-5 flex h-14 w-14 animate-pop-in items-center justify-center rounded-2xl bg-raised ring-1 ring-edge">
        <Sparkles size={24} className="text-accent" />
      </div>
      <h2 className="hub-serif text-[30px] leading-tight text-zinc-100">{t('hub.emptyTitle')}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-zinc-400">{t('hub.emptySubtitle')}</p>

      <div className="mt-7 grid gap-3 sm:grid-cols-3">
        {tpls.map((tpl) => {
          const Icon = tpl.icon
          return (
            <button
              key={tpl.kind}
              onClick={() => onTemplate({ kind: tpl.kind, color: tpl.color })}
              className="group flex flex-col items-start rounded-2xl border border-edge bg-card p-4 text-left transition-all hover:-translate-y-0.5 hover:border-accent/40 hover:bg-raised hover:shadow-[var(--card-shadow-hover)]"
            >
              <div
                className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl"
                style={{ backgroundColor: `${tpl.color}24`, color: tpl.color }}
              >
                <Icon size={18} />
              </div>
              <div className="hub-serif text-[17px] leading-tight text-zinc-100">{tpl.title}</div>
              <div className="mt-1 text-xs leading-relaxed text-zinc-500">{tpl.desc}</div>
            </button>
          )
        })}
      </div>

      <button
        onClick={onBlank}
        className="mt-5 inline-flex items-center gap-1.5 text-sm text-zinc-400 transition-colors hover:text-zinc-200"
      >
        <Plus size={15} /> {t('hub.emptyBlank')}
      </button>
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

// ---------- cards (board + list) ----------

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
          <CalendarClock size={12} /> {left !== null ? t('hub.daysLeft', { n: left }) : p.deadline}
        </span>
      )}
    </div>
  )
}

function BoardCard({ project: p, t, onOpen, onEdit, onPin, onDelete }: CardProps) {
  const accent = hubColor(p)
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
  const accent = hubColor(p)
  return (
    <div onClick={onOpen} className="group flex cursor-pointer items-center gap-3 px-4 py-2.5 transition-colors hover:bg-highlight">
      <HubIcon p={p} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-zinc-200 group-hover:text-white">{p.name}</div>
        <div className="truncate text-[11px] text-zinc-500">{p.kind?.trim() || t('hub.typeGeneric')}</div>
      </div>
      <span className="hidden shrink-0 items-center gap-3 text-[11px] text-zinc-500 sm:flex">
        <span className="flex items-center gap-1" title={t('project.statNotes')}>
          <StickyNote size={11} /> {p.note_count ?? 0}
        </span>
        {(p.open_task_count ?? 0) > 0 && (
          <span className="flex items-center gap-1" title={t('project.statTasks')}>
            <ListTodo size={11} /> {p.open_task_count}
          </span>
        )}
      </span>
      <span className="hidden w-20 shrink-0 text-right text-[11px] text-zinc-600 md:inline">{timeAgo(p.last_activity, t)}</span>
      <span className="h-7 w-1 shrink-0 rounded-full" style={{ backgroundColor: accent }} />
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
    <div className="absolute right-2.5 top-2.5 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
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
