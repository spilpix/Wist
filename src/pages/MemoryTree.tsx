import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Maximize2, RotateCcw, Search, Settings2, Share2, X } from 'lucide-react'
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
import type { JournalEntry, MemoryKind, Moment, Note, Project, Title } from '../types/models'
import { useI18n, type TKey } from '../i18n'

const GRAPH_DARK = { bg: '#141210', edge: '#2e2b26', text: '#8a8278', linkBoost: 1 }
const GRAPH_LIGHT = { bg: '#ffffff', edge: '#9b99ab', text: '#3a3744', linkBoost: 2.3 }
const GROUP_COLORS = ['#c47a7a', '#6fb06f', '#a87dc4', '#7aa8c4', '#c9a96b', '#d4813a', '#3a8a8a', '#8a8278']

const KIND_HEX: Record<MemoryKind, string> = {
  moment: '#a87dc4',
  title: '#6fb06f',
  book: '#c9a96b',
  note: '#7aa8c4',
  journal: '#c47a7a',
  project: '#d4813a',
}

const KIND_ORDER: MemoryKind[] = ['title', 'book', 'note', 'moment', 'journal', 'project']

interface SourceData {
  titles: Title[]
  notes: Note[]
  moments: Moment[]
  journal: JournalEntry[]
  projects: Project[]
}

/** Build the full graph, then apply Obsidian-style filters (search, orphans). */
function buildGraph(
  src: SourceData,
  hidden: Set<MemoryKind>,
  query: string,
  showOrphans: boolean,
  kindNames: Record<MemoryKind, string>
): GraphData {
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []
  const index = new Map<string, number>()

  const add = (node: GraphNode) => {
    index.set(node.id, nodes.length)
    nodes.push(node)
  }
  const link = (aId: string, bId: string, weak = false) => {
    const a = index.get(aId)
    const b = index.get(bId)
    if (a === undefined || b === undefined || a === b) return
    edges.push({ a, b, weak })
  }

  const titleByName = new Map<string, string>()
  for (const t of src.titles) {
    const kind: MemoryKind = t.type === 'book' ? 'book' : 'title'
    if (hidden.has(kind)) continue
    add({ id: `t${t.id}`, kind, label: t.title, sub: t.year ? String(t.year) : null, route: `/title/${t.id}` })
    titleByName.set(t.title.trim().toLowerCase(), `t${t.id}`)
    if (t.original_title) titleByName.set(t.original_title.trim().toLowerCase(), `t${t.id}`)
  }

  const noteByName = new Map<string, string>()
  if (!hidden.has('note')) {
    for (const nt of src.notes) {
      add({
        id: `n${nt.id}`,
        kind: 'note',
        label: nt.title || nt.content.slice(0, 30) || '…',
        sub: nt.tags.length ? '#' + nt.tags.join(' #') : null,
        route: `/notes?open=${nt.id}`,
      })
      if (nt.title) noteByName.set(nt.title.trim().toLowerCase(), `n${nt.id}`)
    }
    for (const nt of src.notes) {
      if (nt.linked_title_id != null) link(`n${nt.id}`, `t${nt.linked_title_id}`)
      for (const m of nt.content.matchAll(/\[\[([^\]]+)\]\]/g)) {
        const key = m[1].trim().toLowerCase()
        const target = noteByName.get(key) ?? titleByName.get(key)
        if (target) link(`n${nt.id}`, target)
      }
    }
  }

  if (!hidden.has('moment')) {
    for (const mm of src.moments) {
      add({
        id: `m${mm.id}`,
        kind: 'moment',
        label: mm.note || mm.title_name || kindNames.moment,
        sub: mm.title_name ?? null,
        route: `/title/${mm.title_id}`,
      })
      link(`m${mm.id}`, `t${mm.title_id}`)
    }
  }

  if (!hidden.has('journal')) {
    const sorted = [...src.journal].sort((a, b) => a.day.localeCompare(b.day))
    let prev: string | null = null
    for (const j of sorted) {
      add({ id: `j${j.id}`, kind: 'journal', label: j.day, sub: j.content.slice(0, 60) || null, route: '/journal' })
      if (prev) link(`j${j.id}`, prev, true)
      prev = `j${j.id}`
    }
  }

  if (!hidden.has('project')) {
    for (const pr of src.projects) {
      add({
        id: `pr${pr.id}`,
        kind: 'project',
        label: pr.name,
        sub: pr.client ?? kindNames.project,
        route: `/project/${pr.id}`,
      })
    }
    for (const nt of src.notes) {
      if (nt.project_id != null) link(`n${nt.id}`, `pr${nt.project_id}`)
    }
  }

  // search filter (Obsidian: non-matching nodes disappear)
  let keep = nodes.map((_, i) => i)
  const q = query.trim().toLowerCase()
  if (q) keep = keep.filter((i) => nodes[i].label.toLowerCase().includes(q) || nodes[i].sub?.toLowerCase().includes(q))

  if (!showOrphans) {
    const keptSet = new Set(keep)
    const deg = new Map<number, number>()
    for (const e of edges) {
      if (keptSet.has(e.a) && keptSet.has(e.b)) {
        deg.set(e.a, (deg.get(e.a) ?? 0) + 1)
        deg.set(e.b, (deg.get(e.b) ?? 0) + 1)
      }
    }
    keep = keep.filter((i) => (deg.get(i) ?? 0) > 0)
  }

  if (keep.length === nodes.length) return { nodes, edges, kindNames }
  const remap = new Map<number, number>()
  const outNodes = keep.map((i, k) => {
    remap.set(i, k)
    return nodes[i]
  })
  const outEdges = edges
    .filter((e) => remap.has(e.a) && remap.has(e.b))
    .map((e) => ({ a: remap.get(e.a)!, b: remap.get(e.b)!, weak: e.weak }))
  return { nodes: outNodes, edges: outEdges, kindNames }
}

export default function MemoryTree() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const containerRef = useRef<HTMLDivElement>(null)
  const graphRef = useRef<GraphHandle | null>(null)
  const themeSetting = useSettingsStore((s) => s.settings?.theme)
  const dark = (themeSetting === 'system' ? resolvedTheme() : themeSetting ?? 'light') === 'dark'
  const palette = dark ? GRAPH_DARK : GRAPH_LIGHT

  const [src, setSrc] = useState<SourceData | null>(null)
  const [hidden, setHidden] = useState<Set<MemoryKind>>(new Set())
  const [query, setQuery] = useState('')
  const [showOrphans, setShowOrphans] = useState(true)
  const [panelOpen, setPanelOpen] = useState(false)
  const [view, setView] = useState<GraphView>({ ...GRAPH_DEFAULTS })
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
    Promise.all([
      window.wist.titles.list({}),
      window.wist.notes.list({}),
      window.wist.moments.list({}),
      window.wist.journal.list(),
      window.wist.projects.list(),
    ]).then(([titles, notes, moments, journal, projects]) => setSrc({ titles, notes, moments, journal, projects }))
  }, [])

  const kindNames = useMemo<Record<MemoryKind, string>>(
    () => ({
      title: t('world.kind.title'),
      book: t('world.kind.book'),
      note: t('world.kind.note'),
      moment: t('world.kind.moment'),
      journal: t('world.kind.journal'),
      project: t('world.kind.project'),
    }),
    [t]
  )

  const kindCounts = useMemo(() => {
    if (!src) return {} as Record<MemoryKind, number>
    return {
      title: src.titles.filter((x) => x.type !== 'book').length,
      book: src.titles.filter((x) => x.type === 'book').length,
      note: src.notes.length,
      moment: src.moments.length,
      journal: src.journal.length,
      project: src.projects.length,
    }
  }, [src])

  const graph = useMemo(
    () => (src ? buildGraph(src, hidden, query, showOrphans, kindNames) : { nodes: [], edges: [], kindNames }),
    [src, hidden, query, showOrphans, kindNames]
  )

  // stable callbacks so GraphCanvas (memo'd) doesn't re-render on tooltip state changes
  const onTip = useCallback((wt: GraphTip | null) => {
    if (!wt) return setTip(null)
    const rect = containerRef.current?.getBoundingClientRect()
    if (rect) setTip({ ...wt, x: wt.clientX - rect.left, y: wt.clientY - rect.top })
  }, [])
  const colorOf = useCallback((kind: MemoryKind) => KIND_HEX[kind], [])
  const onNavigate = useCallback((route: string) => navigate(route), [navigate])

  const explorerGroups = useMemo(
    () => KIND_ORDER.map((kind) => ({ kind, items: graph.nodes.filter((node) => node.kind === kind) })).filter((g) => g.items.length),
    [graph]
  )

  if (!src) return <Spinner />

  const total = src.titles.length + src.notes.length + src.moments.length + src.journal.length + src.projects.length
  if (total === 0) {
    return (
      <div className="page">
        <h1 className="page-title">{t('nav.tree')}</h1>
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

  return (
    <div className="flex h-full flex-col">
      {/* slim header */}
      <div className="flex items-baseline justify-between px-6 pb-2.5 pt-4">
        <h1 className="text-xl font-semibold text-white">{t('nav.tree')}</h1>
        <span className="text-xs text-zinc-600">{t('world.counts', { n: graph.nodes.length, m: graph.edges.length })}</span>
      </div>

      <div className="flex min-h-0 flex-1 border-t border-edge/60">
        {/* second-level nav: the explorer (Obsidian file list) */}
        <aside className="flex w-64 shrink-0 flex-col border-r border-edge/60 bg-surface/40">
          <div className="space-y-3 p-3">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-600" />
              <input
                className="input !py-1.5 !pl-7 text-xs"
                placeholder={t('world.search')}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {KIND_ORDER.map((kind) => {
                const off = hidden.has(kind)
                return (
                  <button
                    key={kind}
                    title={kindNames[kind]}
                    onClick={() => {
                      const next = new Set(hidden)
                      if (off) next.delete(kind)
                      else next.add(kind)
                      setHidden(next)
                    }}
                    className={`flex items-center gap-1.5 rounded-xl border border-edge/60 bg-raised px-2 py-0.5 text-[11px] font-medium transition-all ${
                      off ? 'text-zinc-600 opacity-50' : 'text-zinc-300'
                    }`}
                  >
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: off ? '#555' : KIND_HEX[kind] }} />
                    {kindCounts[kind] ?? 0}
                  </button>
                )
              })}
            </div>
            <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-zinc-500">
              <input
                type="checkbox"
                checked={showOrphans}
                onChange={(e) => setShowOrphans(e.target.checked)}
                className="h-3 w-3 accent-[var(--accent)]"
              />
              {t('world.orphans')}
            </label>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
            {explorerGroups.length === 0 && <div className="px-3 py-8 text-center text-xs text-zinc-600">{t('world.nothing')}</div>}
            {explorerGroups.map((group) => (
              <div key={group.kind} className="mb-3">
                <div className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400" style={{ opacity: 0.35 }}>
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: KIND_HEX[group.kind], opacity: 1 }} />
                  {kindNames[group.kind]}
                  <span>{group.items.length}</span>
                </div>
                {group.items.map((it) => (
                  <button
                    key={it.id}
                    onMouseEnter={() => graphRef.current?.highlight(it.id)}
                    onMouseLeave={() => graphRef.current?.highlight(null)}
                    onClick={() => graphRef.current?.focus(it.id)}
                    onDoubleClick={() => navigate(it.route)}
                    title={it.label}
                    className="block w-full truncate rounded-md px-2 py-1 text-left text-[13px] font-medium text-zinc-300 transition-colors hover:bg-white/[0.06] hover:text-white"
                  >
                    {it.label}
                  </button>
                ))}
              </div>
            ))}
          </div>
          <div className="border-t border-edge/50 px-3 py-2 text-[10px] leading-relaxed text-zinc-600">{t('world.explorerHint')}</div>
        </aside>

        {/* graph canvas */}
        <div ref={containerRef} className="relative min-w-0 flex-1 overflow-hidden" style={{ background: palette.bg }}>
          <GraphCanvas ref={graphRef} data={graph} accent="#d4813a" colorOf={colorOf} groups={groups} view={view} palette={palette} onNavigate={onNavigate} onTip={onTip} />

          <div className="absolute right-3 top-3 flex gap-1.5">
            <button
              onClick={() => graphRef.current?.fit()}
              title={t('world.fit')}
              className="rounded-lg border border-edge bg-surface/90 p-2 text-zinc-400 transition-colors hover:text-zinc-200"
            >
              <Maximize2 size={14} />
            </button>
            <button
              onClick={() => setPanelOpen((v) => !v)}
              title={t('world.view')}
              className={`rounded-lg border border-edge p-2 transition-colors ${
                panelOpen ? 'bg-accent text-[#fff]' : 'bg-surface/90 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Settings2 size={14} />
            </button>
          </div>

          {panelOpen && (
            <div className="absolute right-3 top-14 max-h-[82vh] w-64 space-y-4 overflow-y-auto rounded-xl border border-edge bg-surface/95 p-3.5 backdrop-blur">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-300">{t('world.view')}</span>
                <button
                  className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-300"
                  onClick={() => setView({ ...GRAPH_DEFAULTS })}
                >
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
                    <label
                      className="relative h-5 w-5 shrink-0 cursor-pointer rounded-full border border-edge"
                      style={{ backgroundColor: g.color }}
                      title={t('world.groupColor')}
                    >
                      <input
                        type="color"
                        value={g.color}
                        onChange={(e) => saveGroups(groups.map((x) => (x.id === g.id ? { ...x, color: e.target.value } : x)))}
                        className="absolute inset-0 cursor-pointer opacity-0"
                      />
                    </label>
                    <button className="shrink-0 text-zinc-600 transition-colors hover:text-red-400" onClick={() => saveGroups(groups.filter((x) => x.id !== g.id))}>
                      <X size={13} />
                    </button>
                  </div>
                ))}
                <button
                  className="w-full rounded-md border border-edge bg-raised py-1 text-[11px] text-zinc-400 transition-colors hover:text-zinc-200"
                  onClick={() => saveGroups([...groups, { id: Math.random().toString(36).slice(2), query: '', color: GROUP_COLORS[groups.length % GROUP_COLORS.length] }])}
                >
                  + {t('world.newGroup')}
                </button>
              </div>

              {/* Display */}
              <div className="space-y-2.5 border-t border-edge/50 pt-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500">{t('world.display')}</div>
                <label className="flex cursor-pointer items-center justify-between text-[11px] text-zinc-500">
                  {t('world.arrows')}
                  <input
                    type="checkbox"
                    checked={view.arrows}
                    onChange={(e) => setView((v) => ({ ...v, arrows: e.target.checked }))}
                    className="h-3.5 w-3.5 accent-[var(--accent)]"
                  />
                </label>
                {slider('world.labels', 'labelFade', 0, 2, 0.05)}
                {slider('world.nodeSize', 'nodeScale', 0.5, 2, 0.05)}
                {slider('world.linkWidth', 'linkWidth', 0.4, 2.5, 0.05)}
                <button
                  className="w-full rounded-md bg-accent/15 py-1 text-[11px] font-medium text-accent-bright transition-colors hover:bg-accent/25"
                  onClick={() => graphRef.current?.animate()}
                >
                  {t('world.animate')}
                </button>
              </div>

              {/* Forces */}
              <div className="space-y-2.5 border-t border-edge/50 pt-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500">{t('world.forces')}</div>
                {slider('world.centerForce', 'centerForce', 0, 0.3, 0.01)}
                {slider('world.repel', 'repel', 100, 1200, 25)}
                {slider('world.linkForce', 'linkForce', 0, 0.3, 0.01)}
                {slider('world.linkDist', 'linkDistance', 40, 300, 5)}
              </div>
            </div>
          )}

          {graph.nodes.length === 0 && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-zinc-600">{t('world.nothing')}</div>
          )}
          {tip && (
            <div
              className="pointer-events-none absolute z-10 max-w-xs rounded-lg border border-edge bg-raised px-3 py-2"
              style={{
                left: Math.min(tip.x + 14, (containerRef.current?.clientWidth ?? 600) - 240),
                top: Math.min(Math.max(tip.y - 8, 4), (containerRef.current?.clientHeight ?? 400) - 90),
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
    </div>
  )
}
