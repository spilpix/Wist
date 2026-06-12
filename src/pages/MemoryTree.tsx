import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TreePine } from 'lucide-react'
import EmptyState from '../components/ui/EmptyState'
import Spinner from '../components/ui/Spinner'
import { createGalaxy, type GalaxyData, type GalaxyEdge, type GalaxyNode, type WorldTip } from '../world/createGalaxy'
import type { JournalEntry, MemoryKind, Moment, Note, Title } from '../types/models'
import { useI18n, type TKey } from '../i18n'

const KIND_HEX: Record<MemoryKind, string> = {
  moment: '#a888f0',
  title: '#4ade80',
  book: '#f59e0b',
  note: '#60a5fa',
  journal: '#f472b6',
}

const KIND_ORDER: MemoryKind[] = ['title', 'book', 'note', 'moment', 'journal']

interface SourceData {
  titles: Title[]
  notes: Note[]
  moments: Moment[]
  journal: JournalEntry[]
}

/** Build the graph: every star is a thing you lived, every filament a real link. */
function buildGraph(src: SourceData, hidden: Set<MemoryKind>, kindNames: Record<MemoryKind, string>): GalaxyData {
  const nodes: GalaxyNode[] = []
  const edges: GalaxyEdge[] = []
  const index = new Map<string, number>()

  const add = (node: GalaxyNode): number => {
    index.set(node.id, nodes.length)
    nodes.push(node)
    return nodes.length - 1
  }
  const link = (aId: string, bId: string, weak = false) => {
    const a = index.get(aId)
    const b = index.get(bId)
    if (a === undefined || b === undefined || a === b) return
    edges.push({ a, b, weak })
  }

  const titleByName = new Map<string, string>()
  if (!hidden.has('title') || !hidden.has('book')) {
    for (const t of src.titles) {
      const kind: MemoryKind = t.type === 'book' ? 'book' : 'title'
      if (hidden.has(kind)) continue
      add({ id: `t${t.id}`, kind, label: t.title, sub: t.year ? String(t.year) : null, route: `/title/${t.id}` })
      titleByName.set(t.title.trim().toLowerCase(), `t${t.id}`)
      if (t.original_title) titleByName.set(t.original_title.trim().toLowerCase(), `t${t.id}`)
    }
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
      // [[wiki links]] inside the text — the Obsidian heart of the graph
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
      if (prev) link(`j${j.id}`, prev, true) // the thread of days
      prev = `j${j.id}`
    }
  }

  return { nodes, edges, kindNames }
}

export default function MemoryTree() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const containerRef = useRef<HTMLDivElement>(null)
  const hostRef = useRef<HTMLDivElement>(null)

  const [src, setSrc] = useState<SourceData | null>(null)
  const [hidden, setHidden] = useState<Set<MemoryKind>>(new Set())
  const [tip, setTip] = useState<(WorldTip & { x: number; y: number }) | null>(null)
  const [worldError, setWorldError] = useState<string | null>(null)
  const [counts, setCounts] = useState<{ nodes: number; edges: number }>({ nodes: 0, edges: 0 })

  useEffect(() => {
    Promise.all([
      window.wist.titles.list({}),
      window.wist.notes.list({}),
      window.wist.moments.list({}),
      window.wist.journal.list(),
    ]).then(([titles, notes, moments, journal]) => setSrc({ titles, notes, moments, journal }))
  }, [])

  const kindNames = useMemo<Record<MemoryKind, string>>(
    () => ({
      title: t('world.kind.title'),
      book: t('world.kind.book'),
      note: t('world.kind.note'),
      moment: t('world.kind.moment'),
      journal: t('world.kind.journal'),
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
    }
  }, [src])

  useEffect(() => {
    if (!src || !hostRef.current) return
    const host = hostRef.current
    const graph = buildGraph(src, hidden, kindNames)
    setCounts({ nodes: graph.nodes.length, edges: graph.edges.length })
    let destroy: (() => void) | null = null
    let cancelled = false

    createGalaxy(host, graph, {
      navigate,
      tip: (wt) => {
        if (!wt) {
          setTip(null)
          return
        }
        const rect = containerRef.current?.getBoundingClientRect()
        if (rect) setTip({ ...wt, x: wt.clientX - rect.left, y: wt.clientY - rect.top })
      },
    })
      .then((d) => {
        if (cancelled) d()
        else destroy = d
      })
      .catch((err) => {
        console.error('WORLD_BOOT_ERR', err)
        setWorldError(String(err?.message ?? err))
      })

    return () => {
      cancelled = true
      destroy?.()
      host.innerHTML = ''
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, hidden, kindNames])

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

  return (
    <div className="page">
      <div className="mb-1 flex items-baseline justify-between">
        <h1 className="page-title !mb-0">{t('nav.tree')}</h1>
        <span className="text-xs text-zinc-600">{t('world.counts', { n: counts.nodes, m: counts.edges })}</span>
      </div>
      <p className="mb-4 max-w-3xl text-sm text-zinc-500">{t('tree.subtitle')}</p>

      {/* legend doubles as type filter */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {KIND_ORDER.map((kind) => {
          const off = hidden.has(kind)
          return (
            <button
              key={kind}
              onClick={() => {
                const next = new Set(hidden)
                if (off) next.delete(kind)
                else next.add(kind)
                setHidden(next)
              }}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-all ${
                off ? 'border-edge bg-raised text-zinc-600 opacity-50' : 'border-edge bg-surface text-zinc-300'
              }`}
            >
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: off ? '#555' : KIND_HEX[kind] }} />
              {kindNames[kind]}
              <span className="text-zinc-600">{kindCounts[kind] ?? 0}</span>
            </button>
          )
        })}
        <span className="ml-auto hidden text-[11px] text-zinc-600 md:block">{t('world.galaxyHint')}</span>
      </div>

      <div ref={containerRef} className="relative overflow-hidden rounded-2xl border border-edge/50 bg-[#07060f]">
        <div ref={hostRef} />
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
  )
}
