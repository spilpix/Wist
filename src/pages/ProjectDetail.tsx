import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Eye,
  FilePlus2,
  FileText,
  FolderOpen,
  FolderPlus,
  GitCommitVertical,
  GripVertical,
  History,
  ImagePlus,
  LayoutGrid,
  Link2,
  ListTodo,
  Pencil,
  Pin,
  Plus,
  PlayCircle,
  Settings2,
  Share2,
  StickyNote,
  Trash2,
  X,
} from 'lucide-react'
import Spinner from '../components/ui/Spinner'
import Modal from '../components/ui/Modal'
import ProgressRing from '../components/ui/ProgressRing'
import ProjectModal from '../components/ProjectModal'
import ProjectCover from '../components/ProjectCover'
import FolderViewer from '../components/FolderViewer'
import HubShareModal from '../components/HubShareModal'
import HubGraph from '../components/HubGraph'
import Relations from '../components/Relations'
import HubSessions from '../components/HubSessions'
import HubFocus from '../components/hub/HubFocus'
import HubPatches from '../components/hub/HubPatches'
import HubTasks from '../components/hub/HubTasks'
import TaskListRow from '../components/TaskListRow'
import TaskDetailModal from '../components/TaskDetailModal'
import { AssetTile, AssetRow } from './project/AssetItems'
import { Overview } from './project/Overview'
import { FilesWorkspace } from './project/FilesWorkspace'
import { Plans } from './project/Plans'
import { Hero } from './project/Hero'
import { HubTabBar, CustomizePanel } from './project/HubTabBar'
import {
  PATCH_STATUS_COLORS,
  PROJECT_STATUSES,
  PROJECT_STATUS_COLORS,
  type Note,
  type Project,
  type ProjectAsset,
  type ProjectPatch,
  type ProjectSection,
  type ProjectSession,
  type ProjectStatus,
  type Task,
} from '../types/models'
import {
  ALL_HUB_TABS,
  ALL_HUB_WIDGETS,
  DEFAULT_HUB_TABS,
  DEFAULT_HUB_WIDGETS,
  loadHubTabs,
  loadHubWidgets,
  saveHubTabs,
  saveHubWidgets,
  type HubTabId,
  type HubWidgetId,
} from '../lib/hubConfig'
import { useTabTitle } from '../store/tabStore'
import { dragHasDroppable, readMediaDrag, type MediaDragItem } from '../lib/mediaDrag'
import { useSortable } from '../lib/useSortable'
import { useI18n } from '../i18n'

type TFn = ReturnType<typeof useI18n>['t']

// TAB_META lives in ./project/HubTabBar

export default function ProjectDetail() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const { id } = useParams()
  const projectId = Number(id)

  const [project, setProject] = useState<Project | null>(null)
  useTabTitle(project?.name)
  const [assets, setAssets] = useState<ProjectAsset[]>([])
  const [sections, setSections] = useState<ProjectSection[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [notes, setNotes] = useState<Note[]>([])
  const [sessions, setSessions] = useState<ProjectSession[]>([])
  const [patches, setPatches] = useState<ProjectPatch[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [linkOpen, setLinkOpen] = useState<{ sectionId: number | null } | null>(null)
  const [folderView, setFolderView] = useState<{ path: string; label: string } | null>(null)
  const [shareOpen, setShareOpen] = useState(false)
  const [taskDetail, setTaskDetail] = useState<Task | null>(null)
  const [dragOver, setDragOver] = useState(false)

  // per-hub layout config
  const [tabs, setTabs] = useState<HubTabId[]>(() => loadHubTabs(projectId))
  const [widgets, setWidgets] = useState<HubWidgetId[]>(() => loadHubWidgets(projectId))
  const [tab, setTab] = useState<HubTabId>(() => loadHubTabs(projectId)[0] ?? 'overview')
  const [customizing, setCustomizing] = useState(false)
  // signals that focus a sub-tab's input / open its create modal from the global Add menu
  const [taskSignal, setTaskSignal] = useState(0)
  const [patchSignal, setPatchSignal] = useState(0)

  // re-read config when switching between hubs
  useEffect(() => {
    const tb = loadHubTabs(projectId)
    setTabs(tb)
    setWidgets(loadHubWidgets(projectId))
    setTab((cur) => (tb.includes(cur) ? cur : tb[0] ?? 'overview'))
  }, [projectId])

  // keep the active tab valid as the enabled set changes
  useEffect(() => {
    if (!tabs.includes(tab)) setTab(tabs[0] ?? 'overview')
  }, [tabs, tab])

  const setTabsPersist = (next: HubTabId[]) => {
    setTabs(next)
    saveHubTabs(projectId, next)
  }
  const setWidgetsPersist = (next: HubWidgetId[]) => {
    setWidgets(next)
    saveHubWidgets(projectId, next)
  }

  // a native drag never fires our React drop (it bubbles past the overlay) — so clear
  // the "drop here" overlay on any window-level drop/dragend to avoid it getting stuck
  useEffect(() => {
    const clear = () => setDragOver(false)
    window.addEventListener('drop', clear)
    window.addEventListener('dragend', clear)
    return () => {
      window.removeEventListener('drop', clear)
      window.removeEventListener('dragend', clear)
    }
  }, [])

  const loadProject = useCallback(() => window.wist.projects.get(projectId).then(setProject), [projectId])
  const loadAssets = useCallback(() => window.wist.projects.assets(projectId).then(setAssets), [projectId])
  const loadSections = useCallback(() => window.wist.projects.sections(projectId).then(setSections), [projectId])
  const loadTasks = useCallback(() => window.wist.tasks.list({ projectId }).then(setTasks), [projectId])
  const loadNotes = useCallback(() => window.wist.notes.list({ projectId }).then(setNotes), [projectId])
  const loadSessions = useCallback(() => window.wist.projects.sessions(projectId).then(setSessions).catch(() => setSessions([])), [projectId])
  const loadPatches = useCallback(() => window.wist.projects.patches(projectId).then(setPatches).catch(() => setPatches([])), [projectId])

  useEffect(() => {
    setLoading(true)
    Promise.all([loadProject(), loadAssets(), loadSections(), loadTasks(), loadNotes(), loadSessions(), loadPatches()]).finally(() =>
      setLoading(false)
    )
  }, [loadProject, loadAssets, loadSections, loadTasks, loadNotes, loadSessions, loadPatches])

  // keep the hub reactive: refresh the affected lists when anything mutates elsewhere
  // (the quick-add popover, the agent API, patch/task/note edits in their own tabs)
  useEffect(() => {
    const off = window.wist.events.onDataChanged((kind) => {
      if (kind === 'tasks') loadTasks()
      else if (kind === 'notes') loadNotes()
      else if (kind === 'projects') {
        loadProject()
        loadPatches()
      }
    })
    return off
  }, [loadTasks, loadNotes, loadProject, loadPatches])

  // ---- asset ops ----
  const addFiles = async (sectionId: number | null) => {
    if (await window.wist.projects.addFiles(projectId, sectionId)) loadAssets()
  }
  const addFolder = async (sectionId: number | null) => {
    if (await window.wist.projects.addFolder(projectId, sectionId)) loadAssets()
  }
  const addImages = async (sectionId: number | null) => {
    if (await window.wist.projects.addImages(projectId, sectionId)) loadAssets()
  }
  const removeAsset = async (assetId: number) => {
    await window.wist.projects.removeAsset(assetId)
    loadAssets()
  }
  const moveAsset = async (assetId: number, sectionId: number | null) => {
    await window.wist.projects.moveAsset(assetId, sectionId)
    loadAssets()
  }
  const openAsset = (a: ProjectAsset) => {
    if (a.kind === 'url' && a.url) window.wist.shell.openExternal(a.url)
    else if (a.kind === 'folder' && a.path) setFolderView({ path: a.path, label: a.label || a.path })
    else if (a.path) window.wist.vault.open(a.path)
  }
  const dropPaths = async (sectionId: number | null, e: React.DragEvent) => {
    const paths = Array.from(e.dataTransfer.files)
      .map((f) => window.wist.util.pathForFile(f))
      .filter(Boolean)
    if (paths.length && (await window.wist.projects.addPaths(projectId, paths, sectionId))) loadAssets()
  }
  // add items dragged in from another section (Library / Music / Vault). Links become url
  // assets; everything else files in by its path (a title/track contributes its cover).
  const addMedia = async (sectionId: number | null, items: MediaDragItem[]) => {
    let added = 0
    const paths: string[] = []
    for (const it of items) {
      if ((it.kind === 'url' || it.kind === 'playlist') && it.url) {
        added += (await window.wist.projects.addUrl(projectId, it.url, it.title || null, sectionId)) || 0
      } else {
        const p = it.path || it.cover
        if (p) paths.push(p)
      }
    }
    if (paths.length) added += (await window.wist.projects.addPaths(projectId, paths, sectionId)) || 0
    if (added) loadAssets()
  }
  // route a drop to internal-media or real-OS-file handling
  const dropInto = (sectionId: number | null, e: React.DragEvent) => {
    const items = readMediaDrag(e)
    if (items) addMedia(sectionId, items)
    else dropPaths(sectionId, e)
  }

  // ---- sections ----
  const addSection = async () => {
    await window.wist.projects.createSection(projectId, t('hub.newSectionName'))
    loadSections()
  }
  const renameSection = async (sid: number, name: string) => {
    await window.wist.projects.renameSection(sid, name)
    loadSections()
  }
  const removeSection = async (sid: number) => {
    await window.wist.projects.removeSection(sid)
    await Promise.all([loadSections(), loadAssets()])
  }
  const reorderSections = (ids: number[]) => {
    // optimistic local reorder so the blocks settle instantly, then persist
    setSections((prev) => {
      const byId = new Map(prev.map((s) => [s.id, s]))
      return ids.map((id) => byId.get(id)).filter(Boolean) as ProjectSection[]
    })
    window.wist.projects.reorderSections(ids).then(loadSections).catch(() => loadSections())
  }

  // ---- tasks ----
  const addTask = async (title: string) => {
    const tt = title.trim()
    if (!tt) return
    await window.wist.tasks.create({ title: tt, project_id: projectId })
    loadTasks()
  }
  const toggleTask = async (task: Task) => {
    await window.wist.tasks.update(task.id, { done: task.done ? 0 : 1 })
    loadTasks()
  }
  const newNote = () => navigate(`/notes?new=1&project=${projectId}`)
  const newPlan = async () => {
    const note = await window.wist.notes.create({
      title: 'Новый план',
      content: '## Цель\n\n## Задачи\n\n## Заметки\n',
      project_id: projectId,
      props: { fields: [], category: 'plan' },
    })
    loadNotes()
    if (note?.id) navigate(`/notes?open=${note.id}`)
  }

  // ---- hub header ops ----
  const renameProject = async (name: string) => {
    const nm = name.trim()
    if (!nm || nm === project?.name) return
    const saved = await window.wist.projects.update(projectId, { name: nm })
    setProject(saved)
  }
  const changeStatus = async (status: ProjectStatus) => {
    const saved = await window.wist.projects.update(projectId, { status })
    setProject(saved)
  }
  const togglePin = async () => {
    if (!project) return
    const saved = await window.wist.projects.update(projectId, { pinned: project.pinned ? 0 : 1 })
    setProject(saved)
  }
  const changeAvatar = async (icon: string | null) => {
    const saved = await window.wist.projects.update(projectId, { icon })
    setProject(saved)
  }

  // global "+ Add" menu router
  const goTab = (next: HubTabId) => {
    if (!tabs.includes(next)) setTabsPersist([...tabs, next]) // auto-enable a hidden tab when adding into it
    setTab(next)
  }
  const onAdd = (what: 'file' | 'folder' | 'image' | 'link' | 'section' | 'note' | 'task' | 'patch' | 'plan') => {
    switch (what) {
      case 'file':
        goTab('files'); addFiles(null); break
      case 'folder':
        goTab('files'); addFolder(null); break
      case 'image':
        goTab('files'); addImages(null); break
      case 'link':
        goTab('files'); setLinkOpen({ sectionId: null }); break
      case 'section':
        goTab('files'); addSection(); break
      case 'note':
        newNote(); break
      case 'task':
        goTab('tasks'); setTaskSignal((n) => n + 1); break
      case 'patch':
        goTab('patches'); setPatchSignal((n) => n + 1); break
      case 'plan':
        goTab('plans'); newPlan(); break
    }
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
  const ungrouped = assets.filter((a) => a.section_id == null)
  const folderAsset = assets.find((a) => a.kind === 'folder' && a.path)

  return (
    <div
      className="page relative !px-0 !py-0"
      onDragOver={(e) => {
        // react to OS files AND items dragged in from another section — never to an
        // internal tab/asset reorder drag (those carry text/* types, not these)
        if (dragHasDroppable(e)) {
          e.preventDefault()
          if (!dragOver) setDragOver(true)
        }
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragOver(false)
      }}
      onDrop={(e) => {
        if (!dragHasDroppable(e)) return
        e.preventDefault()
        setDragOver(false)
        goTab('files')
        dropInto(null, e)
      }}
    >
      {dragOver && (
        <div className="pointer-events-none fixed inset-6 z-20 flex items-center justify-center rounded-2xl border-2 border-dashed border-accent bg-accent/5 text-sm font-medium text-accent-bright">
          {t('project.dropHint')}
        </div>
      )}

      <Hero
        project={project}
        accent={accent}
        t={t}
        folderPath={folderAsset?.path ?? null}
        onBack={() => navigate('/projects')}
        onEdit={() => setEditing(true)}
        onRename={renameProject}
        onStatus={changeStatus}
        onPin={togglePin}
        onShare={() => setShareOpen(true)}
        onOpenFolder={(p) => setFolderView({ path: p, label: folderAsset?.label || p })}
        onAvatarChange={changeAvatar}
      />

      <div className="mx-auto max-w-6xl px-10 pb-16 pt-5">
        <HubTabBar
          tabs={tabs}
          tab={tab}
          setTab={setTab}
          t={t}
          onReorder={setTabsPersist}
          onCustomize={() => setCustomizing((c) => !c)}
          customizing={customizing}
        />

        {customizing && (
          <CustomizePanel
            tabs={tabs}
            widgets={widgets}
            t={t}
            onTabs={setTabsPersist}
            onWidgets={setWidgetsPersist}
            onReset={() => {
              setTabsPersist([...DEFAULT_HUB_TABS])
              setWidgetsPersist([...DEFAULT_HUB_WIDGETS])
            }}
            onClose={() => setCustomizing(false)}
          />
        )}

        <div className="mt-6">
          {tab === 'overview' && (
            <>
              <Overview
                project={project}
                accent={accent}
                assets={assets}
                tasks={tasks}
                notes={notes}
                sessions={sessions}
                t={t}
                onQuickTask={addTask}
                onNewNote={newNote}
                onOpenNote={(n) => navigate(`/notes?open=${n.id}`)}
                onOpenAsset={openAsset}
                onToggleTask={toggleTask}
                onOpenTask={setTaskDetail}
                onGoTab={goTab}
                onAddLink={() => setLinkOpen({ sectionId: null })}
              />
              {/* universal relations — link a canvas / note / task to this project (shows in the graph) */}
              <div className="mt-6">
                <Relations focus={{ type: 'project', id: projectId }} />
              </div>
            </>
          )}

          {tab === 'files' && (
            <FilesWorkspace
              assets={assets}
              ungrouped={ungrouped}
              sections={sections}
              t={t}
              onOpen={openAsset}
              onRemove={removeAsset}
              onMoveAsset={moveAsset}
              onDropPaths={dropInto}
              onAddFiles={addFiles}
              onAddFolder={addFolder}
              onAddImages={addImages}
              onAddLink={(sectionId) => setLinkOpen({ sectionId })}
              onAddSection={addSection}
              onRenameSection={renameSection}
              onRemoveSection={removeSection}
              onReorderSections={reorderSections}
            />
          )}

          {tab === 'tasks' && (
            <HubTasks projectId={projectId} openSignal={taskSignal} onChanged={loadTasks} />
          )}

          {tab === 'notes' && <NotesPanel notes={notes} t={t} onNew={newNote} onOpen={(n) => navigate(`/notes?open=${n.id}`)} />}

          {tab === 'plans' && (
            <Plans
              tasks={tasks}
              notes={notes}
              t={t}
              onNewPlan={newPlan}
              onOpenNote={(n) => navigate(`/notes?open=${n.id}`)}
            />
          )}

          {tab === 'sessions' && <HubSessions projectId={projectId} accent={accent} />}

          {tab === 'patches' && <HubPatches projectId={projectId} accent={accent} openSignal={patchSignal} />}

          {tab === 'graph' && (
            <HubGraph
              project={project}
              assets={assets}
              sections={sections}
              notes={notes}
              tasks={tasks}
              onOpenAsset={openAsset}
              onOpenNote={(noteId) => navigate(`/notes?open=${noteId}`)}
            />
          )}
        </div>
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
          onClose={() => setLinkOpen(null)}
          onAdd={async (url, label) => {
            await window.wist.projects.addUrl(projectId, url, label, linkOpen.sectionId)
            setLinkOpen(null)
            loadAssets()
          }}
        />
      )}

      {folderView && <FolderViewer root={folderView} onClose={() => setFolderView(null)} />}
      {shareOpen && <HubShareModal projectId={project.id} projectName={project.name} onClose={() => setShareOpen(false)} />}
      {taskDetail && <TaskDetailModal key={taskDetail.id} task={taskDetail} onClose={() => setTaskDetail(null)} onChanged={loadTasks} />}
    </div>
  )
}

// hub tab bar + customize panel live in ./project/HubTabBar (HubTabBar, CustomizePanel)

// hub hero/header lives in ./project/Hero (Hero + HeroIconBtn + StatusMenu + HubAddMenu)

// hub overview dashboard lives in ./project/Overview (Overview)
// Panel + Empty also moved into ./project/Overview

// hub files workspace lives in ./project/FilesWorkspace (FilesWorkspace + SectionBlock + AddMenu)

// ---------------- notes panel ----------------

function NotesPanel({ notes, t, onNew, onOpen }: { notes: Note[]; t: TFn; onNew: () => void; onOpen: (n: Note) => void }) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">{t('nav.notes')}</h2>
        <button className="btn-ghost !py-1.5 text-xs" onClick={onNew}>
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
                onClick={() => onOpen(n)}
                className="card group flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:border-edge"
              >
                <StickyNote size={15} className="mt-0.5 shrink-0 text-zinc-400" />
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
  )
}

// ---------------- add link modal ----------------

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
