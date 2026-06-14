import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Check,
  ExternalLink,
  Eye,
  FilePlus2,
  FileText,
  FolderOpen,
  FolderPlus,
  ImagePlus,
  Link2,
  ListTodo,
  Pencil,
  Plus,
  StickyNote,
  Trash2,
} from 'lucide-react'
import Spinner from '../components/ui/Spinner'
import Modal from '../components/ui/Modal'
import ProjectModal from '../components/ProjectModal'
import ProjectCover from '../components/ProjectCover'
import { daysUntil } from './Projects'
import { PROJECT_STATUS_COLORS, type Note, type Project, type ProjectAsset, type Task } from '../types/models'
import { useI18n } from '../i18n'

export default function ProjectDetail() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const { id } = useParams()
  const projectId = Number(id)

  const [project, setProject] = useState<Project | null>(null)
  const [assets, setAssets] = useState<ProjectAsset[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [notes, setNotes] = useState<Note[]>([])
  const [newTask, setNewTask] = useState('')
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [linkOpen, setLinkOpen] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const loadProject = useCallback(() => window.wist.projects.get(projectId).then(setProject), [projectId])
  const loadAssets = useCallback(() => window.wist.projects.assets(projectId).then(setAssets), [projectId])
  const loadTasks = useCallback(() => window.wist.tasks.list({ projectId }).then(setTasks), [projectId])
  const loadNotes = useCallback(() => window.wist.notes.list({ projectId }).then(setNotes), [projectId])

  useEffect(() => {
    setLoading(true)
    Promise.all([loadProject(), loadAssets(), loadTasks(), loadNotes()]).finally(() => setLoading(false))
  }, [loadProject, loadAssets, loadTasks, loadNotes])

  const addTask = async () => {
    const title = newTask.trim()
    if (!title) return
    setNewTask('')
    await window.wist.tasks.create({ title, project_id: projectId })
    loadTasks()
  }
  const toggleTask = async (task: Task) => {
    await window.wist.tasks.update(task.id, { done: task.done ? 0 : 1 })
    loadTasks()
  }
  const removeTask = async (task: Task) => {
    await window.wist.tasks.remove(task.id)
    loadTasks()
  }
  const newNote = () => {
    // lazy create: the editor only writes a row once the user types (matches the rest of the app)
    navigate(`/notes?new=1&project=${projectId}`)
  }

  const addFiles = async () => {
    if (await window.wist.projects.addFiles(projectId)) loadAssets()
  }
  const addFolder = async () => {
    if (await window.wist.projects.addFolder(projectId)) loadAssets()
  }
  const addImages = async () => {
    if (await window.wist.projects.addImages(projectId)) loadAssets()
  }
  const removeAsset = async (assetId: number) => {
    await window.wist.projects.removeAsset(assetId)
    loadAssets()
  }

  const openAsset = (a: ProjectAsset) => {
    if (a.kind === 'url' && a.url) window.wist.shell.openExternal(a.url)
    else if (a.path) window.wist.vault.open(a.path)
  }

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const paths = Array.from(e.dataTransfer.files)
      .map((f) => window.wist.util.pathForFile(f))
      .filter(Boolean)
    if (paths.length && (await window.wist.projects.addPaths(projectId, paths))) loadAssets()
  }

  if (loading) return <Spinner />
  if (!project) {
    return (
      <div className="page">
        <button className="btn-ghost mb-4" onClick={() => navigate('/projects')}>
          <ArrowLeft size={15} /> {t('nav.projects')}
        </button>
        <p className="text-zinc-500">{t('project.notFound')}</p>
      </div>
    )
  }

  const accent = project.color || PROJECT_STATUS_COLORS[project.status]
  const left = project.deadline ? daysUntil(project.deadline) : null
  const dueColor = left === null ? 'text-zinc-400' : left < 0 ? 'text-red-400' : left <= 3 ? 'text-amber-400' : 'text-zinc-400'

  const images = assets.filter((a) => a.kind === 'image')
  const links = assets.filter((a) => a.kind === 'url')
  const files = assets.filter((a) => a.kind === 'file' || a.kind === 'folder')

  return (
    <div
      className="page relative"
      onDragOver={(e) => {
        e.preventDefault()
        if (!dragOver) setDragOver(true)
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragOver(false)
      }}
      onDrop={onDrop}
    >
      {dragOver && (
        <div className="pointer-events-none absolute inset-2 z-10 flex items-center justify-center rounded-2xl border-2 border-dashed border-accent/60 bg-accent/5 text-sm font-medium text-accent-bright">
          {t('project.dropHint')}
        </div>
      )}

      {/* header */}
      <button className="btn-ghost mb-4 !px-2" onClick={() => navigate('/projects')}>
        <ArrowLeft size={15} /> {t('nav.projects')}
      </button>

      {project.cover_path && (
        <ProjectCover cover={project.cover_path} className="mb-5 h-44 w-full rounded-2xl border border-edge/60" />
      )}

      <div className="mb-6 flex items-start gap-3">
        <div className="mt-1 h-10 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: accent }} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <h1 className="truncate text-2xl font-bold text-zinc-100">{project.name}</h1>
            <span
              className="shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
              style={{ backgroundColor: `${PROJECT_STATUS_COLORS[project.status]}26`, color: PROJECT_STATUS_COLORS[project.status] }}
            >
              {t(`project.status.${project.status}` as 'project.status.active')}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-zinc-500">
            {project.kind && <span>{project.kind}</span>}
            {project.client && <span>{project.client}</span>}
            {project.deadline && <span className={dueColor}>{project.deadline}</span>}
          </div>
        </div>
        <button className="btn-ghost shrink-0" onClick={() => setEditing(true)}>
          <Pencil size={15} /> {t('common.edit')}
        </button>
      </div>

      {project.tools.length > 0 && (
        <div className="mb-5 flex flex-wrap gap-1.5">
          {project.tools.map((tool) => (
            <span key={tool} className="rounded-md bg-raised px-2 py-0.5 text-xs font-medium text-zinc-400">
              {tool}
            </span>
          ))}
        </div>
      )}

      {project.description && (
        <p className="mb-6 max-w-3xl whitespace-pre-wrap text-sm leading-relaxed text-zinc-400">{project.description}</p>
      )}

      {/* references toolbar */}
      <div className="mb-5 flex items-center justify-between border-t border-edge/50 pt-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">{t('project.references')}</h2>
        <div className="flex flex-wrap gap-1.5">
          <button className="btn-ghost !py-1.5 text-xs" onClick={addFiles}>
            <FilePlus2 size={14} /> {t('project.addFiles')}
          </button>
          <button className="btn-ghost !py-1.5 text-xs" onClick={addFolder}>
            <FolderPlus size={14} /> {t('project.addFolder')}
          </button>
          <button className="btn-ghost !py-1.5 text-xs" onClick={addImages}>
            <ImagePlus size={14} /> {t('project.addImages')}
          </button>
          <button className="btn-ghost !py-1.5 text-xs" onClick={() => setLinkOpen(true)}>
            <Link2 size={14} /> {t('project.addLink')}
          </button>
        </div>
      </div>

      {!assets.length ? (
        <div className="rounded-2xl border-2 border-dashed border-edge/60 px-6 py-14 text-center">
          <FolderOpen size={32} className="mx-auto mb-3 text-zinc-600" />
          <div className="text-sm font-medium text-zinc-300">{t('project.noAssets')}</div>
          <div className="mt-1 text-xs text-zinc-500">{t('project.noAssetsSub')}</div>
        </div>
      ) : (
        <div className="space-y-7">
          {/* image board */}
          {images.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {images.map((a) => (
                <div key={a.id} className="group relative aspect-square overflow-hidden rounded-xl border border-edge/60 bg-raised">
                  {a.path && (
                    <img
                      src={window.wist.media.fileUrl(a.path)}
                      alt={a.label ?? ''}
                      loading="lazy"
                      onClick={() => openAsset(a)}
                      className="h-full w-full cursor-pointer object-cover transition-transform duration-200 group-hover:scale-[1.03]"
                    />
                  )}
                  <button
                    onClick={() => removeAsset(a.id)}
                    className="absolute right-1.5 top-1.5 rounded-md bg-black/60 p-1 text-zinc-200 opacity-0 transition-all hover:text-red-400 group-hover:opacity-100"
                    title={t('project.removeAsset')}
                  >
                    <Trash2 size={13} />
                  </button>
                  {a.label && (
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/80 to-transparent px-2 pb-1.5 pt-4 text-[10px] text-zinc-200">
                      {a.label}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* files & folders */}
          {files.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-600">{t('project.files')}</h3>
              <div className="card divide-y divide-edge/40">
                {files.map((a) => (
                  <AssetRow key={a.id} asset={a} t={t} onOpen={() => openAsset(a)} onRemove={() => removeAsset(a.id)} />
                ))}
              </div>
            </div>
          )}

          {/* links */}
          {links.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-600">{t('project.links')}</h3>
              <div className="card divide-y divide-edge/40">
                {links.map((a) => (
                  <AssetRow key={a.id} asset={a} t={t} onOpen={() => openAsset(a)} onRemove={() => removeAsset(a.id)} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* tasks + notes */}
      <div className="mt-9 grid grid-cols-1 gap-7 lg:grid-cols-2">
        {/* tasks */}
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">{t('nav.tasks')}</h2>
          <div className="mb-3 flex gap-2">
            <input
              className="input !py-2 text-sm"
              placeholder={t('tasks.placeholder')}
              value={newTask}
              onChange={(e) => setNewTask(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addTask()}
            />
            <button className="btn-accent shrink-0 !px-3" onClick={addTask}>
              <Plus size={16} />
            </button>
          </div>
          {!tasks.length ? (
            <p className="px-1 text-xs text-zinc-600">{t('project.noTasks')}</p>
          ) : (
            <div className="card divide-y divide-edge/40">
              {tasks.map((task) => (
                <div key={task.id} className="group flex items-center gap-3 px-4 py-2.5">
                  <button
                    onClick={() => toggleTask(task)}
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                      task.done ? 'border-accent bg-accent text-[#fff]' : 'border-edge text-transparent hover:border-accent'
                    }`}
                  >
                    <Check size={12} />
                  </button>
                  <span className={`min-w-0 flex-1 truncate text-sm ${task.done ? 'text-zinc-600 line-through decoration-zinc-700' : 'text-zinc-200'}`}>
                    {task.title}
                  </span>
                  <button
                    className="shrink-0 rounded-lg p-1.5 text-zinc-600 opacity-0 transition-all hover:text-red-400 group-hover:opacity-100"
                    onClick={() => removeTask(task)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* notes */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">{t('nav.notes')}</h2>
            <button className="btn-ghost !py-1.5 text-xs" onClick={newNote}>
              <Plus size={14} /> {t('project.newNote')}
            </button>
          </div>
          {!notes.length ? (
            <p className="px-1 text-xs text-zinc-600">{t('project.noNotes')}</p>
          ) : (
            <div className="space-y-2">
              {notes.map((n) => {
                const label = n.title.trim() || n.content.trim().split('\n')[0].slice(0, 80) || '—'
                return (
                  <button
                    key={n.id}
                    onClick={() => navigate(`/notes?open=${n.id}`)}
                    className="card group flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:border-edge"
                  >
                    <StickyNote size={15} className="mt-0.5 shrink-0 text-accent-bright" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-zinc-200 group-hover:text-white">{label}</div>
                      {n.content.trim() && <div className="line-clamp-1 text-xs text-zinc-500">{n.content.trim()}</div>}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </section>
      </div>

      {editing && (
        <ProjectModal
          project={project}
          onClose={() => setEditing(false)}
          onSaved={(saved) => {
            setProject(saved)
            setEditing(false)
          }}
        />
      )}

      {linkOpen && (
        <AddLinkModal
          onClose={() => setLinkOpen(false)}
          onAdd={async (url, label) => {
            await window.wist.projects.addUrl(projectId, url, label)
            setLinkOpen(false)
            loadAssets()
          }}
        />
      )}
    </div>
  )
}

type TFn = ReturnType<typeof useI18n>['t']

function AssetRow({ asset: a, t, onOpen, onRemove }: { asset: ProjectAsset; t: TFn; onOpen: () => void; onRemove: () => void }) {
  const Icon = a.kind === 'folder' ? FolderOpen : a.kind === 'url' ? Link2 : FileText
  const sub = a.kind === 'url' ? a.url : a.path
  return (
    <div className="group flex items-center gap-3 px-4 py-2.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-raised text-accent-bright">
        <Icon size={17} />
      </span>
      <button onClick={onOpen} className="min-w-0 flex-1 text-left">
        <div className="truncate text-sm font-medium text-zinc-200 group-hover:text-white">{a.label || sub}</div>
        {sub && <div className="truncate text-xs text-zinc-600">{sub}</div>}
      </button>
      <button
        onClick={onOpen}
        className="shrink-0 rounded-lg p-1.5 text-zinc-500 opacity-0 transition-all hover:text-zinc-200 group-hover:opacity-100"
        title={t('project.open')}
      >
        {a.kind === 'url' ? <ExternalLink size={15} /> : <FolderOpen size={15} />}
      </button>
      {a.kind !== 'url' && a.path && (
        <button
          onClick={() => window.wist.shell.showItemInFolder(a.path!)}
          className="shrink-0 rounded-lg p-1.5 text-zinc-500 opacity-0 transition-all hover:text-zinc-200 group-hover:opacity-100"
          title={t('project.reveal')}
        >
          <Eye size={15} />
        </button>
      )}
      <button
        onClick={onRemove}
        className="shrink-0 rounded-lg p-1.5 text-zinc-600 opacity-0 transition-all hover:text-red-400 group-hover:opacity-100"
        title={t('project.removeAsset')}
      >
        <Trash2 size={14} />
      </button>
    </div>
  )
}

function AddLinkModal({ onClose, onAdd }: { onClose: () => void; onAdd: (url: string, label: string | null) => void }) {
  const { t } = useI18n()
  const [url, setUrl] = useState('')
  const [label, setLabel] = useState('')
  const submit = () => {
    const u = url.trim()
    if (!u) return
    onAdd(u, label.trim() || null)
  }
  return (
    <Modal title={t('project.addLinkTitle')} onClose={onClose} width="max-w-md">
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-400">{t('project.linkUrl')}</label>
          <input
            autoFocus
            className="input"
            placeholder={t('project.linkUrlPh')}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-400">{t('project.linkLabel')}</label>
          <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn-accent" disabled={!url.trim()} onClick={submit}>
            {t('common.add')}
          </button>
        </div>
      </div>
    </Modal>
  )
}
