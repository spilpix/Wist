import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BookOpen,
  CheckSquare,
  ChevronRight,
  ChevronsDownUp,
  CircleDashed,
  EyeOff,
  File as FileIcon,
  FileText,
  Film,
  Folder,
  FolderKanban,
  Frame,
  Hash,
  Layers,
  Maximize2,
  Music,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  RotateCcw,
  Search,
  Settings2,
  Share2,
  Sparkles,
  X,
  type LucideIcon,
} from 'lucide-react'
import EmptyState from '../components/ui/EmptyState'
import Spinner from '../components/ui/Spinner'
import GraphCanvas, {
  GRAPH_DEFAULTS,
  type GraphData,
  type GraphEdge,
  type GraphGroup,
  type GraphHandle,
  type GraphNode,
  type GraphTip,
  type GraphView,
} from '../components/GraphCanvas'
import { useSettingsStore, resolvedTheme } from '../store/settingsStore'
import { useUiStore } from '../store/uiStore'
import type {
  Canvas,
  Moment,
  MusicAlbum,
  Note,
  NoteFolder,
  Project,
  ProjectAsset,
  ProjectSection,
  Task,
  Title,
  VaultFile,
} from '../types/models'
import { useI18n, type TKey } from '../i18n'

const GRAPH_DARK = { bg: '#191919', edge: '#363636', text: '#9b9b99', linkBoost: 1 }
const GRAPH_LIGHT = { bg: '#ffffff', edge: '#c4c3c0', text: '#37352f', linkBoost: 2.3 }
const GROUP_COLORS = ['#22d3ee', '#34d399', '#a78bfa', '#38bdf8', '#fbbf24', '#fb923c', '#e879f9', '#f472b6']

// The graph is a structured "map of Bard": a single root, one hub per section
// (Библиотека, Проекты, Записи …), the sub-structure inside each (project → section
// → file, folder → note …), and the real items as leaves. On top of that tree sit the
// knowledge cross-links — shared-attribute tag hubs, foreign keys, wiki-links, mentions.
type GraphKind =
  | 'root'
  | 'group'
  | 'title'
  | 'book'
  | 'note'
  | 'moment'
  | 'project'
  | 'task'
  | 'tag'
  | 'canvas'
  | 'album'
  | 'file'
  | 'folder'
  | 'section'

// electric "neural / galaxy" palette — vivid cool neons (+ a few warm accents) that
// bloom under the glow renderer, so nodes read as synapses / stars, not cardboard dots.
const KIND_HEX: Record<GraphKind, string> = {
  root: '#c4b5fd', // luminous violet core
  group: '#5b6479', // section hubs — neutral slate so the coloured items pop against them
  title: '#34d399', // emerald
  book: '#fbbf24', // amber
  note: '#38bdf8', // sky
  moment: '#e879f9', // fuchsia
  project: '#fb923c', // orange
  task: '#f472b6', // pink
  tag: '#818cf8', // indigo
  canvas: '#22d3ee', // cyan
  album: '#c084fc', // purple
  file: '#7c8089', // neutral grey (structural)
  folder: '#7c8089', // neutral grey (structural)
  section: '#7c8089', // neutral grey (structural)
}
// monochrome mode — one calm neutral for everything; hubs read a touch brighter
const MONO_HEX = (kind: GraphKind): string => (kind === 'root' ? '#cbd5e1' : kind === 'group' ? '#9aa3af' : '#7f8794')

// leaf icon per node kind (sidebar tree)
const KIND_ICON: Partial<Record<GraphKind, LucideIcon>> = {
  title: Film,
  book: BookOpen,
  note: FileText,
  moment: Sparkles,
  project: FolderKanban,
  task: CheckSquare,
  tag: Hash,
  canvas: Frame,
  album: Music,
  file: FileIcon,
  folder: Folder,
  section: Layers,
}

const CONTAINER_KINDS = new Set<GraphKind>(['project', 'section', 'folder'])

// the top-level sections (разделы) — drive both the graph hubs and the sidebar
interface CategoryDef {
  key: string
  labelKey: TKey
  color: string
  icon: LucideIcon
}
const CATEGORIES: CategoryDef[] = [
  { key: 'library', labelKey: 'nav.library', color: '#6fb06f', icon: Film },
  { key: 'projects', labelKey: 'nav.hub', color: '#e67d22', icon: FolderKanban },
  { key: 'notes', labelKey: 'nav.notes', color: '#7aa8c4', icon: FileText },
  { key: 'tasks', labelKey: 'nav.tasks', color: '#c47a7a', icon: CheckSquare },
  { key: 'canvas', labelKey: 'nav.canvas', color: '#5b8bb0', icon: Frame },
  { key: 'music', labelKey: 'nav.music', color: '#c479b8', icon: Music },
  { key: 'files', labelKey: 'nav.localFiles', color: '#8a8278', icon: Folder },
  { key: 'moments', labelKey: 'nav.moments', color: '#a87dc4', icon: Sparkles },
  { key: 'tags', labelKey: 'world.tags', color: '#6b7686', icon: Hash },
]
const CATEGORY_KEYS = CATEGORIES.map((c) => c.key)

interface SourceData {
  titles: Title[]
  notes: Note[]
  noteFolders: NoteFolder[]
  moments: Moment[]
  projects: Project[]
  projSections: Record<number, ProjectSection[]>
  projAssets: Record<number, ProjectAsset[]>
  tasks: Task[]
  canvases: Canvas[]
  albums: MusicAlbum[]
  vault: VaultFile[]
}
const EMPTY_SRC: SourceData = {
  titles: [],
  notes: [],
  noteFolders: [],
  moments: [],
  projects: [],
  projSections: {},
  projAssets: {},
  tasks: [],
  canvases: [],
  albums: [],
  vault: [],
}

// one node in the sidebar tree
interface ExplorerNode {
  id: string
  label: string
  route: string
  kind: GraphKind
  children: ExplorerNode[]
}
interface ExplorerCategory {
  key: string
  label: string
  color: string
  icon: LucideIcon
  count: number
  roots: ExplorerNode[]
}
interface World {
  graph: GraphData
  categories: ExplorerCategory[]
  totalNodes: number
  totalEdges: number
}

const basename = (p: string | null | undefined): string => (p ? p.split(/[\\/]/).filter(Boolean).pop() ?? '' : '')

interface BuildOpts {
  hidden: Set<string>
  query: string
  showOrphans: boolean
  showTags: boolean
  // 'map' = the structured tree (root → section hubs → items); 'links' = Obsidian-style,
  // only the real cross-links (tags / FKs / wiki-links / mentions), no hubs
  structural: boolean
}

/**
 * Build the whole graph + the sidebar tree in one pass (so node ids stay in lock-step).
 * Structural edges (root→section→item, project→section→file …) are solid; cross-links
 * (tags, FKs, wiki-links, mentions) are weak. A real link always beats an inferred one.
 */
function buildWorld(src: SourceData, opts: BuildOpts, names: Record<string, string>): World {
  const { hidden, query, showOrphans, showTags, structural } = opts
  const nodes: GraphNode[] = []
  const index = new Map<string, number>()
  const parentOf = new Map<string, string | null>()
  const catOf = new Map<string, string>()
  const kindOf = new Map<string, GraphKind>()
  const edges: GraphEdge[] = []
  const edgeAt = new Map<string, number>()

  const add = (node: GraphNode, category: string, parent: string | null) => {
    if (index.has(node.id)) return
    index.set(node.id, nodes.length)
    nodes.push(node)
    parentOf.set(node.id, parent)
    catOf.set(node.id, category)
    kindOf.set(node.id, node.kind as GraphKind)
  }
  const link = (aId: string, bId: string, weak = false) => {
    const a = index.get(aId)
    const b = index.get(bId)
    if (a === undefined || b === undefined || a === b) return
    const key = a < b ? `${a}-${b}` : `${b}-${a}`
    const at = edgeAt.get(key)
    if (at !== undefined) {
      if (!weak && edges[at].weak) edges[at].weak = false
      return
    }
    edgeAt.set(key, edges.length)
    edges.push({ a, b, weak })
  }

  // shared-attribute hubs (tags / genres / tools / category) → cluster items
  const facets = new Map<string, { label: string; members: Set<string> }>()
  const facet = (raw: string | null | undefined, owner: string) => {
    if (raw == null) return
    const label = String(raw).trim()
    const key = label.toLowerCase()
    if (key.length < 2) return
    let f = facets.get(key)
    if (!f) facets.set(key, (f = { label, members: new Set() }))
    f.members.add(owner)
  }

  const ROOT = 'root'
  add({ id: ROOT, kind: 'root', label: names.root, sub: null, route: '' }, 'root', null)

  // a section hub is created lazily, only when it actually gets a child
  const catId = (k: string) => `grp:${k}`
  const ensureCat = (k: string): string => {
    const id = catId(k)
    if (!index.has(id)) {
      add({ id, kind: 'group', label: names[`cat.${k}`] ?? k, sub: null, route: '' }, k, ROOT)
      link(ROOT, id)
    }
    return id
  }

  // ---------- Библиотека (titles + books) ----------
  const titleByName = new Map<string, string>()
  if (!hidden.has('library')) {
    for (const t of src.titles) {
      const kind: GraphKind = t.type === 'book' ? 'book' : 'title'
      const id = `t${t.id}`
      add({ id, kind, label: t.title, sub: t.year ? String(t.year) : null, route: `/title/${t.id}` }, 'library', ensureCat('library'))
      link(ensureCat('library'), id)
      titleByName.set(t.title.trim().toLowerCase(), id)
      if (t.original_title) titleByName.set(t.original_title.trim().toLowerCase(), id)
      for (const g of t.genres) facet(g, id)
      for (const tg of t.tags) facet(tg, id)
      facet(t.type, id)
    }
  }

  // ---------- Проекты → секции → файлы ----------
  const projectByName = new Map<string, string>()
  if (!hidden.has('projects')) {
    for (const p of src.projects) {
      const pid = `pr${p.id}`
      add({ id: pid, kind: 'project', label: p.name, sub: p.client ?? p.kind ?? null, route: `/project/${p.id}` }, 'projects', ensureCat('projects'))
      link(ensureCat('projects'), pid)
      projectByName.set(p.name.trim().toLowerCase(), pid)
      for (const tl of p.tools) facet(tl, pid)
      facet(p.kind, pid)
      facet(p.client, pid)
      for (const s of src.projSections[p.id] ?? []) {
        add({ id: `sec${s.id}`, kind: 'section', label: s.name, sub: null, route: `/project/${p.id}` }, 'projects', pid)
        link(pid, `sec${s.id}`)
      }
      for (const a of src.projAssets[p.id] ?? []) {
        const akind: GraphKind = a.kind === 'folder' ? 'folder' : 'file'
        const label = a.label || basename(a.path) || a.url || '—'
        const parent = a.section_id != null && index.has(`sec${a.section_id}`) ? `sec${a.section_id}` : pid
        add({ id: `as${a.id}`, kind: akind, label, sub: null, route: `/project/${p.id}` }, 'projects', parent)
        link(parent, `as${a.id}`)
      }
    }
  }

  // ---------- Записи → папки → заметки ----------
  const noteByName = new Map<string, string>()
  if (!hidden.has('notes')) {
    const folderId = (id: number) => `nf${id}`
    for (const f of src.noteFolders) {
      add({ id: folderId(f.id), kind: 'folder', label: f.name, sub: null, route: '/notes' }, 'notes', null)
    }
    for (const f of src.noteFolders) {
      const parent = f.parent_id != null && index.has(folderId(f.parent_id)) ? folderId(f.parent_id) : ensureCat('notes')
      parentOf.set(folderId(f.id), parent)
      link(parent, folderId(f.id))
    }
    for (const nt of src.notes) {
      const id = `n${nt.id}`
      const parent = nt.folder_id != null && index.has(folderId(nt.folder_id)) ? folderId(nt.folder_id) : ensureCat('notes')
      add(
        {
          id,
          kind: 'note',
          label: nt.title || nt.content.slice(0, 30) || '…',
          sub: nt.tags.length ? '#' + nt.tags.join(' #') : null,
          route: `/notes?open=${nt.id}`,
        },
        'notes',
        parent
      )
      link(parent, id)
      if (nt.title) noteByName.set(nt.title.trim().toLowerCase(), id)
      for (const tg of nt.tags) facet(tg, id)
    }
  }

  // ---------- Задачи ----------
  const taskByName = new Map<string, string>()
  if (!hidden.has('tasks')) {
    for (const tk of src.tasks) {
      const id = `tk${tk.id}`
      add({ id, kind: 'task', label: tk.title || names['cat.tasks'], sub: tk.project_name ?? null, route: '/tasks' }, 'tasks', ensureCat('tasks'))
      link(ensureCat('tasks'), id)
      taskByName.set(tk.title.trim().toLowerCase(), id)
      for (const tg of tk.tags) facet(tg, id)
    }
  }

  // ---------- Холсты ----------
  if (!hidden.has('canvas')) {
    for (const c of src.canvases) {
      const id = `cv${c.id}`
      add({ id, kind: 'canvas', label: c.name, sub: null, route: `/canvas/${c.id}` }, 'canvas', ensureCat('canvas'))
      link(ensureCat('canvas'), id)
    }
  }

  // ---------- Музыка (альбомы) ----------
  if (!hidden.has('music')) {
    for (const al of src.albums) {
      const id = `al${al.key}`
      add({ id, kind: 'album', label: al.album || '—', sub: al.artist ?? null, route: '/music' }, 'music', ensureCat('music'))
      link(ensureCat('music'), id)
      facet(al.artist, id)
    }
  }

  // ---------- Файлы (vault-дерево) ----------
  if (!hidden.has('files')) {
    const vfId = (id: number) => `vf${id}`
    for (const v of src.vault) {
      const isFolder = v.kind === 'folder' || v.kind === 'diskfolder'
      add({ id: vfId(v.id), kind: isFolder ? 'folder' : 'file', label: v.name, sub: null, route: '/vault' }, 'files', null)
    }
    for (const v of src.vault) {
      const parent = v.parent_id != null && index.has(vfId(v.parent_id)) ? vfId(v.parent_id) : ensureCat('files')
      parentOf.set(vfId(v.id), parent)
      link(parent, vfId(v.id))
    }
  }

  // ---------- Моменты ----------
  if (!hidden.has('moments')) {
    for (const m of src.moments) {
      const id = `m${m.id}`
      add(
        { id, kind: 'moment', label: m.note || m.title_name || names['cat.moments'], sub: m.title_name ?? null, route: `/title/${m.title_id}` },
        'moments',
        ensureCat('moments')
      )
      link(ensureCat('moments'), id)
      if (m.title_id != null) link(id, `t${m.title_id}`, true)
    }
  }

  // ---------- cross-links (knowledge layer) ----------
  if (!hidden.has('notes')) {
    for (const nt of src.notes) {
      if (nt.linked_title_id != null) link(`n${nt.id}`, `t${nt.linked_title_id}`, true)
      if (nt.project_id != null) link(`n${nt.id}`, `pr${nt.project_id}`, true)
    }
  }
  if (!hidden.has('tasks')) {
    for (const tk of src.tasks) {
      if (tk.project_id != null) link(`tk${tk.id}`, `pr${tk.project_id}`, true)
      if (tk.linked_title_id != null) link(`tk${tk.id}`, `t${tk.linked_title_id}`, true)
    }
  }

  // ---------- tag hubs ----------
  if (showTags) {
    for (const [key, f] of facets) {
      if (f.members.size < 2) continue
      const id = `tag:${key}`
      add({ id, kind: 'tag', label: '#' + f.label, sub: null, route: '' }, 'tags', null)
      for (const owner of f.members) link(owner, id, true)
    }
  }

  // ---------- wiki-links + soft mentions (note bodies) ----------
  if (!hidden.has('notes')) {
    for (const nt of src.notes) {
      for (const m of nt.content.matchAll(/\[\[([^\]]+)\]\]/g)) {
        const key = m[1].trim().toLowerCase()
        const target = noteByName.get(key) ?? titleByName.get(key) ?? projectByName.get(key) ?? taskByName.get(key)
        if (target) link(`n${nt.id}`, target)
      }
    }
    const mentionNames: Array<{ key: string; id: string }> = []
    for (const mp of [titleByName, projectByName, noteByName, taskByName]) {
      for (const [k, id] of mp) if (k.length >= 4) mentionNames.push({ key: k, id })
    }
    for (const nt of src.notes) {
      if (!nt.content) continue
      const hay = nt.content.toLowerCase()
      const self = `n${nt.id}`
      for (const { key, id } of mentionNames) if (id !== self && hay.includes(key)) link(self, id, true)
    }
  }

  // ---------- filters (mode + search + orphans) ----------
  let keepIdx = nodes.map((_, i) => i)
  const q = query.trim().toLowerCase()
  if (q) {
    keepIdx = keepIdx.filter((i) => {
      const n = nodes[i]
      if (structural && n.kind === 'root') return true
      return n.label.toLowerCase().includes(q) || (n.sub?.toLowerCase().includes(q) ?? false)
    })
  }
  // 'Связи' mode: drop the structural skeleton (root + section hubs) so only the items
  // and their REAL cross-links remain — an organic, Obsidian-style web.
  if (!structural) keepIdx = keepIdx.filter((i) => nodes[i].kind !== 'root' && nodes[i].kind !== 'group')
  // edges actually drawn: everything in 'map' mode, only the weak cross-links in 'links'
  const effEdges = structural ? edges : edges.filter((e) => e.weak)
  if (!showOrphans) {
    const keptSet = new Set(keepIdx)
    const deg = new Map<number, number>()
    for (const e of effEdges) {
      if (keptSet.has(e.a) && keptSet.has(e.b)) {
        deg.set(e.a, (deg.get(e.a) ?? 0) + 1)
        deg.set(e.b, (deg.get(e.b) ?? 0) + 1)
      }
    }
    keepIdx = keepIdx.filter((i) => (deg.get(i) ?? 0) > 0)
  }

  // ---------- canvas graph (remapped to kept set) ----------
  const remap = new Map<number, number>()
  const outNodes = keepIdx.map((i, k) => {
    remap.set(i, k)
    return nodes[i]
  })
  const outEdges = effEdges
    .filter((e) => remap.has(e.a) && remap.has(e.b))
    .map((e) => ({ a: remap.get(e.a)!, b: remap.get(e.b)!, weak: e.weak }))
  const graph: GraphData = { nodes: outNodes, edges: outEdges, kindNames: names }

  // ---------- sidebar tree (kept items, nested by structural parent) ----------
  const keptIds = new Set(outNodes.map((n) => n.id))
  const nearestKeptParent = (id: string): string | null => {
    let p = parentOf.get(id) ?? null
    while (p) {
      const k = kindOf.get(p)
      if (keptIds.has(p) && k !== 'group' && k !== 'root') return p
      p = parentOf.get(p) ?? null
    }
    return null
  }
  const exById = new Map<string, ExplorerNode>()
  const catRoots = new Map<string, ExplorerNode[]>()
  for (const n of outNodes) {
    if (n.kind === 'group' || n.kind === 'root') continue
    exById.set(n.id, { id: n.id, label: n.label, route: n.route, kind: n.kind as GraphKind, children: [] })
  }
  for (const n of outNodes) {
    const ex = exById.get(n.id)
    if (!ex) continue
    const dp = nearestKeptParent(n.id)
    if (dp && exById.has(dp)) {
      exById.get(dp)!.children.push(ex)
    } else {
      const cat = catOf.get(n.id) ?? 'misc'
      if (!catRoots.has(cat)) catRoots.set(cat, [])
      catRoots.get(cat)!.push(ex)
    }
  }
  const sortNodes = (arr: ExplorerNode[]) => {
    arr.sort((a, b) => {
      const ca = CONTAINER_KINDS.has(a.kind) ? 0 : 1
      const cb = CONTAINER_KINDS.has(b.kind) ? 0 : 1
      return ca - cb || a.label.localeCompare(b.label)
    })
    for (const n of arr) if (n.children.length) sortNodes(n.children)
  }
  const countTree = (arr: ExplorerNode[]): number => arr.reduce((s, n) => s + 1 + countTree(n.children), 0)
  const categories: ExplorerCategory[] = CATEGORIES.map((c) => {
    const roots = catRoots.get(c.key) ?? []
    sortNodes(roots)
    return { key: c.key, label: names[`cat.${c.key}`] ?? c.key, color: c.color, icon: c.icon, count: countTree(roots), roots }
  }).filter((c) => c.roots.length)

  return { graph, categories, totalNodes: outNodes.length, totalEdges: outEdges.length }
}

export default function MemoryTree() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const containerRef = useRef<HTMLDivElement>(null)
  const graphRef = useRef<GraphHandle | null>(null)
  const themeSetting = useSettingsStore((s) => s.settings?.theme)
  const dark = (themeSetting === 'system' ? resolvedTheme() : themeSetting ?? 'light') === 'dark'
  const palette = dark ? GRAPH_DARK : GRAPH_LIGHT

  // the graph has its own explorer rail — fold the app sidebar away while it's open,
  // then restore whatever the user had on the way out (without touching their pref).
  const setSidebarCollapsed = useUiStore((s) => s.setSidebarCollapsed)
  useEffect(() => {
    const wasCollapsed = useUiStore.getState().sidebarCollapsed
    setSidebarCollapsed(true, false)
    return () => setSidebarCollapsed(wasCollapsed, false)
  }, [setSidebarCollapsed])

  const [src, setSrc] = useState<SourceData | null>(null)
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const [showOrphans, setShowOrphans] = useState(true)
  const [showTags, setShowTags] = useState(true)
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(new Set())
  const [openNodes, setOpenNodes] = useState<Set<string>>(new Set())
  const [panelOpen, setPanelOpen] = useState(false)
  const [explorerOpen, setExplorerOpen] = useState(true)
  // 'map' = structured hubs+items; false = links-only (Obsidian-style web)
  const [structural, setStructural] = useState<boolean>(() => localStorage.getItem('wist.graphStructural') !== '0')
  const [mono, setMono] = useState<boolean>(() => localStorage.getItem('wist.graphMono') === '1')
  const [view, setView] = useState<GraphView>(() => {
    try {
      const raw = JSON.parse(localStorage.getItem('wist.graphView') ?? 'null')
      return raw && typeof raw === 'object' ? { ...GRAPH_DEFAULTS, ...raw } : { ...GRAPH_DEFAULTS }
    } catch {
      return { ...GRAPH_DEFAULTS }
    }
  })
  // persist the view sliders + the two mode toggles (Obsidian remembers these)
  useEffect(() => {
    try {
      localStorage.setItem('wist.graphView', JSON.stringify(view))
    } catch {
      /* storage unavailable */
    }
  }, [view])
  useEffect(() => {
    try {
      localStorage.setItem('wist.graphStructural', structural ? '1' : '0')
      localStorage.setItem('wist.graphMono', mono ? '1' : '0')
    } catch {
      /* storage unavailable */
    }
  }, [structural, mono])
  const [tip, setTip] = useState<(GraphTip & { x: number; y: number }) | null>(null)
  const [groups, setGroups] = useState<GraphGroup[]>(() => {
    try {
      const raw = JSON.parse(localStorage.getItem('wist.graphGroups') ?? '[]')
      return Array.isArray(raw) ? raw : []
    } catch {
      return []
    }
  })
  const saveGroups = (next: GraphGroup[]) => {
    setGroups(next)
    try {
      localStorage.setItem('wist.graphGroups', JSON.stringify(next))
    } catch {
      /* storage unavailable */
    }
  }

  useEffect(() => {
    let cancelled = false
    const safe = <T,>(p: Promise<T>, d: T): Promise<T> => p.catch(() => d)
    ;(async () => {
      const [titles, notes, noteFolders, moments, projects, tasks, canvases, albums] = await Promise.all([
        safe(window.wist.titles.list({}), [] as Title[]),
        safe(window.wist.notes.list({}), [] as Note[]),
        safe(window.wist.noteFolders.list(), [] as NoteFolder[]),
        safe(window.wist.moments.list({}), [] as Moment[]),
        safe(window.wist.projects.list(), [] as Project[]),
        safe(window.wist.tasks.list({}), [] as Task[]),
        safe(window.wist.canvas.list(), [] as Canvas[]),
        safe(window.wist.music.albums(), [] as MusicAlbum[]),
      ])
      const projSections: Record<number, ProjectSection[]> = {}
      const projAssets: Record<number, ProjectAsset[]> = {}
      await Promise.all(
        projects.flatMap((p) => [
          safe(window.wist.projects.sections(p.id), [] as ProjectSection[]).then((s) => {
            projSections[p.id] = s
          }),
          safe(window.wist.projects.assets(p.id), [] as ProjectAsset[]).then((a) => {
            projAssets[p.id] = a
          }),
        ])
      )
      // walk the vault tree, but cap the work so a huge library can't stall the graph
      const vault: VaultFile[] = []
      let budget = 240
      const walk = async (parentId: number | null, depth: number) => {
        if (budget <= 0 || depth > 5) return
        const entries = await safe(window.wist.vault.list(parentId), [] as VaultFile[])
        for (const e of entries) {
          if (budget <= 0) break
          vault.push(e)
          budget--
          if ((e.kind === 'folder' || e.kind === 'diskfolder') && depth < 5) await walk(e.id, depth + 1)
        }
      }
      await walk(null, 0)
      if (!cancelled) setSrc({ titles, notes, noteFolders, moments, projects, projSections, projAssets, tasks, canvases, albums, vault })
    })().catch((e) => {
      // a failed load must never leave the graph stuck on the spinner
      console.error('graph load failed', e)
      if (!cancelled) setSrc((prev) => prev ?? EMPTY_SRC)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // tooltip heads + section labels in one map (the builder reads `cat.<key>`)
  const names = useMemo<Record<string, string>>(() => {
    const m: Record<string, string> = {
      root: 'Bard',
      group: t('world.kind.group'),
      title: t('world.kind.title'),
      book: t('world.kind.book'),
      note: t('world.kind.note'),
      moment: t('world.kind.moment'),
      project: t('world.kind.project'),
      task: t('world.kind.task'),
      tag: t('world.kind.tag'),
      canvas: t('world.kind.canvas'),
      album: t('world.kind.album'),
      file: t('world.kind.file'),
      folder: t('world.kind.folder'),
      section: t('world.kind.section'),
    }
    for (const c of CATEGORIES) m[`cat.${c.key}`] = t(c.labelKey)
    return m
  }, [t])

  const world = useMemo(
    () => (src ? buildWorld(src, { hidden, query, showOrphans, showTags, structural }, names) : null),
    [src, hidden, query, showOrphans, showTags, structural, names]
  )
  const graph = world?.graph ?? { nodes: [], edges: [], kindNames: names }

  const onTip = useCallback((wt: GraphTip | null) => {
    if (!wt) return setTip(null)
    const rect = containerRef.current?.getBoundingClientRect()
    if (rect) setTip({ ...wt, x: wt.clientX - rect.left, y: wt.clientY - rect.top })
  }, [])
  const colorOf = useCallback(
    (kind: string) => (mono ? MONO_HEX(kind as GraphKind) : KIND_HEX[kind as GraphKind] ?? '#7f8794'),
    [mono]
  )
  // root / section / tag hubs carry no route — clicking one just re-centres the graph
  const onNavigate = useCallback((route: string) => { if (route) navigate(route) }, [navigate])

  const toggleCat = (key: string) =>
    setCollapsedCats((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  const toggleOpen = (id: string) =>
    setOpenNodes((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  const toggleHidden = (key: string) => {
    if (key === 'tags') return setShowTags((v) => !v)
    setHidden((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  if (!src) return <Spinner />

  const total =
    src.titles.length +
    src.notes.length +
    src.moments.length +
    src.projects.length +
    src.tasks.length +
    src.canvases.length +
    src.albums.length +
    src.vault.length
  if (total === 0) {
    return (
      <div className="page">
        <EmptyState icon={Share2} title={t('tree.emptyTitle')} subtitle={t('tree.emptySubtitle')} />
      </div>
    )
  }

  type NumKey = 'nodeScale' | 'linkWidth' | 'linkDistance' | 'repel' | 'labelFade' | 'centerForce' | 'linkForce'
  const slider = (labelKey: TKey, key: NumKey, min: number, max: number, step: number) => (
    <label className="block">
      <span className="mb-1 flex items-center justify-between text-[11px] text-zinc-500">{t(labelKey)}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={view[key]}
        onChange={(e) => setView((v) => ({ ...v, [key]: Number(e.target.value) }))}
        className="w-full"
      />
    </label>
  )

  // recursive Obsidian-style tree row. Indentation comes from nesting each level's
  // children in a container whose LEFT BORDER is the indent guide (the "path" line);
  // it brightens while the parent row is hovered (peer-hover).
  const renderNode = (node: ExplorerNode): JSX.Element => {
    const hasChildren = node.children.length > 0
    const isOpen = openNodes.has(node.id)
    const Icon = KIND_ICON[node.kind] ?? FileIcon
    return (
      <div key={node.id}>
        <div
          className="group/row peer/row flex cursor-pointer items-center gap-1 rounded-md py-[3px] pl-1 pr-1.5 text-[13px] text-zinc-300 transition-colors hover:bg-highlight hover:text-white"
          title={node.label}
          onMouseEnter={() => graphRef.current?.highlight(node.id)}
          onMouseLeave={() => graphRef.current?.highlight(null)}
          onClick={() => (hasChildren ? toggleOpen(node.id) : graphRef.current?.focus(node.id))}
          onDoubleClick={() => node.route && navigate(node.route)}
        >
          {hasChildren ? (
            <ChevronRight
              size={13}
              className={`shrink-0 text-zinc-600 transition-transform ${isOpen ? 'rotate-90' : ''}`}
            />
          ) : (
            <span className="w-[13px] shrink-0" />
          )}
          <Icon size={13} className="shrink-0 text-zinc-500" />
          <span className="flex-1 truncate">{node.label}</span>
          {hasChildren && <span className="text-[10px] tabular-nums text-zinc-600 opacity-0 group-hover/row:opacity-100">{node.children.length}</span>}
        </div>
        {hasChildren && isOpen && (
          <div className="ml-[11px] border-l border-edge pl-1.5 transition-colors peer-hover/row:border-zinc-600">
            {node.children.map(renderNode)}
          </div>
        )}
      </div>
    )
  }

  const categories = world?.categories ?? []
  // sections the user explicitly hid (incl. tags when the tags toggle is off) — listed
  // in a restorable "Скрытые" strip at the bottom so a hidden section is never lost
  const hiddenCats = CATEGORIES.filter((c) => (c.key === 'tags' ? !showTags : hidden.has(c.key)))
  const allOpen = categories.length > 0 && categories.every((c) => !collapsedCats.has(c.key))
  const toggleAll = () => setCollapsedCats(allOpen ? new Set(categories.map((c) => c.key)) : new Set())

  return (
    <div className="flex h-full min-h-0">
      {/* ───────── explorer sidebar (Notes-style: icon toolbar + tree, no title) ───────── */}
      <aside
        className={`flex shrink-0 flex-col bg-surface transition-[width] duration-200 ease-out ${
          explorerOpen ? 'w-[264px] border-r border-edge' : 'w-0 overflow-hidden'
        }`}
      >
        {/* toolbar */}
        <div className="flex items-center gap-0.5 border-b border-edge px-1.5 py-1.5">
          <button
            title={allOpen ? t('world.collapseAll') : t('world.expandAll')}
            onClick={toggleAll}
            className="rounded p-1.5 text-zinc-500 transition-colors hover:bg-highlight hover:text-zinc-200"
          >
            <ChevronsDownUp size={15} />
          </button>
          <button
            title={t('world.tags')}
            onClick={() => setShowTags((v) => !v)}
            className={`rounded p-1.5 transition-colors hover:bg-highlight ${showTags ? 'bg-highlight text-zinc-200' : 'text-zinc-500 hover:text-zinc-200'}`}
          >
            <Hash size={15} />
          </button>
          <button
            title={t('world.orphans')}
            onClick={() => setShowOrphans((v) => !v)}
            className={`rounded p-1.5 transition-colors hover:bg-highlight ${showOrphans ? 'bg-highlight text-zinc-200' : 'text-zinc-500 hover:text-zinc-200'}`}
          >
            <CircleDashed size={15} />
          </button>
          <div className="flex-1" />
          <span
            className="px-1 text-[10px] tabular-nums text-zinc-600"
            title={t('world.counts', { n: world?.totalNodes ?? 0, m: world?.totalEdges ?? 0 })}
          >
            {world?.totalNodes ?? 0}·{world?.totalEdges ?? 0}
          </span>
          <button
            title={t('world.hideTree')}
            onClick={() => setExplorerOpen(false)}
            className="rounded p-1.5 text-zinc-500 transition-colors hover:bg-highlight hover:text-zinc-200"
          >
            <PanelLeftClose size={15} />
          </button>
        </div>

        {/* search */}
        <div className="px-2 pb-1 pt-2">
          <div className="relative">
            <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-600" />
            <input
              className="w-full rounded-lg border border-edge bg-field py-1.5 pl-7 pr-2 text-xs text-zinc-200 outline-none transition-colors placeholder:text-zinc-600 focus:border-accent"
              placeholder={t('world.search')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>

        {/* tree */}
        <div className="min-h-0 flex-1 overflow-y-auto px-1 py-1">
          {categories.length === 0 && hiddenCats.length === 0 && (
            <div className="px-3 py-10 text-center text-xs text-zinc-600">{t('world.nothing')}</div>
          )}
          {categories.map((cat) => {
            const open = !collapsedCats.has(cat.key)
            const Icon = cat.icon
            return (
              <div key={cat.key} className="mb-px">
                <div className="group/cat flex items-center rounded pr-1 hover:bg-highlight/60">
                  <button
                    onClick={() => toggleCat(cat.key)}
                    className="flex min-w-0 flex-1 items-center gap-1.5 py-1 pl-1.5 pr-1 text-left"
                  >
                    <ChevronRight size={12} className={`shrink-0 text-zinc-600 transition-transform ${open ? 'rotate-90' : ''}`} />
                    <Icon size={14} className="shrink-0 text-zinc-500" />
                    <span className="flex-1 truncate text-[11px] font-semibold uppercase tracking-[0.06em] text-zinc-400">{cat.label}</span>
                    <span className="shrink-0 tabular-nums text-[10px] text-zinc-600">{cat.count}</span>
                  </button>
                  <button
                    onClick={() => toggleHidden(cat.key)}
                    title={t('world.hide')}
                    className="shrink-0 rounded p-1 text-zinc-600 opacity-0 transition-all hover:text-zinc-200 group-hover/cat:opacity-100"
                  >
                    <EyeOff size={12} />
                  </button>
                </div>
                <div className={`collapse-morph ${open ? 'is-open' : ''}`}>
                  <div>
                    <div className="my-0.5 ml-[15px] border-l border-edge pl-1.5">{cat.roots.map(renderNode)}</div>
                  </div>
                </div>
              </div>
            )
          })}

          {/* hidden sections — click a chip to bring it back */}
          {hiddenCats.length > 0 && (
            <div className="mt-2 border-t border-edge pt-2">
              <div className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-600">{t('world.hidden')}</div>
              <div className="flex flex-wrap gap-1 px-1.5">
                {hiddenCats.map((c) => {
                  const CIcon = c.icon
                  return (
                    <button
                      key={c.key}
                      onClick={() => toggleHidden(c.key)}
                      title={t('world.show')}
                      className="group/hid flex items-center gap-1.5 rounded-md border border-edge bg-raised px-2 py-1 text-[11px] text-zinc-500 transition-colors hover:bg-highlight hover:text-zinc-200"
                    >
                      <CIcon size={12} className="shrink-0 text-zinc-500 opacity-70" />
                      <span className="truncate">{t(c.labelKey)}</span>
                      <EyeOff size={11} className="shrink-0 text-zinc-600 transition-colors group-hover/hid:text-zinc-300" />
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-edge px-3 py-2 text-[10px] leading-relaxed text-zinc-600">{t('world.explorerHint')}</div>
      </aside>

      {/* ───────── graph canvas ───────── */}
      <div ref={containerRef} className="relative min-w-0 flex-1 overflow-hidden" style={{ background: palette.bg }}>
        <GraphCanvas ref={graphRef} data={graph} accent="#a78bfa" colorOf={colorOf} groups={groups} view={view} palette={palette} onNavigate={onNavigate} onTip={onTip} />

        {/* top-left: reopen the explorer (when hidden) + the Карта / Связи view switch */}
        <div className="absolute left-3 top-3 flex items-center gap-1.5">
          {!explorerOpen && (
            <button
              onClick={() => setExplorerOpen(true)}
              title={t('world.showTree')}
              className="rounded-lg border border-edge bg-surface/90 p-2 text-zinc-400 backdrop-blur transition-colors hover:text-zinc-200"
            >
              <PanelLeftOpen size={14} />
            </button>
          )}
          <div className="flex items-center rounded-lg border border-edge bg-surface/90 p-0.5 text-[12px] font-medium backdrop-blur">
            <button
              onClick={() => setStructural(true)}
              title={t('world.mapHint')}
              className={`rounded-md px-2.5 py-1 transition-colors ${structural ? 'bg-accent text-[#fff]' : 'text-zinc-400 hover:text-zinc-200'}`}
            >
              {t('world.map')}
            </button>
            <button
              onClick={() => setStructural(false)}
              title={t('world.linksHint')}
              className={`rounded-md px-2.5 py-1 transition-colors ${!structural ? 'bg-accent text-[#fff]' : 'text-zinc-400 hover:text-zinc-200'}`}
            >
              {t('world.links')}
            </button>
          </div>
        </div>

        <div className="absolute right-3 top-3 flex gap-1.5">
          <button
            onClick={() => graphRef.current?.animate()}
            title={t('world.play')}
            className="rounded-lg border border-edge bg-surface/90 p-2 text-zinc-400 backdrop-blur transition-colors hover:text-zinc-200"
          >
            <Play size={14} />
          </button>
          <button
            onClick={() => graphRef.current?.fit()}
            title={t('world.fit')}
            className="rounded-lg border border-edge bg-surface/90 p-2 text-zinc-400 backdrop-blur transition-colors hover:text-zinc-200"
          >
            <Maximize2 size={14} />
          </button>
          <button
            onClick={() => setPanelOpen((v) => !v)}
            title={t('world.view')}
            className={`rounded-lg border border-edge p-2 transition-colors ${
              panelOpen ? 'bg-accent text-[#fff]' : 'bg-surface/90 text-zinc-400 backdrop-blur hover:text-zinc-200'
            }`}
          >
            <Settings2 size={14} />
          </button>
        </div>

        {panelOpen && (
          <div className="absolute right-3 top-14 max-h-[82vh] w-64 space-y-4 overflow-y-auto rounded-2xl border border-edge bg-surface/95 p-3.5 backdrop-blur" style={{ boxShadow: 'var(--float-shadow)' }}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-300">{t('world.view')}</span>
              <button className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-300" onClick={() => setView({ ...GRAPH_DEFAULTS })}>
                <RotateCcw size={11} /> {t('world.reset')}
              </button>
            </div>

            {/* Groups — colour rules by query (kind:, tag:, or text) */}
            <div className="space-y-1.5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500">{t('world.groups')}</div>
              {groups.map((g) => (
                <div key={g.id} className="flex items-center gap-1.5">
                  <input
                    className="input !py-1 text-[11px]"
                    placeholder={t('world.groupQueryPh')}
                    value={g.query}
                    onChange={(e) => saveGroups(groups.map((x) => (x.id === g.id ? { ...x, query: e.target.value } : x)))}
                  />
                  <label className="relative h-5 w-5 shrink-0 cursor-pointer rounded-full border border-edge" style={{ backgroundColor: g.color }} title={t('world.groupColor')}>
                    <input type="color" value={g.color} onChange={(e) => saveGroups(groups.map((x) => (x.id === g.id ? { ...x, color: e.target.value } : x)))} className="absolute inset-0 cursor-pointer opacity-0" />
                  </label>
                  <button className="shrink-0 text-zinc-600 transition-colors hover:text-danger" onClick={() => saveGroups(groups.filter((x) => x.id !== g.id))}>
                    <X size={13} />
                  </button>
                </div>
              ))}
              <button
                className="w-full rounded-lg border border-edge bg-raised py-1 text-[11px] text-zinc-400 transition-colors hover:bg-highlight hover:text-zinc-200"
                onClick={() => saveGroups([...groups, { id: Math.random().toString(36).slice(2), query: '', color: GROUP_COLORS[groups.length % GROUP_COLORS.length] }])}
              >
                + {t('world.newGroup')}
              </button>
            </div>

            {/* Display */}
            <div className="space-y-2.5 border-t border-edge pt-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500">{t('world.display')}</div>
              <label className="flex cursor-pointer items-center justify-between text-[11px] text-zinc-500">
                {t('world.arrows')}
                <input type="checkbox" checked={view.arrows} onChange={(e) => setView((v) => ({ ...v, arrows: e.target.checked }))} className="h-3.5 w-3.5 accent-[var(--accent)]" />
              </label>
              {slider('world.labels', 'labelFade', 0, 2, 0.05)}
              {slider('world.nodeSize', 'nodeScale', 0.5, 2, 0.05)}
              {slider('world.linkWidth', 'linkWidth', 0.4, 2.5, 0.05)}
              <label className="flex cursor-pointer items-center justify-between text-[11px] text-zinc-500">
                {t('world.mono')}
                <input type="checkbox" checked={mono} onChange={(e) => setMono(e.target.checked)} className="h-3.5 w-3.5 accent-[var(--accent)]" />
              </label>
              <button className="w-full rounded-lg bg-raised py-1 text-[11px] font-medium text-zinc-300 transition-colors hover:bg-highlight hover:text-white" onClick={() => graphRef.current?.animate()}>
                {t('world.animate')}
              </button>
            </div>

            {/* Forces */}
            <div className="space-y-2.5 border-t border-edge pt-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500">{t('world.forces')}</div>
              {slider('world.centerForce', 'centerForce', 0, 0.3, 0.01)}
              {slider('world.repel', 'repel', 10, 600, 10)}
              {slider('world.linkForce', 'linkForce', 0, 0.5, 0.01)}
              {slider('world.linkDist', 'linkDistance', 20, 300, 5)}
            </div>
          </div>
        )}

        {graph.nodes.length === 0 && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-zinc-600">{t('world.nothing')}</div>
        )}
        {tip && (
          <div
            className="pointer-events-none absolute z-10 max-w-xs rounded-xl border border-edge bg-raised px-3 py-2"
            style={{
              left: Math.min(tip.x + 14, (containerRef.current?.clientWidth ?? 600) - 240),
              top: Math.min(Math.max(tip.y - 8, 4), (containerRef.current?.clientHeight ?? 400) - 90),
              boxShadow: 'var(--float-shadow)',
            }}
          >
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: tip.color }}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: tip.color }} />
              {tip.head}
            </div>
            <div className="mt-0.5 truncate text-sm text-zinc-200">{tip.label}</div>
            {tip.sub && <div className="truncate text-xs text-zinc-500">{tip.sub}</div>}
          </div>
        )}
      </div>
    </div>
  )
}
