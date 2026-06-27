import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, FolderKanban, Frame, Hash, ListTodo, PenLine, Plus, Search, X } from 'lucide-react'
import { type NodeRef, type NodeType, type RelatedEdge, type ResolvedNode } from '../types/models'
import { useI18n, type TKey } from '../i18n'
import { objColor, objSoft, hueForType } from '../lib/objectColors'

// each node type gets a glyph + a content-palette hue so a relation reads at a glance
const NODE_ICON: Record<NodeType, typeof FileText> = {
  task: ListTodo,
  note: PenLine,
  project: FolderKanban,
  canvas: Frame,
  vault: FileText,
  tag: Hash,
}
// a tinted rounded chip carrying the type's glyph — colour comes from the SINGLE object
// palette (objectColors → --obj-*) so a type reads the same colour everywhere (sidebar,
// badges, graph, passport header) in both themes
export function NodeChip({ type }: { type: NodeType }) {
  const Icon = NODE_ICON[type]
  const hue = hueForType(type)
  return (
    <span
      className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-lg"
      style={{ background: objSoft(hue), color: objColor(hue) }}
    >
      <Icon size={15} />
    </span>
  )
}

/**
 * The "Связи" section — the universal relations layer made visible on an object.
 * Lists every `refers` edge touching the focus node (either direction, resolved live)
 * and lets you link a new object via an inline search picker, or unlink on hover.
 * Generic over NodeRef — mounted on tasks (TaskPeek) and notes (Notes) alike.
 */
export default function Relations({ focus }: { focus: NodeRef }) {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [rels, setRels] = useState<RelatedEdge[]>([])
  const [picking, setPicking] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ResolvedNode[]>([])

  const load = () =>
    window.wist.edges
      .related(focus.type, focus.id, ['refers'])
      .then(setRels)
      .catch(() => setRels([]))
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus.type, focus.id])

  // debounced live search while the picker is open
  useEffect(() => {
    if (!picking) return
    let active = true
    const h = setTimeout(() => {
      window.wist.edges
        .search(query, focus)
        .then((r) => active && setResults(r))
        .catch(() => active && setResults([]))
    }, 120)
    return () => {
      active = false
      clearTimeout(h)
    }
  }, [picking, query, focus])

  const add = async (n: ResolvedNode) => {
    await window.wist.edges.link(focus, 'refers', { type: n.type, id: n.id })
    setPicking(false)
    setQuery('')
    load()
  }
  const removeEdge = async (edgeId: number) => {
    await window.wist.edges.unlink(edgeId)
    load()
  }
  const createAndLink = async (type: 'task' | 'note') => {
    const title = query.trim()
    if (!title) return
    let id: number
    if (type === 'task') {
      const created = await window.wist.tasks.create({ title })
      id = created.id
    } else {
      const created = await window.wist.notes.create({ title })
      id = created.id
    }
    await window.wist.edges.link(focus, 'refers', { type, id })
    setPicking(false)
    setQuery('')
    load()
  }

  const row = (n: ResolvedNode, onClick: () => void, key: string) => (
    <button key={key} onClick={onClick} className="flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-highlight">
      <NodeChip type={n.type} />
      <span className={`min-w-0 flex-1 truncate text-[13.5px] ${n.missing ? 'text-zinc-600 line-through' : 'text-zinc-200'}`}>{n.label}</span>
      <span className="shrink-0 text-[11px] text-zinc-600">{t(`rel.type.${n.type}` as TKey)}</span>
    </button>
  )

  return (
    <div className="mt-5 border-t border-edge pt-4">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{t('rel.title')}</div>
      <div className="space-y-0.5">
        {rels.map((r) => (
          <div key={r.edgeId} className="group/rel flex items-center gap-2.5 rounded-lg px-1.5 py-1 transition-colors hover:bg-highlight">
            <button
              disabled={!r.node.route}
              onClick={() => r.node.route && navigate(r.node.route)}
              className="flex min-w-0 flex-1 items-center gap-2.5 text-left disabled:cursor-default"
            >
              <NodeChip type={r.node.type} />
              <span className={`min-w-0 flex-1 truncate text-[13.5px] ${r.node.missing ? 'text-zinc-600 line-through' : 'text-zinc-200'}`}>{r.node.label}</span>
              <span className="shrink-0 text-[11px] text-zinc-600">{t(`rel.type.${r.node.type}` as TKey)}</span>
            </button>
            <button
              onClick={() => removeEdge(r.edgeId)}
              title={t('common.delete')}
              className="shrink-0 rounded p-0.5 text-zinc-600 opacity-0 transition-all hover:bg-raised hover:text-danger group-hover/rel:opacity-100"
            >
              <X size={13} />
            </button>
          </div>
        ))}

        {picking ? (
          <div className="rounded-xl border border-edge bg-field p-1.5">
            <div className="flex items-center gap-2 px-1.5 pb-1.5">
              <Search size={14} className="shrink-0 text-zinc-500" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Escape' && (setPicking(false), setQuery(''))}
                placeholder={t('rel.searchPh')}
                className="min-w-0 flex-1 bg-transparent text-[13px] text-zinc-200 outline-none placeholder:text-zinc-500"
              />
              <button onClick={() => { setPicking(false); setQuery('') }} className="shrink-0 rounded p-0.5 text-zinc-500 transition-colors hover:text-zinc-200">
                <X size={14} />
              </button>
            </div>
            <div className="max-h-56 overflow-y-auto">
              {results.map((n) => row(n, () => add(n), `${n.type}:${n.id}`))}
              {results.length === 0 && !query.trim() && (
                <div className="px-2 py-2 text-[12px] text-zinc-600">{t('common.noResults')}</div>
              )}
              {query.trim() && (
                <>
                  {results.length > 0 && <div className="mx-1.5 my-1 border-t border-edge" />}
                  <button
                    onClick={() => createAndLink('task')}
                    className="flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-highlight"
                  >
                    <NodeChip type="task" />
                    <span className="min-w-0 flex-1 truncate text-[13.5px] text-zinc-200">
                      {t('rel.createTask')}{' '}
                      <span className="text-zinc-500">«{query.trim()}»</span>
                    </span>
                  </button>
                  <button
                    onClick={() => createAndLink('note')}
                    className="flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-highlight"
                  >
                    <NodeChip type="note" />
                    <span className="min-w-0 flex-1 truncate text-[13.5px] text-zinc-200">
                      {t('rel.createNote')}{' '}
                      <span className="text-zinc-500">«{query.trim()}»</span>
                    </span>
                  </button>
                </>
              )}
            </div>
          </div>
        ) : (
          <button
            onClick={() => setPicking(true)}
            className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-left text-[13px] text-zinc-500 transition-colors hover:bg-highlight hover:text-zinc-300"
          >
            <Plus size={15} className="shrink-0" /> {t('rel.add')}
          </button>
        )}
      </div>
    </div>
  )
}
