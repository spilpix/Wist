import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { listNotes } from '../data/notes'
import { listProjects } from '../data/projects'
import { listTasks } from '../data/tasks'
import { listCanvases } from '../data/canvas'
import { listAllEdges } from '../data/edges'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  CircleDashed,
  FolderKanban,
  Maximize2,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  RotateCcw,
  Search,
  Settings2,
  Share2,
  X,
} from 'lucide-react'
import EmptyState from '../components/ui/EmptyState'
import Spinner from '../components/ui/Spinner'
import GraphCanvas, {
  GRAPH_DEFAULTS,
  type GraphEdge,
  type GraphGroup,
  type GraphHandle,
  type GraphNode,
  type GraphTip,
  type GraphView,
} from '../components/GraphCanvas'
import { useSettingsStore, resolvedTheme } from '../store/settingsStore'
import { hueForType, objColorHex } from '../lib/objectColors'
import { useUiStore } from '../store/uiStore'
import type { Canvas, Note, Project, RawEdge, Task } from '../types/models'
import { useI18n, type TKey } from '../i18n'

// ── Theme palettes ────────────────────────────────────────────────────────────
// Obsidian-style graph: deep near-black canvas (dark) / soft off-white (light),
// quiet edges so the bright dots pop.
const GRAPH_DARK  = { bg: '#16161a', edge: '#3a3a44', text: '#a6a6b8', linkBoost: 1.5 }
const GRAPH_LIGHT = { bg: '#fbfbfd', edge: '#cfd0da', text: '#5a5a6a', linkBoost: 1.5 }
const GROUP_COLORS = ['#60a5fa', '#fb923c', '#c084fc', '#34d399', '#94a3b8', '#22d3ee']

// Node colour = the SINGLE object palette (objectColors → --obj-* OKLCH), resolved to a
// concrete value for <canvas>. Theme-correct automatically (the vars flip with the theme),
// and identical to the type colours used in the sidebar / badges / properties.
const dotColor = (kind: string): string => objColorHex(hueForType(kind))

// ── Data types ────────────────────────────────────────────────────────────────
interface SourceData {
  notes: Note[]
  projects: Project[]
  tasks: Task[]
  canvases: Canvas[]
  edges: RawEdge[]
}
const EMPTY_SRC: SourceData = { notes: [], projects: [], tasks: [], canvases: [], edges: [] }

interface SidebarProject {
  key: string
  id: number
  label: string
  linkedCount: number
}
interface World {
  graph: { nodes: GraphNode[]; edges: GraphEdge[]; kindNames: Record<string, string> }
  sidebarProjects: SidebarProject[]
  totalNodes: number
  totalEdges: number
  orphanCount: number
}

// ── Connected-map algorithm (v9) ──────────────────────────────────────────────
//
// Goal: a clean, always-connected web like the reference design — every object
// hangs off a structural anchor so there are NO floating islands.
//
//   root «Бард»  →  kind hubs (Проекты / Задачи / Заметки / Холсты)
//                →  projects  →  their contained items (real `contains` edges)
//                →  loose items hang off their kind hub
//   `refers` edges are drawn as extra cross-links between items.
//
// Every node therefore has ≥1 line; the canvas focus/dim does the rest (hovering
// a node lights its neighbours in accent and ghosts everything else).

const ROOT_ID = '__root'
const HUB_LABEL: Record<string, string> = {
  project: 'Проекты',
  task:    'Задачи',
  note:    'Заметки',
  canvas:  'Холсты',
}
const HUB_ORDER = ['project', 'note', 'task', 'canvas']

function buildWorld(
  src: SourceData,
  opts: { query: string; showOrphans: boolean; dark: boolean }
): World {
  const { query, showOrphans } = opts
  const q = query.trim().toLowerCase()

  // 1. Object registry key="type:id" → display meta
  interface ObjMeta { label: string; route: string; kind: string }
  const meta = new Map<string, ObjMeta>()
  for (const p of src.projects)
    meta.set(`project:${p.id}`, { label: p.name, route: `/project/${p.id}`, kind: 'project' })
  for (const n of src.notes)
    meta.set(`note:${n.id}`, {
      label: n.title || n.content.slice(0, 30) || '…',
      route: `/notes?open=${n.id}`,
      kind: 'note',
    })
  for (const t of src.tasks)
    meta.set(`task:${t.id}`, { label: t.title || '…', route: '/tasks', kind: 'task' })
  for (const c of src.canvases)
    meta.set(`canvas:${c.id}`, { label: c.name, route: `/canvas/${c.id}`, kind: 'canvas' })

  const matchesQuery = (label: string) => !q || label.toLowerCase().includes(q)

  // 2. Partition edges → project containment
  const containsEdges = src.edges.filter((e) => e.kind === 'contains')
  const refersEdges   = src.edges.filter((e) => e.kind === 'refers')

  const projectItems = new Map<string, string[]>() // projectKey → [itemKey]
  const containedSet = new Set<string>()           // itemKeys that live in a project
  for (const e of containsEdges) {
    const pk = `${e.src_type}:${e.src_id}`
    const ik = `${e.dst_type}:${e.dst_id}`
    if (!meta.has(pk) || !meta.has(ik)) continue
    if (!projectItems.has(pk)) projectItems.set(pk, [])
    projectItems.get(pk)!.push(ik)
    containedSet.add(ik)
  }

  // 3. Node + edge accumulators
  const nodes: GraphNode[] = []
  const index = new Map<string, number>()
  const push = (node: GraphNode): number => {
    const existing = index.get(node.id)
    if (existing !== undefined) return existing
    index.set(node.id, nodes.length)
    nodes.push(node)
    return nodes.length - 1
  }
  const addObj = (key: string, ix: number, iy: number): boolean => {
    if (index.has(key)) return true
    const m = meta.get(key)
    if (!m || !matchesQuery(m.label)) return false
    push({
      id: key, kind: m.kind, label: m.label, sub: null, route: m.route,
      initialX: ix, initialY: iy,
    })
    return true
  }

  const graphEdges: GraphEdge[] = []
  const edgeSet = new Set<string>()
  const link = (aKey: string, bKey: string, weak: boolean) => {
    const a = index.get(aKey), b = index.get(bKey)
    if (a === undefined || b === undefined || a === b) return
    const ek = a < b ? `${a}-${b}` : `${b}-${a}`
    if (edgeSet.has(ek)) return
    edgeSet.add(ek)
    graphEdges.push({ a, b, weak })
  }

  // 4. ROOT anchor at centre
  push({
    id: ROOT_ID, kind: 'root', label: 'Бард', sub: null, route: '',
    initialX: 0, initialY: 0, hub: true,
  })

  // 5. Kind hubs (lazy — only created when they hold something)
  const hubs = new Map<string, string>() // kind → hubId
  const hubPos = new Map<string, { x: number; y: number }>()
  const ensureHub = (kind: string): string => {
    const existing = hubs.get(kind)
    if (existing) return existing
    const id = `__hub:${kind}`
    const slot = HUB_ORDER.indexOf(kind)
    const i = slot >= 0 ? slot : HUB_ORDER.length + hubs.size
    const ang = (i / Math.max(4, HUB_ORDER.length)) * Math.PI * 2 - Math.PI / 2
    const hx = Math.cos(ang) * 300, hy = Math.sin(ang) * 300
    push({
      id, kind, label: HUB_LABEL[kind] ?? kind, sub: null, route: '',
      initialX: hx, initialY: hy, hub: true,
    })
    hubs.set(kind, id)
    hubPos.set(kind, { x: hx, y: hy })
    link(ROOT_ID, id, true)
    return id
  }

  // 6. Projects → "Проекты" hub, then their contained items
  let orphanCount = 0
  const visibleProjects = src.projects.filter((p) => matchesQuery(p.name))
  visibleProjects.forEach((p, pi) => {
    const key = `project:${p.id}`
    const hub = ensureHub('project')
    const hp = hubPos.get('project')!
    const ang = (pi / Math.max(1, visibleProjects.length)) * Math.PI * 2
    const px = hp.x + Math.cos(ang) * 150, py = hp.y + Math.sin(ang) * 150
    if (!addObj(key, px, py)) return
    link(hub, key, false)
    const items = projectItems.get(key) ?? []
    items.forEach((ik, i) => {
      const a = (i / Math.max(1, items.length)) * Math.PI * 2
      const r = 95 + Math.floor(i / 8) * 30
      if (addObj(ik, px + Math.cos(a) * r, py + Math.sin(a) * r)) link(key, ik, false)
    })
  })

  // 7. Loose items (not contained in a project) → hang off their kind hub
  if (showOrphans) {
    const looseByKind = new Map<string, string[]>()
    for (const [key, m] of meta) {
      if (m.kind === 'project') continue
      if (index.has(key) || containedSet.has(key)) continue
      if (!matchesQuery(m.label)) continue
      if (!looseByKind.has(m.kind)) looseByKind.set(m.kind, [])
      looseByKind.get(m.kind)!.push(key)
    }
    for (const [kind, keys] of looseByKind) {
      const hub = ensureHub(kind)
      const hp = hubPos.get(kind)!
      keys.forEach((key, i) => {
        const a = (i / Math.max(1, keys.length)) * Math.PI * 2
        const r = 120 + Math.floor(i / 10) * 34
        if (addObj(key, hp.x + Math.cos(a) * r, hp.y + Math.sin(a) * r)) {
          link(hub, key, true)
          orphanCount++
        }
      })
    }
  } else {
    for (const [key, m] of meta)
      if (m.kind !== 'project' && !index.has(key) && !containedSet.has(key)) orphanCount++
  }

  // 8. `refers` cross-links (drawn as real beams between any two visible items)
  for (const e of refersEdges)
    link(`${e.src_type}:${e.src_id}`, `${e.dst_type}:${e.dst_id}`, false)

  // 8b. tag nodes from `tagged` edges — surface inline #tags as their own cluster,
  // hanging off whatever objects carry them (Obsidian-style tag clusters)
  const taggedEdges = src.edges.filter((e) => e.kind === 'tagged')
  let tagSeed = 0
  for (const e of taggedEdges) {
    const srcKey = `${e.src_type}:${e.src_id}`
    if (!index.has(srcKey)) continue // only when the source object is already on the graph
    const tagKey = `tag:${e.dst_id}`
    if (!index.has(tagKey)) {
      const label = `#${e.dst_id}`
      if (!matchesQuery(label)) continue
      const ang = tagSeed++ * 2.39996 // golden-angle spread so seeds don't pile up
      push({
        id: tagKey, kind: 'tag', label, sub: null, route: '',
        initialX: Math.cos(ang) * 240, initialY: Math.sin(ang) * 240,
      })
    }
    link(srcKey, tagKey, false)
  }

  // 9. Sidebar projects
  const sidebarProjects: SidebarProject[] = src.projects
    .filter((p) => index.has(`project:${p.id}`))
    .map((p) => ({
      key: `project:${p.id}`,
      id: p.id,
      label: p.name,
      linkedCount: (projectItems.get(`project:${p.id}`) ?? []).filter((k) => index.has(k)).length,
    }))

  // structural anchors (root + hubs) shouldn't inflate the user-facing object count
  const realNodes = nodes.filter((n) => n.kind !== 'root' && !n.id.startsWith('__hub:')).length

  return {
    graph: {
      nodes,
      edges: graphEdges,
      kindNames: { project: 'Проект', task: 'Задача', note: 'Заметка', canvas: 'Холст', tag: 'Тег' },
    },
    sidebarProjects,
    totalNodes: realNodes,
    totalEdges: graphEdges.length,
    orphanCount,
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function MemoryTree() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const containerRef = useRef<HTMLDivElement>(null)
  const graphRef = useRef<GraphHandle | null>(null)
  const themeSetting = useSettingsStore((s) => s.settings?.theme)
  const dark = (themeSetting === 'system' ? resolvedTheme() : themeSetting ?? 'light') === 'dark'
  const palette = dark ? GRAPH_DARK : GRAPH_LIGHT

  // Fold app sidebar while the graph is open, restore on exit
  const setSidebarCollapsed = useUiStore((s) => s.setSidebarCollapsed)
  useEffect(() => {
    const was = useUiStore.getState().sidebarCollapsed
    setSidebarCollapsed(true, false)
    return () => setSidebarCollapsed(was, false)
  }, [setSidebarCollapsed])

  const [src, setSrc] = useState<SourceData | null>(null)
  const [query, setQuery] = useState('')
  const [showOrphans, setShowOrphans] = useState(true)
  const [explorerOpen, setExplorerOpen] = useState(true)
  const [panelOpen, setPanelOpen] = useState(false)
  const [tip, setTip] = useState<(GraphTip & { x: number; y: number }) | null>(null)

  const [groups, setGroups] = useState<GraphGroup[]>(() => {
    try { const r = JSON.parse(localStorage.getItem('wist.graphGroups') ?? '[]'); return Array.isArray(r) ? r : [] }
    catch { return [] }
  })
  const saveGroups = (next: GraphGroup[]) => {
    setGroups(next)
    try { localStorage.setItem('wist.graphGroups', JSON.stringify(next)) } catch { /* ok */ }
  }

  // v2 key — resets the persisted view so the new spread-out defaults take effect
  const [view, setView] = useState<GraphView>(() => {
    try {
      const r = JSON.parse(localStorage.getItem('wist.graphView2') ?? 'null')
      return r && typeof r === 'object' ? { ...GRAPH_DEFAULTS, ...r } : { ...GRAPH_DEFAULTS }
    } catch { return { ...GRAPH_DEFAULTS } }
  })
  useEffect(() => {
    try { localStorage.setItem('wist.graphView2', JSON.stringify(view)) } catch { /* ok */ }
  }, [view])

  // deep-link focus: /tree?focus=tag:work (or note:12 / project:3 …) flies to that node
  // once the data has loaded and the layout has had a moment to seed
  const [searchParams] = useSearchParams()
  const focusKey = searchParams.get('focus')
  useEffect(() => {
    if (!src || !focusKey) return
    const h = setTimeout(() => graphRef.current?.focus(focusKey), 900)
    return () => clearTimeout(h)
  }, [src, focusKey])

  // Data load — notes, projects, tasks, canvases + all edges
  useEffect(() => {
    let cancelled = false
    const safe = <T,>(p: Promise<T>, d: T): Promise<T> => p.catch(() => d)
    ;(async () => {
      const [notes, projects, tasks, canvases, edges] = await Promise.all([
        safe(listNotes({}), [] as Note[]),
        safe(listProjects(), [] as Project[]),
        safe(listTasks({}), [] as Task[]),
        safe(listCanvases(), [] as Canvas[]),
        safe(listAllEdges(), [] as RawEdge[]),
      ])
      if (!cancelled) setSrc({ notes, projects, tasks, canvases, edges })
    })().catch((err) => {
      console.error('graph load failed', err)
      if (!cancelled) setSrc((prev) => prev ?? EMPTY_SRC)
    })
    return () => { cancelled = true }
  }, [])

  const world = useMemo(
    () => (src ? buildWorld(src, { query, showOrphans, dark }) : null),
    [src, query, showOrphans, dark]
  )
  const graph = world?.graph ?? { nodes: [], edges: [], kindNames: {} }

  const onTip = useCallback((wt: GraphTip | null) => {
    if (!wt) return setTip(null)
    const rect = containerRef.current?.getBoundingClientRect()
    if (rect) setTip({ ...wt, x: wt.clientX - rect.left, y: wt.clientY - rect.top })
  }, [])
  // depends on `dark` only to rebuild when the theme flips (dotColor reads the live CSS vars)
  const colorOf = useCallback((kind: string) => dotColor(kind), [dark])
  const onNavigate = useCallback((route: string) => { if (route) navigate(route) }, [navigate])

  // Slider helper
  type NumKey = 'nodeScale' | 'linkWidth' | 'linkDistance' | 'repel' | 'labelFade' | 'centerForce' | 'linkForce'
  const slider = (labelKey: TKey, key: NumKey, min: number, max: number, step: number) => (
    <label key={key} className="block">
      <span className="mb-1 block text-[11px] text-zinc-500">{t(labelKey)}</span>
      <input
        type="range" min={min} max={max} step={step} value={view[key]}
        onChange={(e) => setView((v) => ({ ...v, [key]: Number(e.target.value) }))}
        className="w-full"
      />
    </label>
  )

  if (!src) return <Spinner />

  const total = src.notes.length + src.projects.length + src.tasks.length + src.canvases.length
  if (total === 0) {
    return (
      <div className="page">
        <EmptyState icon={Share2} title={t('tree.emptyTitle')} subtitle={t('tree.emptySubtitle')} />
      </div>
    )
  }

  // focus accent — matches the app's WhatsApp teal-green theme
  const acc = dark ? '#00d2a8' : '#008069'

  return (
    <div className="flex h-full min-h-0">

      {/* ── Explorer sidebar ── */}
      <aside
        className={`flex shrink-0 flex-col bg-surface transition-[width] duration-200 ease-out ${
          explorerOpen ? 'w-[248px] border-r border-edge' : 'w-0 overflow-hidden'
        }`}
      >
        {/* Toolbar */}
        <div className="flex items-center gap-0.5 border-b border-edge px-1.5 py-1.5">
          <button
            title={t('world.orphans')}
            onClick={() => setShowOrphans((v) => !v)}
            className={`rounded p-1.5 transition-colors hover:bg-highlight ${
              showOrphans ? 'text-zinc-200' : 'text-zinc-600 hover:text-zinc-200'
            }`}
          >
            <CircleDashed size={15} />
          </button>
          <div className="flex-1" />
          <span className="px-1 text-[10px] tabular-nums text-zinc-600">
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

        {/* Search */}
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

        {/* Project list */}
        <div className="min-h-0 flex-1 overflow-y-auto px-1.5 py-1">
          {(world?.sidebarProjects ?? []).length === 0 && !query && (
            <div className="px-2 py-8 text-center text-[12px] text-zinc-600">{t('world.nothing')}</div>
          )}
          {(world?.sidebarProjects ?? []).map((p) => (
            <button
              key={p.key}
              onClick={() => graphRef.current?.focus(p.key)}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] text-zinc-300 transition-colors hover:bg-highlight hover:text-white"
            >
              <FolderKanban size={13} className="shrink-0" style={{ color: dotColor('project') }} />
              <span className="min-w-0 flex-1 truncate">{p.label}</span>
              {p.linkedCount > 0 && (
                <span className="shrink-0 text-[10px] tabular-nums text-zinc-600">{p.linkedCount}</span>
              )}
            </button>
          ))}

          {/* Asteroid belt indicator */}
          {(world?.orphanCount ?? 0) > 0 && (
            <div className="mt-2 border-t border-edge pt-2">
              <div className="flex items-center gap-2 px-2 py-1 text-[12px] text-zinc-600">
                <CircleDashed size={12} className="shrink-0" />
                <span>{world!.orphanCount} {t('world.asteroids' as TKey)}</span>
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-edge px-3 py-2 text-[10px] leading-relaxed text-zinc-600">
          {t('world.explorerHint')}
        </div>
      </aside>

      {/* ── Graph canvas ── */}
      <div ref={containerRef} className="relative min-w-0 flex-1 overflow-hidden" style={{ background: palette.bg }}>
        <GraphCanvas
          ref={graphRef}
          data={graph}
          accent={acc}
          colorOf={colorOf}
          groups={groups}
          view={view}
          palette={palette}
          onNavigate={onNavigate}
          onTip={onTip}
        />

        {/* Top-left: re-open sidebar */}
        {!explorerOpen && (
          <div className="absolute left-3 top-3">
            <button
              onClick={() => setExplorerOpen(true)}
              title={t('world.showTree')}
              className="rounded-lg border border-edge bg-surface/90 p-2 text-zinc-400 backdrop-blur transition-colors hover:text-zinc-200"
            >
              <PanelLeftOpen size={14} />
            </button>
          </div>
        )}

        {/* Top-right controls */}
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

        {/* Settings panel */}
        {panelOpen && (
          <div
            className="absolute right-3 top-14 max-h-[82vh] w-64 space-y-4 overflow-y-auto rounded-2xl border border-edge bg-surface/95 p-3.5 backdrop-blur"
            style={{ boxShadow: 'var(--float-shadow)' }}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-300">{t('world.view')}</span>
              <button
                className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-300"
                onClick={() => setView({ ...GRAPH_DEFAULTS })}
              >
                <RotateCcw size={11} /> {t('world.reset')}
              </button>
            </div>

            {/* Color groups */}
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
                  <label
                    className="relative h-5 w-5 shrink-0 cursor-pointer rounded-full border border-edge"
                    style={{ backgroundColor: g.color }}
                  >
                    <input
                      type="color" value={g.color}
                      onChange={(e) => saveGroups(groups.map((x) => (x.id === g.id ? { ...x, color: e.target.value } : x)))}
                      className="absolute inset-0 cursor-pointer opacity-0"
                    />
                  </label>
                  <button
                    className="shrink-0 text-zinc-600 transition-colors hover:text-danger"
                    onClick={() => saveGroups(groups.filter((x) => x.id !== g.id))}
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
              <button
                className="w-full rounded-lg border border-edge bg-raised py-1 text-[11px] text-zinc-400 transition-colors hover:bg-highlight hover:text-zinc-200"
                onClick={() =>
                  saveGroups([
                    ...groups,
                    { id: Math.random().toString(36).slice(2), query: '', color: GROUP_COLORS[groups.length % GROUP_COLORS.length] },
                  ])
                }
              >
                + {t('world.newGroup')}
              </button>
            </div>

            {/* Display */}
            <div className="space-y-2.5 border-t border-edge pt-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500">{t('world.display')}</div>
              <label className="flex cursor-pointer items-center justify-between text-[11px] text-zinc-500">
                {t('world.arrows')}
                <input
                  type="checkbox" checked={view.arrows}
                  onChange={(e) => setView((v) => ({ ...v, arrows: e.target.checked }))}
                  className="h-3.5 w-3.5 accent-[var(--accent)]"
                />
              </label>
              {slider('world.labels', 'labelFade', 0, 2, 0.05)}
              {slider('world.nodeSize', 'nodeScale', 0.5, 2, 0.05)}
              {slider('world.linkWidth', 'linkWidth', 0.4, 2.5, 0.05)}
              <button
                className="w-full rounded-lg bg-raised py-1 text-[11px] font-medium text-zinc-300 transition-colors hover:bg-highlight hover:text-white"
                onClick={() => graphRef.current?.animate()}
              >
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

        {/* Empty-graph overlay */}
        {graph.nodes.length === 0 && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-zinc-600">
            {t('world.nothing')}
          </div>
        )}

        {/* Hover tooltip */}
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
