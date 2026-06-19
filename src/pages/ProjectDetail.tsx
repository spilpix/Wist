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
import HubSessions from '../components/HubSessions'
import HubFocus from '../components/hub/HubFocus'
import HubPatches from '../components/hub/HubPatches'
import HubTasks from '../components/hub/HubTasks'
import TaskListRow from '../components/TaskListRow'
import TaskDetailModal from '../components/TaskDetailModal'
import { daysUntil } from './Projects'
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

// tab id → icon + i18n label
const TAB_META: Record<HubTabId, { icon: typeof LayoutGrid; key: string }> = {
  overview: { icon: LayoutGrid, key: 'hub.tabOverview' },
  files: { icon: FolderOpen, key: 'hub.tabFiles' },
  tasks: { icon: ListTodo, key: 'hub.tabTasks' },
  notes: { icon: StickyNote, key: 'hub.tabNotes' },
  sessions: { icon: History, key: 'hub.tabSessions' },
  patches: { icon: GitCommitVertical, key: 'hub.tabPatches' },
  graph: { icon: Share2, key: 'hub.tabGraph' },
}

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

  // global "+ Add" menu router
  const goTab = (next: HubTabId) => {
    if (!tabs.includes(next)) setTabsPersist([...tabs, next]) // auto-enable a hidden tab when adding into it
    setTab(next)
  }
  const onAdd = (what: 'file' | 'folder' | 'image' | 'link' | 'section' | 'note' | 'task' | 'patch') => {
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
        onAdd={onAdd}
        onShare={() => setShareOpen(true)}
        onOpenFolder={(p) => setFolderView({ path: p, label: folderAsset?.label || p })}
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
            <Overview
              project={project}
              accent={accent}
              widgets={widgets}
              assets={assets}
              tasks={tasks}
              notes={notes}
              sessions={sessions}
              patches={patches}
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

// ---------------- tab bar + customize ----------------

function HubTabBar({
  tabs,
  tab,
  setTab,
  t,
  onReorder,
  onCustomize,
  customizing,
}: {
  tabs: HubTabId[]
  tab: HubTabId
  setTab: (v: HubTabId) => void
  t: TFn
  onReorder: (next: HubTabId[]) => void
  onCustomize: () => void
  customizing: boolean
}) {
  const [dragId, setDragId] = useState<HubTabId | null>(null)
  const [overId, setOverId] = useState<HubTabId | null>(null)

  // drop the dragged tab into the target tab's slot
  const drop = (target: HubTabId) => {
    if (!dragId || dragId === target) return
    const next = tabs.filter((x) => x !== dragId)
    next.splice(next.indexOf(target), 0, dragId)
    onReorder(next)
  }
  const clearDrag = () => {
    setDragId(null)
    setOverId(null)
  }

  return (
    <div className="flex items-center gap-2 border-b border-edge">
      <div className="-mb-px flex flex-1 items-center gap-0.5 overflow-x-auto">
        {tabs.map((id) => {
          const { icon: Icon, key } = TAB_META[id]
          const active = tab === id
          const dropping = overId === id && dragId !== null && dragId !== id
          return (
            <button
              key={id}
              draggable
              onClick={() => setTab(id)}
              onDragStart={(e) => {
                setDragId(id)
                e.dataTransfer.effectAllowed = 'move'
                e.dataTransfer.setData('text/hubtab', id)
              }}
              onDragOver={(e) => {
                if (!dragId) return
                e.preventDefault()
                if (overId !== id) setOverId(id)
              }}
              onDrop={(e) => {
                e.preventDefault()
                e.stopPropagation()
                drop(id)
                clearDrag()
              }}
              onDragEnd={clearDrag}
              className={`flex shrink-0 cursor-pointer items-center gap-1.5 border-b-2 px-3 py-2.5 text-[13px] font-medium transition-colors ${
                dropping ? 'bg-accent/10' : ''
              } ${active ? 'border-white text-zinc-100' : 'border-transparent text-zinc-500 hover:text-zinc-300'} ${
                dragId === id ? 'opacity-40' : ''
              }`}
            >
              <Icon size={15} /> {t(key as 'hub.tabOverview')}
            </button>
          )
        })}
      </div>
      <button
        onClick={onCustomize}
        title={t('hub.customize')}
        className={`mb-1 shrink-0 rounded-lg p-1.5 transition-colors ${
          customizing ? 'bg-highlight text-zinc-100' : 'text-zinc-500 hover:bg-highlight hover:text-zinc-200'
        }`}
      >
        <Settings2 size={16} />
      </button>
    </div>
  )
}

function CustomizePanel({
  tabs,
  widgets,
  t,
  onTabs,
  onWidgets,
  onReset,
  onClose,
}: {
  tabs: HubTabId[]
  widgets: HubWidgetId[]
  t: TFn
  onTabs: (next: HubTabId[]) => void
  onWidgets: (next: HubWidgetId[]) => void
  onReset: () => void
  onClose: () => void
}) {
  const disabled = ALL_HUB_TABS.filter((x) => !tabs.includes(x))
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= tabs.length) return
    const next = [...tabs]
    ;[next[i], next[j]] = [next[j], next[i]]
    onTabs(next)
  }
  const toggleWidget = (w: HubWidgetId) =>
    onWidgets(widgets.includes(w) ? widgets.filter((x) => x !== w) : [...widgets, w])

  const WIDGET_KEY: Record<HubWidgetId, string> = {
    focus: 'hub.widgetFocus',
    progress: 'hub.widgetProgress',
    deadline: 'hub.widgetDeadline',
    momentum: 'hub.widgetMomentum',
    quickcapture: 'hub.widgetQuickCapture',
    continue: 'hub.widgetContinue',
    openTasks: 'hub.widgetOpenTasks',
    references: 'hub.widgetReferences',
    recentFiles: 'hub.widgetRecentFiles',
    recentSessions: 'hub.widgetRecentSessions',
    recentPatches: 'hub.widgetRecentPatches',
  }

  return (
    <div className="card mt-3 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-xs text-zinc-500">{t('hub.customizeHint')}</div>
        <div className="flex items-center gap-1.5">
          <button onClick={onReset} className="btn-ghost !py-1 text-[11px]">
            {t('hub.resetLayout')}
          </button>
          <button onClick={onClose} className="rounded-lg p-1 text-zinc-500 hover:bg-highlight hover:text-zinc-200">
            <X size={15} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        {/* tabs */}
        <div>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{t('hub.customizeTabs')}</div>
          <div className="space-y-1">
            {tabs.map((id, i) => {
              const { icon: Icon, key } = TAB_META[id]
              return (
                <div key={id} className="flex items-center gap-2 rounded-lg bg-raised px-2 py-1.5">
                  <Icon size={14} className="text-zinc-400" />
                  <span className="flex-1 truncate text-sm text-zinc-200">{t(key as 'hub.tabOverview')}</span>
                  <button
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    className="rounded p-0.5 text-zinc-500 hover:text-zinc-200 disabled:opacity-30"
                    title="↑"
                  >
                    <ChevronRight size={14} className="-rotate-90" />
                  </button>
                  <button
                    onClick={() => move(i, 1)}
                    disabled={i === tabs.length - 1}
                    className="rounded p-0.5 text-zinc-500 hover:text-zinc-200 disabled:opacity-30"
                    title="↓"
                  >
                    <ChevronRight size={14} className="rotate-90" />
                  </button>
                  {id !== 'overview' && (
                    <button
                      onClick={() => onTabs(tabs.filter((x) => x !== id))}
                      className="rounded-lg p-0.5 text-zinc-500 hover:text-danger"
                      title={t('common.delete')}
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
          {disabled.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {disabled.map((id) => {
                const { icon: Icon, key } = TAB_META[id]
                return (
                  <button
                    key={id}
                    onClick={() => onTabs([...tabs, id])}
                    className="flex items-center gap-1 rounded-lg border border-dashed border-edge px-2 py-1 text-[11px] text-zinc-500 hover:border-accent hover:text-zinc-200"
                  >
                    <Plus size={11} /> <Icon size={12} /> {t(key as 'hub.tabOverview')}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* overview widgets */}
        <div>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{t('hub.customizeWidgets')}</div>
          <div className="space-y-1">
            {ALL_HUB_WIDGETS.map((w) => {
              const on = widgets.includes(w)
              return (
                <button
                  key={w}
                  onClick={() => toggleWidget(w)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-highlight"
                >
                  <span
                    className={`grid h-4 w-4 shrink-0 place-items-center rounded border ${on ? 'border-accent bg-accent text-[#fff]' : 'border-edge'}`}
                  >
                    {on && <ChevronRight size={11} className="rotate-90" />}
                  </span>
                  <span className={on ? 'text-zinc-200' : 'text-zinc-500'}>{t(WIDGET_KEY[w] as 'hub.widgetContinue')}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------- hero ----------------

function Hero({
  project,
  accent,
  t,
  folderPath,
  onBack,
  onEdit,
  onRename,
  onStatus,
  onPin,
  onAdd,
  onShare,
  onOpenFolder,
}: {
  project: Project
  accent: string
  t: TFn
  folderPath: string | null
  onBack: () => void
  onEdit: () => void
  onRename: (name: string) => void
  onStatus: (s: ProjectStatus) => void
  onPin: () => void
  onAdd: (what: 'file' | 'folder' | 'image' | 'link' | 'section' | 'note' | 'task' | 'patch') => void
  onShare: () => void
  onOpenFolder: (path: string) => void
}) {
  const [renaming, setRenaming] = useState(false)
  const left = project.deadline ? daysUntil(project.deadline) : null
  const dueColor = left === null ? 'text-zinc-500' : left < 0 ? 'text-danger' : left <= 3 ? 'text-[var(--c-yellow-text)]' : 'text-zinc-500'
  // no-cover: a vivid accent cover band (design-system §Хаб·обзор — the banner is
  // saturated; the bottom fade keeps the title below it readable). Same recipe as the
  // gallery card fallback so a hub looks identical in the list and on its page.
  const wash = `linear-gradient(135deg, ${accent}, ${accent}99)`
  // "обновлён сегодня / вчера / DD.MM.YYYY" for the meta line
  const relUpdated = (() => {
    const iso = project.updated_at?.slice(0, 10)
    if (!iso) return ''
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const days = Math.round((today.getTime() - new Date(`${iso}T00:00:00`).getTime()) / 86_400_000)
    if (days <= 0) return t('hub.today')
    if (days === 1) return t('hub.yesterday')
    return iso.split('-').reverse().join('.')
  })()

  return (
    <div>
      {/* cover band — image / gradient / accent wash, fading into the page bg */}
      <div className="relative h-44 w-full">
        {project.cover_path ? (
          <ProjectCover cover={project.cover_path} className="absolute inset-0 h-full w-full" />
        ) : (
          <div className="absolute inset-0" style={{ backgroundImage: wash }} />
        )}
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-bg to-transparent" />

        <button
          onClick={onBack}
          className="absolute left-8 top-6 flex items-center gap-1.5 rounded-lg border border-edge bg-card/80 px-2.5 py-1.5 text-xs font-medium text-zinc-300 backdrop-blur-sm transition-colors hover:text-white"
        >
          <ArrowLeft size={14} /> {t('nav.projects')}
        </button>
        <div className="absolute right-8 top-6 flex items-center gap-1.5">
          <HubAddMenu t={t} onAdd={onAdd} />
          <HeroIconBtn title={t('hub.share')} onClick={onShare}>
            <Share2 size={14} />
          </HeroIconBtn>
          <HeroIconBtn title={t(project.pinned ? 'project.unpin' : 'project.pin')} onClick={onPin} active={!!project.pinned}>
            <Pin size={14} className={project.pinned ? 'fill-current' : ''} />
          </HeroIconBtn>
          {folderPath && (
            <HeroIconBtn title={t('hub.openInExplorer')} onClick={() => onOpenFolder(folderPath)}>
              <FolderOpen size={14} />
            </HeroIconBtn>
          )}
          <HeroIconBtn title={t('common.edit')} onClick={onEdit}>
            <Pencil size={14} />
          </HeroIconBtn>
        </div>
      </div>

      {/* title block — sits on the page bg, so text is always readable in any theme.
          The icon tile straddles the cover/body seam (design-system .cicon). */}
      <div className="relative mx-auto -mt-7 max-w-6xl px-10">
        <div className="mb-3 grid h-14 w-14 place-items-center rounded-xl border border-edge bg-card text-zinc-300 shadow-[var(--card-shadow)]">
          <LayoutGrid size={26} />
        </div>

        <div className="flex items-center gap-3">
          {renaming ? (
            <input
              autoFocus
              defaultValue={project.name}
              onBlur={(e) => {
                onRename(e.target.value)
                setRenaming(false)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                if (e.key === 'Escape') setRenaming(false)
              }}
              className="input !w-auto min-w-[16rem] flex-1 !py-1 text-3xl !font-bold"
            />
          ) : (
            <h1
              className="cursor-text truncate text-3xl font-bold text-zinc-100"
              title={t('hub.renameHint')}
              onClick={() => setRenaming(true)}
            >
              {project.name}
            </h1>
          )}
          <StatusMenu status={project.status} t={t} onChange={onStatus} />
        </div>

        {/* meta — "Хаб · клиент X · обновлён сегодня · дедлайн · инструменты" */}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-zinc-500">
          <span>{t('nav.hub')}</span>
          {project.kind && <span>· {project.kind}</span>}
          {project.client && <span>· {t('project.client').toLowerCase()} {project.client}</span>}
          {relUpdated && <span>· {t('hub.updated', { x: relUpdated })}</span>}
          {project.deadline && (
            <span className={dueColor}>· {left !== null ? t('hub.daysLeft').replace('{n}', String(left)) : project.deadline}</span>
          )}
          {project.tools.slice(0, 5).map((tool) => (
            <span key={tool} className="rounded-full bg-raised px-1.5 py-0.5 text-[11px] font-medium text-zinc-400">
              {tool}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

function HeroIconBtn({
  children,
  onClick,
  title,
  active,
}: {
  children: React.ReactNode
  onClick: () => void
  title: string
  active?: boolean
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`flex items-center gap-1.5 rounded-lg border border-edge bg-card/80 p-1.5 text-xs font-medium backdrop-blur-sm transition-colors hover:text-white ${
        active ? 'text-zinc-100' : 'text-zinc-300'
      }`}
    >
      {children}
    </button>
  )
}

function StatusMenu({ status, t, onChange }: { status: ProjectStatus; t: TFn; onChange: (s: ProjectStatus) => void }) {
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
  const color = PROJECT_STATUS_COLORS[status]
  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        title={t('hub.changeStatus')}
        className="flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide transition-opacity hover:opacity-80"
        style={{ backgroundColor: `${color}26`, color }}
      >
        {t(`project.status.${status}` as 'project.status.active')}
        <ChevronDown size={12} />
      </button>
      {open && (
        <div className="absolute left-0 z-30 mt-1 w-40 overflow-hidden rounded-2xl border border-edge bg-card py-1 shadow-[var(--float-shadow)]">
          {PROJECT_STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => {
                onChange(s)
                setOpen(false)
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-zinc-300 hover:bg-raised hover:text-white"
            >
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: PROJECT_STATUS_COLORS[s] }} />
              {t(`project.status.${s}` as 'project.status.active')}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function HubAddMenu({ t, onAdd }: { t: TFn; onAdd: (what: 'file' | 'folder' | 'image' | 'link' | 'section' | 'note' | 'task' | 'patch') => void }) {
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
  const items: Array<[typeof FilePlus2, string, 'file' | 'folder' | 'image' | 'link' | 'section' | 'note' | 'task' | 'patch']> = [
    [FilePlus2, t('project.addFiles'), 'file'],
    [FolderPlus, t('project.addFolder'), 'folder'],
    [ImagePlus, t('project.addImages'), 'image'],
    [Link2, t('project.addLink'), 'link'],
    [FolderPlus, t('hub.addSection'), 'section'],
    [StickyNote, t('hub.addNote'), 'note'],
    [ListTodo, t('hub.addTask'), 'task'],
    [GitCommitVertical, t('hub.addPatch'), 'patch'],
  ]
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-lg border border-transparent bg-accent px-2.5 py-1.5 text-xs font-medium text-[#fff] transition-colors hover:bg-accent-hover"
        title={t('hub.addMenu')}
      >
        <Plus size={14} /> {t('hub.addMenu')}
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-44 overflow-hidden rounded-2xl border border-edge bg-card py-1 shadow-[var(--float-shadow)]">
          {items.map(([Icon, label, what]) => (
            <button
              key={what}
              onClick={() => {
                setOpen(false)
                onAdd(what)
              }}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-zinc-300 hover:bg-raised hover:text-white"
            >
              <Icon size={15} className="text-zinc-500" /> {label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------- overview dashboard ----------------

function Widget({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  // flat, calm stat cell (design-system §Хаб · обзор): border-only surface, no
  // drop shadow — depth is reserved for floating layers, not inline dashboard tiles.
  return (
    <div className={`flex flex-col rounded-xl border border-edge bg-card p-4 ${className}`}>
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{label}</div>
      {children}
    </div>
  )
}

/** A single hubstat cell — big number + small label (design-system .hubstat). */
function StatCell({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-lg border border-edge bg-card px-3.5 py-3">
      <div className="text-[20px] font-bold leading-none tracking-tight text-zinc-100">{value}</div>
      <div className="mt-1.5 text-[11.5px] text-zinc-500">{label}</div>
    </div>
  )
}

// file-chip badge: a 3-letter extension tag tinted by content-palette colour (design-system .filechip .fi)
const FILE_BADGE_COLORS: Record<string, string> = {
  pdf: 'var(--c-red-text)', doc: 'var(--c-blue-text)', docx: 'var(--c-blue-text)', txt: 'var(--c-gray-text)', md: 'var(--c-gray-text)',
  fig: 'var(--c-purple-text)', psd: 'var(--c-blue-text)', ai: 'var(--c-orange-text)', sketch: 'var(--c-orange-text)',
  mp3: 'var(--c-green-text)', wav: 'var(--c-green-text)', flac: 'var(--c-green-text)', m4a: 'var(--c-green-text)',
  mp4: 'var(--c-pink-text)', mov: 'var(--c-pink-text)', mkv: 'var(--c-pink-text)', webm: 'var(--c-pink-text)',
  png: 'var(--c-yellow-text)', jpg: 'var(--c-yellow-text)', jpeg: 'var(--c-yellow-text)', gif: 'var(--c-yellow-text)', svg: 'var(--c-yellow-text)',
  zip: 'var(--c-brown-text)', rar: 'var(--c-brown-text)', '7z': 'var(--c-brown-text)',
}
const baseName = (p: string) => p.split(/[\\/]/).pop() || p
function fileBadge(nameOrPath: string) {
  const ext = (nameOrPath.split('.').pop() || 'file').toLowerCase()
  return { ext: ext.slice(0, 3).toUpperCase(), color: FILE_BADGE_COLORS[ext] || 'var(--c-gray-text)' }
}

function Overview({
  project,
  accent,
  widgets,
  assets,
  tasks,
  notes,
  sessions,
  patches,
  t,
  onQuickTask,
  onNewNote,
  onOpenNote,
  onOpenAsset,
  onToggleTask,
  onOpenTask,
  onGoTab,
  onAddLink,
}: {
  project: Project
  accent: string
  widgets: HubWidgetId[]
  assets: ProjectAsset[]
  tasks: Task[]
  notes: Note[]
  sessions: ProjectSession[]
  patches: ProjectPatch[]
  t: TFn
  onQuickTask: (title: string) => void
  onNewNote: () => void
  onOpenNote: (n: Note) => void
  onOpenAsset: (a: ProjectAsset) => void
  onToggleTask: (task: Task) => void
  onOpenTask: (task: Task) => void
  onGoTab: (tab: HubTabId) => void
  onAddLink: () => void
}) {
  const [quick, setQuick] = useState('')
  const has = (w: HubWidgetId) => widgets.includes(w)
  const total = tasks.length
  const done = tasks.filter((x) => x.done).length
  const pct = total > 0 ? done / total : 0
  const left = project.deadline ? daysUntil(project.deadline) : null
  const continueNote = notes[0]
  const continueAsset = !continueNote ? assets.find((a) => a.kind === 'image' || a.kind === 'file') : undefined
  const openTasks = tasks.filter((x) => !x.done).slice(0, 5)
  const recentAssets = [...assets].slice(-5).reverse()

  // momentum — focus / work time logged through sessions (this week + today)
  const dayMs = 86400000
  const nowMs = Date.now()
  const parseTs = (s: string) => {
    const v = Date.parse(s.replace(' ', 'T'))
    return Number.isNaN(v) ? 0 : v
  }
  const weekSessions = sessions.filter((s) => nowMs - parseTs(s.created_at) < 7 * dayMs)
  const weekSecs = weekSessions.reduce((a, s) => a + (s.duration_seconds || 0), 0)
  const now = new Date()
  const localToday = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const todaySecs = sessions.filter((s) => s.created_at.slice(0, 10) === localToday).reduce((a, s) => a + (s.duration_seconds || 0), 0)
  const fmtDur = (secs: number) => {
    const m = Math.round(secs / 60)
    return m < 60 ? `${m}${t('hub.mShort')}` : `${Math.floor(m / 60)}${t('hub.hShort')} ${m % 60}${t('hub.mShort')}`
  }
  // references — the links + docs you keep coming back to (links first, then files)
  const refs = assets.filter((a) => a.kind === 'url' || a.kind === 'file' || a.kind === 'folder')
  const topRefs = [...refs].sort((a, b) => (a.kind === 'url' ? 0 : 1) - (b.kind === 'url' ? 0 : 1)).slice(0, 6)

  const smallWidgets = has('continue') || has('progress') || has('deadline') || has('momentum') || has('quickcapture')
  const panels = has('recentFiles') || has('openTasks') || has('references') || has('recentSessions') || has('recentPatches')

  // files for the chip strip — real files/images with a name, most-recent first
  const fileChips = [...assets].reverse().filter((a) => (a.kind === 'file' || a.kind === 'image') && (a.path || a.label)).slice(0, 6)

  return (
    <div className="space-y-8">
      {/* design-system §Хаб·обзор — 4-cell stat strip + file-chip strip */}
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCell value={String(total)} label={total > 0 ? `${t('hub.tasksShort')} · ${total - done} ${t('hub.statOpen')}` : t('hub.tasksShort')} />
          <StatCell value={String(notes.length)} label={t('hub.notesShort')} />
          <StatCell value={String(assets.length)} label={t('hub.statFiles')} />
          <StatCell value={`${Math.round(pct * 100)}%`} label={t('hub.statReady')} />
        </div>
        {fileChips.length > 0 && (
          <div className="flex flex-wrap gap-2.5">
            {fileChips.map((a) => {
              const b = fileBadge(a.path || a.label || '')
              return (
                <button
                  key={a.id}
                  onClick={() => onOpenAsset(a)}
                  className="flex items-center gap-2.5 rounded-lg border border-edge bg-card px-3 py-2 text-[12.5px] text-zinc-200 transition-colors hover:border-zinc-600 hover:text-white"
                >
                  <span className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-md text-[9px] font-bold text-white" style={{ backgroundColor: b.color }}>
                    {b.ext}
                  </span>
                  <span className="max-w-[180px] truncate">{a.label || baseName(a.path || '')}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {project.description && (
        <p className="max-w-3xl whitespace-pre-wrap text-sm leading-relaxed text-zinc-400">{project.description}</p>
      )}

      {has('focus') && <HubFocus projectId={project.id} accent={accent} />}

      {smallWidgets && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {has('continue') && (
            <Widget label={t('hub.continue')}>
              {continueNote ? (
                <button onClick={() => onOpenNote(continueNote)} className="group -m-1 flex items-start gap-2.5 rounded-lg p-1 text-left">
                  <PlayCircle size={18} className="mt-0.5 shrink-0 text-zinc-400" />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-zinc-200 group-hover:text-white">
                      {continueNote.title.trim() || continueNote.content.trim().split('\n')[0].slice(0, 40) || t('nav.notes')}
                    </div>
                    <div className="text-[11px] text-zinc-500">{t('nav.notes')}</div>
                  </div>
                </button>
              ) : continueAsset ? (
                <button onClick={() => onOpenAsset(continueAsset)} className="group -m-1 flex items-start gap-2.5 rounded-lg p-1 text-left">
                  <PlayCircle size={18} className="mt-0.5 shrink-0 text-zinc-400" />
                  <div className="min-w-0 truncate text-sm font-medium text-zinc-200 group-hover:text-white">{continueAsset.label}</div>
                </button>
              ) : (
                <div className="flex items-center gap-2 text-sm text-zinc-600">
                  <PlayCircle size={18} className="shrink-0" /> {t('hub.continueEmpty')}
                </div>
              )}
            </Widget>
          )}

          {has('progress') && (
            <Widget label={t('hub.progress')}>
              <div className="flex items-center gap-3">
                <ProgressRing value={pct} size={46} stroke={5} color={accent}>
                  {total > 0 ? `${Math.round(pct * 100)}%` : ''}
                </ProgressRing>
                <div className="min-w-0">
                  {total > 0 ? (
                    <>
                      <div className="text-sm font-semibold text-zinc-100">
                        {done} / {total}
                      </div>
                      <div className="text-[11px] text-zinc-500">{t('hub.tasksDone')}</div>
                    </>
                  ) : (
                    <div className="text-sm text-zinc-600">{t('hub.noTasksYet')}</div>
                  )}
                </div>
              </div>
            </Widget>
          )}

          {has('deadline') && (
            <Widget label={t('hub.deadline')}>
              {project.deadline && left !== null ? (
                <div>
                  <div className={`text-2xl font-bold ${left < 0 ? 'text-danger' : left <= 3 ? 'text-[var(--c-yellow-text)]' : 'text-zinc-100'}`}>
                    {Math.abs(left)}
                  </div>
                  <div className="text-[11px] text-zinc-500">
                    {left < 0 ? t('hub.daysOverdue') : t('hub.daysToGo')} · {project.deadline}
                  </div>
                </div>
              ) : (
                <div className="flex h-full items-center text-sm text-zinc-600">{t('hub.noDeadline')}</div>
              )}
            </Widget>
          )}

          {has('momentum') && (
            <Widget label={t('hub.widgetMomentum')}>
              {sessions.length ? (
                <div>
                  <div className="text-2xl font-bold text-zinc-100">{fmtDur(weekSecs)}</div>
                  <div className="text-[11px] text-zinc-500">
                    {t('hub.statWeek')} · {weekSessions.length} {t('hub.statSessions').toLowerCase()}
                  </div>
                  {todaySecs > 0 && (
                    <div className="mt-1 text-[11px] font-medium text-zinc-300">
                      +{fmtDur(todaySecs)} {t('home.today').toLowerCase()}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex h-full items-center text-sm text-zinc-600">{t('hub.noSessions')}</div>
              )}
            </Widget>
          )}

          {has('quickcapture') && (
            <Widget label={t('hub.quickCapture')}>
              <input
                className="input !py-2 text-sm"
                placeholder={t('hub.quickCapturePh')}
                value={quick}
                onChange={(e) => setQuick(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && quick.trim()) {
                    onQuickTask(quick)
                    setQuick('')
                  }
                }}
              />
              <button onClick={onNewNote} className="mt-2 flex items-center gap-1 self-start text-[11px] text-zinc-500 hover:text-zinc-200">
                <Plus size={12} /> {t('project.newNote')}
              </button>
            </Widget>
          )}
        </div>
      )}

      {panels && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {has('openTasks') && (
            <Panel title={t('hub.openTasks')} count={openTasks.length} onSeeAll={() => onGoTab('tasks')} t={t}>
              {openTasks.length ? (
                <div>
                  {openTasks.map((task) => (
                    <TaskListRow key={task.id} task={task} onToggle={onToggleTask} onOpen={onOpenTask} t={t} />
                  ))}
                </div>
              ) : (
                <Empty t={t} label={t('hub.allDone')} />
              )}
            </Panel>
          )}

          {has('references') && (
            <Panel title={t('hub.widgetReferences')} count={refs.length} onSeeAll={() => onGoTab('files')} t={t}>
              {topRefs.length ? (
                <div className="card divide-y divide-edge">
                  {topRefs.map((a) => (
                    <button key={a.id} onClick={() => onOpenAsset(a)} className="group flex w-full items-center gap-2.5 px-3 py-2.5 text-left">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-raised text-zinc-400">
                        {a.kind === 'folder' ? <FolderOpen size={15} /> : a.kind === 'url' ? <Link2 size={15} /> : <FileText size={15} />}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm text-zinc-200 group-hover:text-white">{a.label || a.url || a.path}</span>
                      {a.kind === 'url' && <ExternalLink size={14} className="shrink-0 text-zinc-600 group-hover:text-zinc-400" />}
                    </button>
                  ))}
                  <button onClick={onAddLink} className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[12px] font-medium text-zinc-500 hover:text-zinc-200">
                    <Plus size={14} /> {t('project.addLink')}
                  </button>
                </div>
              ) : (
                <button onClick={onAddLink} className="card flex w-full items-center gap-2 px-4 py-5 text-left text-sm text-zinc-500 transition-colors hover:text-zinc-200">
                  <Link2 size={16} className="shrink-0" /> {t('hub.noReferences')} — <span className="font-medium text-zinc-300">{t('project.addLink')}</span>
                </button>
              )}
            </Panel>
          )}

          {has('recentFiles') && (
            <Panel title={t('hub.recentFiles')} count={assets.length} onSeeAll={() => onGoTab('files')} t={t}>
              {recentAssets.length ? (
                <div className="card divide-y divide-edge">
                  {recentAssets.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => onOpenAsset(a)}
                      className="group flex w-full items-center gap-2.5 px-3 py-2.5 text-left"
                    >
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-raised text-zinc-400">
                        {a.kind === 'folder' ? <FolderOpen size={15} /> : a.kind === 'url' ? <Link2 size={15} /> : <FileText size={15} />}
                      </span>
                      <span className="truncate text-sm text-zinc-200 group-hover:text-white">{a.label || a.path || a.url}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <Empty t={t} label={t('hub.noRecentFiles')} />
              )}
            </Panel>
          )}

          {has('recentSessions') && (
            <Panel title={t('hub.recentSessions')} count={sessions.length} onSeeAll={() => onGoTab('sessions')} t={t}>
              {sessions.length ? (
                <div className="card divide-y divide-edge">
                  {sessions.slice(0, 4).map((s) => (
                    <div key={s.id} className="flex items-center gap-2.5 px-3 py-2.5">
                      <History size={15} className="shrink-0 text-zinc-400" />
                      <span className="min-w-0 flex-1 truncate text-sm text-zinc-200">{s.title?.trim() || s.created_at.slice(0, 10)}</span>
                      <span className="shrink-0 text-[11px] text-zinc-500">{Math.round((s.duration_seconds || 0) / 60)}{t('hub.mShort')}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <Empty t={t} label={t('hub.noSessions')} />
              )}
            </Panel>
          )}

          {has('recentPatches') && (
            <Panel title={t('hub.recentPatches')} count={patches.length} onSeeAll={() => onGoTab('patches')} t={t}>
              {patches.length ? (
                <div className="card divide-y divide-edge">
                  {patches.slice(0, 4).map((p) => (
                    <button
                      key={p.id}
                      onClick={() => onGoTab('patches')}
                      className="group flex w-full items-center gap-2.5 px-3 py-2.5 text-left"
                    >
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: PATCH_STATUS_COLORS[p.status] }} />
                      {p.version && <span className="shrink-0 font-mono text-[11px] font-semibold text-zinc-400">{p.version}</span>}
                      <span className="min-w-0 flex-1 truncate text-sm text-zinc-200 group-hover:text-white">{p.title?.trim() || t('hub.newPatch')}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <Empty t={t} label={t('hub.noPatches')} />
              )}
            </Panel>
          )}
        </div>
      )}

      {!has('focus') && !smallWidgets && !panels && <Empty t={t} label={t('hub.emptyTab')} />}
    </div>
  )
}

function Panel({
  title,
  count,
  onSeeAll,
  t,
  children,
}: {
  title: string
  count: number
  onSeeAll: () => void
  t: TFn
  children: React.ReactNode
}) {
  return (
    <section>
      <div className="mb-2.5 flex items-center gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">{title}</h2>
        {count > 0 && <span className="text-xs text-zinc-600">{count}</span>}
        <button onClick={onSeeAll} className="ml-auto text-[11px] text-zinc-500 hover:text-zinc-200">
          {t('hub.seeAll')}
        </button>
      </div>
      {children}
    </section>
  )
}

function Empty({ t, label }: { t: TFn; label?: string }) {
  return <p className="px-1 py-6 text-center text-xs text-zinc-600">{label ?? t('hub.emptyTab')}</p>
}

// ---------------- files workspace ----------------

function FilesWorkspace({
  assets,
  ungrouped,
  sections,
  t,
  onOpen,
  onRemove,
  onMoveAsset,
  onDropPaths,
  onAddFiles,
  onAddFolder,
  onAddImages,
  onAddLink,
  onAddSection,
  onRenameSection,
  onRemoveSection,
  onReorderSections,
}: {
  assets: ProjectAsset[]
  ungrouped: ProjectAsset[]
  sections: ProjectSection[]
  t: TFn
  onOpen: (a: ProjectAsset) => void
  onRemove: (id: number) => void
  onMoveAsset: (assetId: number, sectionId: number | null) => void
  onDropPaths: (sectionId: number | null, e: React.DragEvent) => void
  onAddFiles: (sectionId: number | null) => void
  onAddFolder: (sectionId: number | null) => void
  onAddImages: (sectionId: number | null) => void
  onAddLink: (sectionId: number | null) => void
  onAddSection: () => void
  onRenameSection: (sid: number, name: string) => void
  onRemoveSection: (sid: number) => void
  onReorderSections: (ids: number[]) => void
}) {
  // pointer-drag reorder of the section blocks (the ungrouped block stays pinned on top)
  const { onHandleDown, draggingId, overIndex } = useSortable(
    sections.map((s) => s.id),
    onReorderSections
  )
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">{t('project.references')}</h2>
        <div className="flex flex-wrap items-center gap-1.5">
          <AddMenu t={t} onFiles={() => onAddFiles(null)} onFolder={() => onAddFolder(null)} onImages={() => onAddImages(null)} onLink={() => onAddLink(null)} />
          <button className="btn-ghost !py-1.5 text-xs" onClick={onAddSection}>
            <FolderPlus size={14} /> {t('hub.addSection')}
          </button>
        </div>
      </div>

      {!assets.length && !sections.length ? (
        <div className="rounded-xl border-2 border-dashed border-edge px-6 py-14 text-center">
          <FolderOpen size={32} className="mx-auto mb-3 text-zinc-600" />
          <div className="text-sm font-medium text-zinc-300">{t('project.noAssets')}</div>
          <div className="mt-1 text-xs text-zinc-500">{t('hub.workspaceHint')}</div>
        </div>
      ) : (
        <div className="space-y-4">
          <SectionBlock
            key="ungrouped"
            section={null}
            assets={ungrouped}
            t={t}
            onOpen={onOpen}
            onRemove={onRemove}
            onMoveAsset={onMoveAsset}
            onDropPaths={(e) => onDropPaths(null, e)}
            onAddFiles={() => onAddFiles(null)}
            onAddFolder={() => onAddFolder(null)}
            onAddImages={() => onAddImages(null)}
            onAddLink={() => onAddLink(null)}
            hasSections={sections.length > 0}
          />
          <div data-sortable-container className="space-y-4">
            {sections.map((s, i) => (
              <Fragment key={s.id}>
                {overIndex === i && <div className="insert-line" />}
                <div data-sortable-item className={draggingId === s.id ? 'drag-taken' : ''}>
                  <SectionBlock
                    section={s}
                    assets={assets.filter((a) => a.section_id === s.id)}
                    t={t}
                    onOpen={onOpen}
                    onRemove={onRemove}
                    onMoveAsset={onMoveAsset}
                    onDropPaths={(e) => onDropPaths(s.id, e)}
                    onAddFiles={() => onAddFiles(s.id)}
                    onAddFolder={() => onAddFolder(s.id)}
                    onAddImages={() => onAddImages(s.id)}
                    onAddLink={() => onAddLink(s.id)}
                    onRename={(name) => onRenameSection(s.id, name)}
                    onDelete={() => onRemoveSection(s.id)}
                    onHandleDown={(e) => onHandleDown(e, s.id)}
                    hasSections
                  />
                </div>
              </Fragment>
            ))}
            {overIndex === sections.length && <div className="insert-line" />}
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------- section block ----------------

function SectionBlock({
  section,
  assets,
  t,
  onOpen,
  onRemove,
  onMoveAsset,
  onDropPaths,
  onAddFiles,
  onAddFolder,
  onAddImages,
  onAddLink,
  onRename,
  onDelete,
  onHandleDown,
  hasSections,
}: {
  section: ProjectSection | null
  assets: ProjectAsset[]
  t: TFn
  onOpen: (a: ProjectAsset) => void
  onRemove: (id: number) => void
  onMoveAsset: (assetId: number, sectionId: number | null) => void
  onDropPaths: (e: React.DragEvent) => void
  onAddFiles: () => void
  onAddFolder: () => void
  onAddImages: () => void
  onAddLink: () => void
  onRename?: (name: string) => void
  onDelete?: () => void
  onHandleDown?: (e: React.MouseEvent) => void
  hasSections: boolean
}) {
  const [over, setOver] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const sid = section?.id ?? null

  // an ungrouped block with no assets and no sections at all renders nothing here
  if (!section && !assets.length && !hasSections) return null

  const images = assets.filter((a) => a.kind === 'image')
  const links = assets.filter((a) => a.kind === 'url')
  const files = assets.filter((a) => a.kind === 'file' || a.kind === 'folder')

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setOver(false)
    const assetId = e.dataTransfer.getData('text/asset')
    if (assetId) onMoveAsset(Number(assetId), sid)
    else onDropPaths(e)
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        if (!over) setOver(true)
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setOver(false)
      }}
      onDrop={handleDrop}
      className={`rounded-xl border p-3 transition-colors ${over ? 'border-accent bg-accent/5' : section ? 'border-edge bg-raised' : 'border-transparent'}`}
    >
      {section ? (
        <div className="group/sec mb-2.5 flex items-center gap-2 px-1">
          {onHandleDown && (
            <span
              className="drag-handle -ml-0.5 h-5 w-4 shrink-0 opacity-0 transition-opacity group-hover/sec:opacity-100"
              onMouseDown={(e) => {
                e.stopPropagation()
                onHandleDown(e)
              }}
              title={t('hub.reorderSection')}
            >
              <GripVertical size={14} />
            </span>
          )}
          <button onClick={() => setCollapsed((c) => !c)} className="text-zinc-500 hover:text-zinc-300">
            <ChevronRight size={15} className={`transition-transform ${collapsed ? '' : 'rotate-90'}`} />
          </button>
          {renaming ? (
            <input
              autoFocus
              defaultValue={section.name}
              onBlur={(e) => {
                onRename?.(e.target.value)
                setRenaming(false)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                if (e.key === 'Escape') setRenaming(false)
              }}
              className="input !w-48 !py-1 text-sm"
            />
          ) : (
            <h3 className="cursor-text text-sm font-semibold text-zinc-200" onDoubleClick={() => setRenaming(true)}>
              {section.name}
            </h3>
          )}
          <span className="text-xs text-zinc-600">{assets.length}</span>
          <div className="ml-auto flex items-center gap-0.5 opacity-0 transition-opacity group-hover/sec:opacity-100">
            <AddMenu t={t} onFiles={onAddFiles} onFolder={onAddFolder} onImages={onAddImages} onLink={onAddLink} compact />
            <button onClick={() => setRenaming(true)} className="rounded-lg p-1.5 text-zinc-500 hover:bg-highlight hover:text-white" title={t('common.edit')}>
              <Pencil size={13} />
            </button>
            <button onClick={onDelete} className="rounded-lg p-1.5 text-zinc-500 hover:bg-highlight hover:text-danger" title={t('hub.deleteSection')}>
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      ) : (
        hasSections && assets.length > 0 && (
          <div className="mb-2.5 px-1 text-xs font-semibold uppercase tracking-wide text-zinc-600">{t('hub.ungrouped')}</div>
        )
      )}

      {!collapsed && (
        <>
          {!assets.length ? (
            <div className={`rounded-xl border border-dashed border-edge text-center text-xs text-zinc-600 ${section ? 'px-4 py-6' : 'px-4 py-2.5'}`}>
              {section ? t('hub.sectionEmpty') : t('hub.ungrouped')}
            </div>
          ) : (
            <div className="space-y-3">
              {images.length > 0 && (
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
                  {images.map((a) => (
                    <AssetTile key={a.id} asset={a} t={t} onOpen={() => onOpen(a)} onRemove={() => onRemove(a.id)} />
                  ))}
                </div>
              )}
              {(files.length > 0 || links.length > 0) && (
                <div className="card divide-y divide-edge">
                  {files.map((a) => (
                    <AssetRow key={a.id} asset={a} t={t} onOpen={() => onOpen(a)} onRemove={() => onRemove(a.id)} />
                  ))}
                  {links.map((a) => (
                    <AssetRow key={a.id} asset={a} t={t} onOpen={() => onOpen(a)} onRemove={() => onRemove(a.id)} />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// drag a hub file/image OUT to the OS / other apps (native drag)
function startOsDrag(asset: ProjectAsset, e: React.DragEvent) {
  if (asset.kind === 'url' || !asset.path) return
  e.preventDefault()
  window.wist.projects.dragOut([asset.path])
}
// the small grip starts an internal (between-sections) move via HTML5 dnd
function GripHandle({ assetId }: { assetId: number }) {
  return (
    <span
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/asset', String(assetId))
        e.dataTransfer.effectAllowed = 'move'
      }}
      onClick={(e) => e.stopPropagation()}
      className="cursor-grab text-zinc-600 opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing"
      title="Переместить"
    >
      <GripVertical size={14} />
    </span>
  )
}

function AssetTile({ asset: a, t, onOpen, onRemove }: { asset: ProjectAsset; t: TFn; onOpen: () => void; onRemove: () => void }) {
  return (
    <div
      className="group relative aspect-square overflow-hidden rounded-xl border border-edge bg-raised"
      draggable
      onDragStart={(e) => startOsDrag(a, e)}
      title={t('hub.dragOutHint')}
    >
      {a.path && (
        <img
          src={window.wist.media.fileUrl(a.path)}
          alt={a.label ?? ''}
          loading="lazy"
          onClick={onOpen}
          draggable={false}
          className="h-full w-full cursor-pointer object-cover transition-transform duration-200 group-hover:scale-[1.03]"
        />
      )}
      <div className="absolute left-1.5 top-1.5 rounded bg-black/55 p-0.5 backdrop-blur-sm">
        <GripHandle assetId={a.id} />
      </div>
      <button
        onClick={onRemove}
        className="absolute right-1.5 top-1.5 rounded-lg bg-black/60 p-1 text-zinc-200 opacity-0 transition-all hover:text-danger group-hover:opacity-100"
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
  )
}

function AssetRow({ asset: a, t, onOpen, onRemove }: { asset: ProjectAsset; t: TFn; onOpen: () => void; onRemove: () => void }) {
  const Icon = a.kind === 'folder' ? FolderOpen : a.kind === 'url' ? Link2 : FileText
  const sub = a.kind === 'url' ? a.url : a.path
  const canDragOut = a.kind !== 'url' && !!a.path
  return (
    <div
      className="group flex items-center gap-2 px-3 py-2.5"
      draggable={canDragOut}
      onDragStart={(e) => startOsDrag(a, e)}
      title={canDragOut ? t('hub.dragOutHint') : undefined}
    >
      <GripHandle assetId={a.id} />
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-raised text-zinc-400">
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
        className="shrink-0 rounded-lg p-1.5 text-zinc-600 opacity-0 transition-all hover:text-danger group-hover:opacity-100"
        title={t('project.removeAsset')}
      >
        <Trash2 size={14} />
      </button>
    </div>
  )
}

// ---------------- add menu (files workspace) ----------------

function AddMenu({
  t,
  onFiles,
  onFolder,
  onImages,
  onLink,
  compact,
}: {
  t: TFn
  onFiles: () => void
  onFolder: () => void
  onImages: () => void
  onLink: () => void
  compact?: boolean
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

  const items: Array<[typeof FilePlus2, string, () => void]> = [
    [FilePlus2, t('project.addFiles'), onFiles],
    [FolderPlus, t('project.addFolder'), onFolder],
    [ImagePlus, t('project.addImages'), onImages],
    [Link2, t('project.addLink'), onLink],
  ]

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={compact ? 'rounded-lg p-1.5 text-zinc-500 hover:bg-highlight hover:text-white' : 'btn-ghost !py-1.5 text-xs'}
        title={t('hub.addRef')}
      >
        <Plus size={compact ? 13 : 14} /> {!compact && t('hub.addRef')}
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-44 overflow-hidden rounded-2xl border border-edge bg-card py-1 shadow-[var(--float-shadow)]">
          {items.map(([Icon, label, fn]) => (
            <button
              key={label}
              onClick={() => {
                setOpen(false)
                fn()
              }}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-zinc-300 hover:bg-raised hover:text-white"
            >
              <Icon size={15} className="text-zinc-500" /> {label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

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
