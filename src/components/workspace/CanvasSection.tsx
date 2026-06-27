import { useCallback, useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import { ArrowLeft, Frame, Plus, StickyNote, Trash2, Type, ZoomIn, ZoomOut } from 'lucide-react'
import { supabase, subscribe } from '../../data/cloud'
import { useWorkspaceStore } from '../../store/workspaceStore'
import { STICKY_PALETTE, timeAgo } from '../../lib/wsUi'
import Spinner from '../ui/Spinner'
import EmptyState from '../ui/EmptyState'

interface SharedCanvas {
  id: string
  workspace_id: string
  name: string
  color: string | null
  created_by: string | null
  updated_at: string
  created_at: string
}

interface CanvasNode {
  id: string
  canvas_id: string
  workspace_id: string
  kind: string // 'sticky' | 'text'
  x: number
  y: number
  w: number
  h: number
  text: string
  color: string
  created_by: string | null
  updated_at: string
}

// ─── Section: list of shared canvases ────────────────────────────────────────

export default function CanvasSection({ workspaceId, userId }: { workspaceId: string; userId: string }) {
  const logActivity = useWorkspaceStore((s) => s.logActivity)
  const [canvases, setCanvases] = useState<SharedCanvas[]>([])
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState<string | null>(null)

  const reload = useCallback(() => {
    supabase.from('shared_canvases').select('*').eq('workspace_id', workspaceId).order('updated_at', { ascending: false })
      .then(({ data }) => { setCanvases(data ?? []); setLoading(false) })
  }, [workspaceId])

  useEffect(() => {
    reload()
    return subscribe(`canvases:${workspaceId}`, 'shared_canvases', `workspace_id=eq.${workspaceId}`, reload)
  }, [workspaceId, reload])

  const create = async () => {
    const { data } = await supabase.from('shared_canvases')
      .insert({ workspace_id: workspaceId, name: 'Новый холст', created_by: userId })
      .select().single()
    if (data) {
      setOpenId(data.id)
      logActivity('canvas_create', `создал холст «${data.name}»`)
    }
  }

  const remove = async (id: string) => {
    await supabase.from('shared_canvases').delete().eq('id', id)
    setCanvases((p) => p.filter((c) => c.id !== id))
  }

  const open = canvases.find((c) => c.id === openId)
  if (open) return <CanvasBoard canvas={open} userId={userId} onBack={() => { setOpenId(null); reload() }} />

  if (loading) return <div className="grid h-full place-items-center"><Spinner /></div>

  return (
    <div className="flex h-full min-w-0 flex-1 animate-fade-in flex-col">
      <div className="flex items-center justify-between border-b border-edge px-6 py-3">
        <h2 className="text-sm font-semibold text-white">Холсты</h2>
        <button onClick={create} className="btn-accent !px-3 !py-1.5 text-xs"><Plus size={13} /> Новый холст</button>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        {canvases.length === 0 ? (
          <EmptyState
            icon={Frame}
            title="Пока нет холстов"
            subtitle="Создай совместный холст — рисуйте и кидайте стикеры вместе в реальном времени"
            action={<button onClick={create} className="btn-accent !px-4 !py-2 text-sm"><Plus size={14} /> Новый холст</button>}
          />
        ) : (
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
            {canvases.map((c) => (
              <button key={c.id} onClick={() => setOpenId(c.id)}
                className="group relative overflow-hidden rounded-xl border border-edge bg-raised text-left transition-colors hover:border-zinc-600 hover:bg-card">
                <div className="grid h-28 place-items-center bg-gradient-to-br from-surface to-card">
                  <Frame size={28} className="text-zinc-600 transition-colors group-hover:text-accent" />
                </div>
                <div className="flex items-center gap-2 px-3 py-2.5">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-200">{c.name}</span>
                  <span className="text-[10px] text-zinc-600">{timeAgo(c.updated_at)}</span>
                </div>
                <span onClick={(e) => { e.stopPropagation(); remove(c.id) }}
                  className="absolute right-2 top-2 hidden rounded bg-black/40 p-1 text-zinc-300 hover:text-red-400 group-hover:flex">
                  <Trash2 size={13} />
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── The collaborative board ─────────────────────────────────────────────────

function CanvasBoard({ canvas, userId, onBack }: { canvas: SharedCanvas; userId: string; onBack: () => void }) {
  const [nodes, setNodes] = useState<CanvasNode[]>([])
  const [name, setName] = useState(canvas.name)
  const [pan, setPan] = useState({ x: 0, y: 0, k: 1 })
  const [sel, setSel] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const surfaceRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ id: string; ox: number; oy: number; sx: number; sy: number } | null>(null)
  const panning = useRef<{ sx: number; sy: number; px: number; py: number } | null>(null)

  // load + realtime
  useEffect(() => {
    supabase.from('shared_canvas_nodes').select('*').eq('canvas_id', canvas.id)
      .then(({ data }) => setNodes(data ?? []))
    return subscribe(`canvas:${canvas.id}`, 'shared_canvas_nodes', `canvas_id=eq.${canvas.id}`, (payload) => {
      if (payload.eventType === 'DELETE') {
        setNodes((p) => p.filter((n) => n.id !== (payload.old as CanvasNode).id))
      } else {
        const fresh = payload.new as CanvasNode
        setNodes((p) => {
          const i = p.findIndex((n) => n.id === fresh.id)
          if (i === -1) return [...p, fresh]
          const next = [...p]; next[i] = fresh; return next
        })
      }
    })
  }, [canvas.id])

  const renameCanvas = async (v: string) => {
    setName(v)
    await supabase.from('shared_canvases').update({ name: v, updated_at: new Date().toISOString() }).eq('id', canvas.id)
  }

  const addNode = async (kind: 'sticky' | 'text') => {
    // drop near the centre of the current viewport
    const rect = surfaceRef.current?.getBoundingClientRect()
    const cx = rect ? (rect.width / 2 - pan.x) / pan.k : 200
    const cy = rect ? (rect.height / 2 - pan.y) / pan.k : 200
    const color = STICKY_PALETTE[Math.floor(nodes.length % STICKY_PALETTE.length)]
    const { data } = await supabase.from('shared_canvas_nodes').insert({
      canvas_id: canvas.id, workspace_id: canvas.workspace_id, kind,
      x: cx - 90, y: cy - 60, w: kind === 'text' ? 200 : 180, h: kind === 'text' ? 44 : 120,
      text: '', color: kind === 'text' ? '#00000000' : color, created_by: userId,
    }).select().single()
    if (data) { setNodes((p) => [...p, data]); setSel(data.id); setEditing(data.id) }
  }

  const patchNode = useCallback((id: string, patch: Partial<CanvasNode>, persist = true) => {
    setNodes((p) => p.map((n) => n.id === id ? { ...n, ...patch } : n))
    if (persist) supabase.from('shared_canvas_nodes').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id).then(() => {})
  }, [])

  const removeNode = async (id: string) => {
    setNodes((p) => p.filter((n) => n.id !== id))
    setSel(null)
    await supabase.from('shared_canvas_nodes').delete().eq('id', id)
  }

  // pointer handlers (drag nodes / pan surface)
  const onNodeDown = (e: RPointerEvent, n: CanvasNode) => {
    if (editing === n.id) return
    e.stopPropagation()
    setSel(n.id)
    drag.current = { id: n.id, ox: n.x, oy: n.y, sx: e.clientX, sy: e.clientY }
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
  }
  const onSurfaceDown = (e: RPointerEvent) => {
    setSel(null)
    panning.current = { sx: e.clientX, sy: e.clientY, px: pan.x, py: pan.y }
  }
  const onMove = (e: RPointerEvent) => {
    if (drag.current) {
      const d = drag.current
      patchNode(d.id, { x: d.ox + (e.clientX - d.sx) / pan.k, y: d.oy + (e.clientY - d.sy) / pan.k }, false)
    } else if (panning.current) {
      const p = panning.current
      setPan((cur) => ({ ...cur, x: p.px + (e.clientX - p.sx), y: p.py + (e.clientY - p.sy) }))
    }
  }
  const onUp = () => {
    if (drag.current) {
      const n = nodes.find((x) => x.id === drag.current!.id)
      if (n) supabase.from('shared_canvas_nodes').update({ x: n.x, y: n.y, updated_at: new Date().toISOString() }).eq('id', n.id).then(() => {})
    }
    drag.current = null
    panning.current = null
  }

  const zoom = (dir: number) => setPan((c) => ({ ...c, k: Math.min(2, Math.max(0.4, +(c.k + dir * 0.15).toFixed(2))) }))

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      {/* header */}
      <div className="flex items-center gap-3 border-b border-edge px-6 py-3">
        <button onClick={onBack} className="rounded-lg p-1 text-zinc-500 hover:bg-raised hover:text-zinc-200"><ArrowLeft size={16} /></button>
        <Frame size={15} className="text-accent" />
        <input value={name} onChange={(e) => renameCanvas(e.target.value)}
          className="flex-1 bg-transparent text-sm font-semibold text-white outline-none" />
        <div className="flex items-center gap-1">
          <button onClick={() => zoom(-1)} className="rounded p-1 text-zinc-500 hover:bg-raised hover:text-zinc-200"><ZoomOut size={15} /></button>
          <span className="w-10 text-center text-xs text-zinc-500">{Math.round(pan.k * 100)}%</span>
          <button onClick={() => zoom(1)} className="rounded p-1 text-zinc-500 hover:bg-raised hover:text-zinc-200"><ZoomIn size={15} /></button>
        </div>
      </div>

      {/* surface */}
      <div ref={surfaceRef} onPointerDown={onSurfaceDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp}
        className="relative flex-1 overflow-hidden bg-surface"
        style={{ backgroundImage: 'radial-gradient(circle, rgba(120,120,120,0.18) 1px, transparent 1px)', backgroundSize: `${24 * pan.k}px ${24 * pan.k}px`, backgroundPosition: `${pan.x}px ${pan.y}px`, cursor: panning.current ? 'grabbing' : 'default' }}>
        <div className="absolute left-0 top-0" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${pan.k})`, transformOrigin: '0 0' }}>
          {nodes.map((n) => (
            <div key={n.id} onPointerDown={(e) => onNodeDown(e, n)} onDoubleClick={() => setEditing(n.id)}
              className={`absolute select-none rounded-lg ${sel === n.id ? 'ring-2 ring-accent' : ''} ${n.kind === 'sticky' ? 'shadow-md' : ''}`}
              style={{ left: n.x, top: n.y, width: n.w, height: n.kind === 'text' ? 'auto' : n.h,
                background: n.kind === 'sticky' ? n.color : 'transparent', cursor: 'grab' }}>
              {editing === n.id ? (
                <textarea autoFocus defaultValue={n.text}
                  onBlur={(e) => { patchNode(n.id, { text: e.target.value }); setEditing(null) }}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="h-full w-full resize-none rounded-lg bg-transparent p-2.5 text-sm outline-none"
                  style={{ color: n.kind === 'sticky' ? '#1a1a1a' : '#e5e5e5' }} />
              ) : (
                <div className="h-full w-full whitespace-pre-wrap break-words p-2.5 text-sm"
                  style={{ color: n.kind === 'sticky' ? '#1a1a1a' : '#e5e5e5', fontWeight: n.kind === 'text' ? 500 : 400 }}>
                  {n.text || <span className="opacity-40">{n.kind === 'text' ? 'Текст…' : 'Стикер…'}</span>}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* delete selected */}
        {sel && (
          <button onClick={() => removeNode(sel)}
            className="absolute right-4 top-4 rounded-lg border border-edge bg-card p-2 text-zinc-400 shadow-lg hover:text-red-400">
            <Trash2 size={15} />
          </button>
        )}

        {/* bottom toolbar */}
        <div className="absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-edge bg-card p-1.5 shadow-xl">
          <button onClick={() => addNode('sticky')} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-zinc-300 hover:bg-raised">
            <StickyNote size={15} /> Стикер
          </button>
          <button onClick={() => addNode('text')} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-zinc-300 hover:bg-raised">
            <Type size={15} /> Текст
          </button>
        </div>
      </div>
    </div>
  )
}
