import { useCallback, useMemo, useRef, useState } from 'react'
import { Maximize2, Play } from 'lucide-react'
import GraphCanvas, {
  GRAPH_DEFAULTS,
  type GraphData,
  type GraphEdge,
  type GraphHandle,
  type GraphNode,
  type GraphTip,
  type GraphView,
} from './GraphCanvas'
import { useSettingsStore, resolvedTheme } from '../store/settingsStore'
import { type Note, type Project, type ProjectAsset, type ProjectSection, type Task } from '../types/models'
import { useI18n } from '../i18n'

const DARK = { bg: '#191919', edge: '#363636', text: '#9b9b99', linkBoost: 1 }
const LIGHT = { bg: '#ffffff', edge: '#c4c3c0', text: '#37352f', linkBoost: 2.3 }

// node colours per hub node kind
const KIND_HEX: Record<string, string> = {
  hub: '#2383e2',
  section: '#c9a96b',
  folder: '#7aa8c4',
  file: '#8a8278',
  image: '#6fb06f',
  link: '#a87dc4',
  note: '#5b8def',
  task: '#c47a7a',
}

/**
 * Obsidian-style force graph scoped to ONE hub: the hub at the centre, its sections
 * (categories) around it, and every file / image / link / note / task linked to its
 * section (or the hub if ungrouped). Click a file/note to open it.
 */
export default function HubGraph({
  project,
  assets,
  sections,
  notes,
  tasks,
  onOpenAsset,
  onOpenNote,
}: {
  project: Project
  assets: ProjectAsset[]
  sections: ProjectSection[]
  notes: Note[]
  tasks: Task[]
  onOpenAsset: (a: ProjectAsset) => void
  onOpenNote: (id: number) => void
}) {
  const { t } = useI18n()
  const themeSetting = useSettingsStore((s) => s.settings?.theme)
  // default to the actually-resolved theme (dark by default) — never hard-fallback to light
  const dark = (themeSetting === 'system' || !themeSetting ? resolvedTheme() : themeSetting) === 'dark'
  const palette = dark ? DARK : LIGHT

  const graphRef = useRef<GraphHandle | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [view] = useState<GraphView>({ ...GRAPH_DEFAULTS, linkDistance: 70, repel: 130, centerForce: 0.08 })
  const [tip, setTip] = useState<(GraphTip & { x: number; y: number }) | null>(null)

  const kindNames = useMemo<Record<string, string>>(
    () => ({
      hub: t('nav.hub'),
      section: t('hub.addSection'),
      folder: t('project.addFolder'),
      file: t('project.addFiles'),
      image: t('project.addImages'),
      link: t('project.addLink'),
      note: t('nav.notes'),
      task: t('nav.tasks'),
    }),
    [t]
  )

  const graph = useMemo<GraphData>(() => {
    const nodes: GraphNode[] = []
    const edges: GraphEdge[] = []
    const idx = new Map<string, number>()
    const add = (n: GraphNode) => {
      idx.set(n.id, nodes.length)
      nodes.push(n)
    }
    const link = (a: string, b: string, weak = false) => {
      const ai = idx.get(a)
      const bi = idx.get(b)
      if (ai == null || bi == null || ai === bi) return
      edges.push({ a: ai, b: bi, weak })
    }

    const hubId = 'hub'
    add({ id: hubId, kind: 'hub', label: project.name, sub: project.kind || null, route: 'hub' })

    for (const s of sections) {
      add({ id: `s${s.id}`, kind: 'section', label: s.name, sub: kindNames.section, route: `section:${s.id}` })
      link(hubId, `s${s.id}`)
    }
    for (const a of assets) {
      const kind = a.kind === 'url' ? 'link' : a.kind
      add({ id: `a${a.id}`, kind, label: a.label || a.path || a.url || '—', sub: null, route: `asset:${a.id}` })
      link(a.section_id != null ? `s${a.section_id}` : hubId, `a${a.id}`)
    }
    for (const n of notes) {
      add({ id: `n${n.id}`, kind: 'note', label: n.title || n.content.slice(0, 30) || '…', sub: kindNames.note, route: `note:${n.id}` })
      link(hubId, `n${n.id}`)
    }
    for (const tk of tasks) {
      add({ id: `tk${tk.id}`, kind: 'task', label: tk.title, sub: kindNames.task, route: `task:${tk.id}` })
      link(hubId, `tk${tk.id}`, true)
    }
    return { nodes, edges, kindNames }
  }, [project, assets, sections, notes, tasks, kindNames])

  const colorOf = useCallback((kind: string) => KIND_HEX[kind] ?? '#8a8278', [])
  const onNavigate = useCallback(
    (route: string) => {
      const [type, id] = route.split(':')
      if (type === 'asset') {
        const a = assets.find((x) => x.id === Number(id))
        if (a) onOpenAsset(a)
      } else if (type === 'note') {
        onOpenNote(Number(id))
      }
      // hub / section / task → the engine already centres on click
    },
    [assets, onOpenAsset, onOpenNote]
  )
  const onTip = useCallback((wt: GraphTip | null) => {
    if (!wt) return setTip(null)
    const rect = containerRef.current?.getBoundingClientRect()
    if (rect) setTip({ ...wt, x: wt.clientX - rect.left, y: wt.clientY - rect.top })
  }, [])

  const legend = ['section', 'folder', 'file', 'image', 'link', 'note', 'task']

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden rounded-xl border border-edge"
      style={{ background: palette.bg, height: '70vh' }}
    >
      <GraphCanvas
        ref={graphRef}
        data={graph}
        accent={project.color || '#2383e2'}
        colorOf={colorOf}
        groups={[]}
        view={view}
        palette={palette}
        onNavigate={onNavigate}
        onTip={onTip}
      />

      {/* controls */}
      <div className="absolute right-3 top-3 flex gap-1.5">
        <button
          onClick={() => graphRef.current?.fit()}
          title={t('world.fit')}
          className="rounded-lg border border-edge bg-card/90 p-2 text-zinc-400 backdrop-blur transition-colors hover:text-zinc-200"
        >
          <Maximize2 size={14} />
        </button>
        <button
          onClick={() => graphRef.current?.animate()}
          title={t('world.animate')}
          className="rounded-lg border border-edge bg-card/90 p-2 text-zinc-400 backdrop-blur transition-colors hover:text-zinc-200"
        >
          <Play size={14} />
        </button>
      </div>

      {/* legend */}
      <div className="absolute bottom-3 left-3 flex flex-wrap gap-x-3 gap-y-1 rounded-xl border border-edge bg-card/85 px-3 py-2 backdrop-blur">
        {legend.map((k) => (
          <span key={k} className="flex items-center gap-1.5 text-[11px] text-zinc-400">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: KIND_HEX[k] }} />
            {kindNames[k]}
          </span>
        ))}
      </div>

      {graph.nodes.length <= 1 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-zinc-500">
          {t('hub.graphEmpty')}
        </div>
      )}

      {tip && (
        <div
          className="pointer-events-none absolute z-10 max-w-xs rounded-xl border border-edge bg-card px-3 py-2"
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
  )
}
