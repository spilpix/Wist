import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Maximize2, RotateCcw, Search, Settings2, TreePine } from 'lucide-react'
import EmptyState from '../components/ui/EmptyState'
import Spinner from '../components/ui/Spinner'
import {
  createGalaxy,
  DEFAULT_GALAXY_OPTIONS,
  type GalaxyData,
  type GalaxyEdge,
  type GalaxyHandle,
  type GalaxyNode,
  type WorldTip,
} from '../world/createGalaxy'
import { useSettingsStore, resolvedTheme } from '../store/settingsStore'
import type { JournalEntry, MemoryKind, Moment, Note, Project, Title } from '../types/models'
import { useI18n, type TKey } from '../i18n'

const KIND_HEX: Record<MemoryKind, string> = {
  moment: '#a888f0',
  title: '#4ade80',
  book: '#f59e0b',
  note: '#60a5fa',
  journal: '#f472b6',
  project: '#ec4899',
}

const KIND_ORDER: MemoryKind[] = ['title', 'book', 'note', 'moment', 'journal', 'project']

interface SourceData {
  titles: Title[]
  notes: Note[]
  moments: Moment[]
  journal: JournalEntry[]
  projects: Project[]
}

interface ViewOpts {
  colorful: boolean
  nodeScale: number
  linkWidth: number
  linkDistance: number
  repel: number
  labelFade: number
}

/** Build the full graph, then apply Obsidian-style filters (search, orphans). */
function buildGraph(
  src: SourceData,
  hidden: Set<MemoryKind>,
  query: string,
  showOrphans: boolean,
  kindNames: Record<MemoryKind, string>
): GalaxyData {
  const nodes: GalaxyNode[] = []
  const edges: GalaxyEdge[] = []
  const index = new Map<string, number>()

  const add = (node: GalaxyNode) => {
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
    // notes carry a project_id → connect them to their project node
    for (const nt of src.notes) {
      if (nt.project_id != null) link(`n${nt.id}`, `pr${nt.project_id}`)
    }
  }

  // search filter (Obsidian: non-matching nodes disappear)
  let keep = nodes.map((_, i) => i)
  const q = query.trim().toLowerCase()
  if (q) keep = keep.filter((i) => nodes[i].label.toLowerCase().includes(q) || nodes[i].sub?.toLowerCase().includes(q))

  // orphan filter — degree counted on the kept subgraph
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
  const hostRef = useRef<HTMLDivElement>(null)
  const handleRef = useRef<GalaxyHandle | null>(null)

  const themeSetting = useSettingsStore((s) => s.settings?.theme)
  const light = (themeSetting === 'system' ? resolvedTheme() : themeSetting ?? 'dark') === 'light'
  const accentHex = useSettingsStore((s) => s.settings?.accentColor) ?? '#7c5cbf'
  const accent = parseInt(accentHex.replace('#', ''), 16) || 0x7c5cbf

  const [src, setSrc] = useState<SourceData | null>(null)
  const [hidden, setHidden] = useState<Set<MemoryKind>>(new Set())
  const [query, setQuery] = useState('')
  const [showOrphans, setShowOrphans] = useState(true)
  const [panelOpen, setPanelOpen] = useState(false)
  const [view, setView] = useState<ViewOpts>({ ...DEFAULT_GALAXY_OPTIONS })
  const [tip, setTip] = useState<(WorldTip & { x: number; y: number }) | null>(null)
  const [worldError, setWorldError] = useState<string | null>(null)

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

  // single source of truth: the graph the explorer and the canvas both render
  const graph = useMemo(
    () => (src ? buildGraph(src, hidden, query, showOrphans, kindNames) : { nodes: [], edges: [], kindNames }),
    [src, hidden, query, showOrphans, kindNames]
  )

  useEffect(() => {
    if (!src || !hostRef.current) return
    const host = hostRef.current
    let cancelled = false

    createGalaxy(
      host,
      graph,
      {
        navigate,
        tip: (wt) => {
          if (!wt) {
            setTip(null)
            return
          }
          const rect = containerRef.current?.getBoundingClientRect()
          if (rect) setTip({ ...wt, x: wt.clientX - rect.left, y: wt.clientY - rect.top })
        },
      },
      { light, accent, ...view }
    )
      .then((h) => {
        if (cancelled) h.destroy()
        else handleRef.current = h
      })
      .catch((err) => {
        console.error('WORLD_BOOT_ERR', err)
        setWorldError(String(err?.message ?? err))
      })

    return () => {
      cancelled = true
      handleRef.current?.destroy()
      handleRef.current = null
      host.innerHTML = ''
      setTip(null) // a destroyed graph can't emit pointerout — clear any stranded tooltip
    }
    // view is applied live through handle.set — not a rebuild dependency
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph, light, accent])

  const setViewLive = (patch: Partial<ViewOpts>) => {
    setView((v) => ({ ...v, ...patch }))
    handleRef.current?.set(patch)
  }

  // explorer mirrors the graph exactly — every listed row is a node that exists on the canvas
  const explorerGroups = useMemo(
    () => KIND_ORDER.map((kind) => ({ kind, items: graph.nodes.filter((node) => node.kind === kind) })).filter((g) => g.items.length),
    [graph]
  )

  if (!src) return <Spinner />

  const total = src.titles.length + src.notes.length + src.moments.length + src.journal.length
  if (total === 0) {
    return (
      <div className="page">
        <h1 className="page-title">{t('nav.tree')}</h1>
        <EmptyState icon={TreePine} title={t('tree.emptyTitle')} subtitle={t('tree.emptySubtitle')} />
      </div>
    )
  }

  type NumKey = 'nodeScale' | 'linkWidth' | 'linkDistance' | 'repel' | 'labelFade'
  const slider = (labelKey: TKey, key: NumKey, min: number, max: number, step: number) => (
    <label className="block">
      <span className="mb-1 flex items-center justify-between text-[11px] text-zinc-500">
        {t(labelKey)}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={view[key]}
        onChange={(e) => setViewLive({ [key]: Number(e.target.value) })}
        className="w-full"
      />
    </label>
  )

  return (
    <div className="flex h-full flex-col animate-fade-in">
      {/* slim header */}
      <div className="flex items-baseline justify-between px-6 pb-2.5 pt-4">
        <h1 className="text-xl font-semibold text-white">{t('nav.tree')}</h1>
        <span className="text-xs text-zinc-600">{t('world.counts', { n: graph.nodes.length, m: graph.edges.length })}</span>
      </div>

      <div className="flex min-h-0 flex-1 border-t border-edge/60">
        {/* second-level nav: the explorer (Obsidian file list) */}
        <aside className="flex w-64 shrink-0 flex-col border-r border-edge/60 bg-surface/40">
          <div className="space-y-2 p-3">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-600" />
              <input
                className="input !py-1.5 !pl-7 text-xs"
                placeholder={t('world.search')}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-1">
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
                    className={`flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] transition-all ${
                      off ? 'border-edge bg-raised text-zinc-600 opacity-50' : 'border-edge bg-surface text-zinc-300'
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
            {explorerGroups.length === 0 && (
              <div className="px-3 py-8 text-center text-xs text-zinc-600">{t('world.nothing')}</div>
            )}
            {explorerGroups.map((group) => (
              <div key={group.kind} className="mb-2">
                <div className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: KIND_HEX[group.kind] }} />
                  {kindNames[group.kind]}
                  <span className="text-zinc-700">{group.items.length}</span>
                </div>
                {group.items.map((it) => (
                  <button
                    key={it.id}
                    onMouseEnter={() => handleRef.current?.highlight(it.id)}
                    onMouseLeave={() => handleRef.current?.highlight(null)}
                    onClick={() => handleRef.current?.focus(it.id)}
                    onDoubleClick={() => navigate(it.route)}
                    title={it.label}
                    className="block w-full truncate rounded-md px-2 py-1 text-left text-[13px] text-zinc-300 transition-colors hover:bg-raised hover:text-white"
                  >
                    {it.label}
                  </button>
                ))}
              </div>
            ))}
          </div>
          <div className="border-t border-edge/50 px-3 py-2 text-[10px] leading-relaxed text-zinc-600">
            {t('world.explorerHint')}
          </div>
        </aside>

        {/* graph */}
        <div ref={containerRef} className="relative min-w-0 flex-1 overflow-hidden bg-[var(--graph-bg,transparent)]">
          <div ref={hostRef} className="flex h-full items-center" />

          <div className="absolute right-3 top-3 flex gap-1.5">
            <button
              onClick={() => handleRef.current?.fit()}
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
            <div className="absolute right-3 top-14 w-56 space-y-2.5 rounded-xl border border-edge bg-surface/95 p-3.5 backdrop-blur">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-300">{t('world.view')}</span>
                <button
                  className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-300"
                  onClick={() => {
                    setView({ ...DEFAULT_GALAXY_OPTIONS })
                    handleRef.current?.set({ ...DEFAULT_GALAXY_OPTIONS })
                  }}
                >
                  <RotateCcw size={11} /> {t('world.reset')}
                </button>
              </div>
              <label className="flex cursor-pointer items-center justify-between text-[11px] text-zinc-500">
                {t('world.colors')}
                <input
                  type="checkbox"
                  checked={view.colorful}
                  onChange={(e) => setViewLive({ colorful: e.target.checked })}
                  className="h-3.5 w-3.5 accent-[var(--accent)]"
                />
              </label>
              {slider('world.nodeSize', 'nodeScale', 0.5, 2, 0.05)}
              {slider('world.linkWidth', 'linkWidth', 0.4, 2.5, 0.05)}
              {slider('world.linkDist', 'linkDistance', 40, 200, 5)}
              {slider('world.repel', 'repel', 300, 3200, 50)}
              {slider('world.labels', 'labelFade', 0, 2, 0.05)}
            </div>
          )}

          {graph.nodes.length === 0 && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-zinc-600">
              {t('world.nothing')}
            </div>
          )}
          {worldError && <div className="p-6 text-sm text-red-400">{worldError}</div>}
          {tip && (
            <div
              className="pointer-events-none absolute z-10 max-w-xs rounded-lg border border-edge bg-raised px-3 py-2"
              style={{ left: Math.min(tip.x + 14, (containerRef.current?.clientWidth ?? 600) - 240), top: tip.y - 8 }}
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
