import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Image as ImageIcon, Maximize2, Spline, StickyNote, Type, X } from 'lucide-react'
import Spinner from '../components/ui/Spinner'
import Modal from '../components/ui/Modal'
import { toast } from '../store/toastStore'
import type { CanvasData, CanvasNode, Note } from '../types/models'
import { useI18n } from '../i18n'

const CARD_COLORS = ['#7c6af7', '#ef4444', '#4ade80', '#facc15', '#60a5fa', '#f472b6', '#fb923c', '#14b8a6']
const uid = () => Math.random().toString(36).slice(2, 10)

type Drag =
  | { mode: 'pan'; sx: number; sy: number; ox: number; oy: number }
  | { mode: 'move'; id: string; sx: number; sy: number; ox: number; oy: number }
  | { mode: 'resize'; id: string; sx: number; sy: number; ow: number; oh: number }
  | { mode: 'connect'; id: string }
  | null

export default function CanvasBoard() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const { id } = useParams()
  const canvasId = Number(id)

  const [name, setName] = useState('')
  const [data, setData] = useState<CanvasData | null>(null)
  const [cam, setCam] = useState({ x: 200, y: 140, k: 1 })
  const [notes, setNotes] = useState<Note[]>([])
  const [notePicker, setNotePicker] = useState(false)
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null) // temp connect line end (screen)
  const boardRef = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag>(null)
  const dirty = useRef(false)
  const latest = useRef<{ data: CanvasData | null; name: string }>({ data: null, name: '' })
  latest.current = { data, name }

  useEffect(() => {
    window.wist.canvas.get(canvasId).then((c) => {
      if (c) {
        setName(c.name)
        setData(c.data)
      }
    })
    window.wist.notes.list({}).then(setNotes)
  }, [canvasId])

  // debounced autosave
  useEffect(() => {
    if (!data || !dirty.current) return
    const h = setTimeout(() => {
      window.wist.canvas.update(canvasId, { data, name })
      dirty.current = false
    }, 700)
    return () => clearTimeout(h)
  }, [data, name, canvasId])

  // flush unsaved edits on unmount / canvas switch (the 700ms debounce may not have fired)
  useEffect(
    () => () => {
      if (dirty.current && latest.current.data) {
        window.wist.canvas.update(canvasId, { data: latest.current.data, name: latest.current.name })
        dirty.current = false
      }
    },
    [canvasId]
  )

  const noteById = useMemo(() => new Map(notes.map((n) => [n.id, n])), [notes])

  const mutate = useCallback((fn: (d: CanvasData) => CanvasData) => {
    dirty.current = true
    setData((d) => (d ? fn(d) : d))
  }, [])

  const patchNode = (nid: string, patch: Partial<CanvasNode>) =>
    mutate((d) => ({ ...d, nodes: d.nodes.map((n) => (n.id === nid ? { ...n, ...patch } : n)) }))

  const removeNode = (nid: string) =>
    mutate((d) => ({ nodes: d.nodes.filter((n) => n.id !== nid), edges: d.edges.filter((e) => e.from !== nid && e.to !== nid) }))

  const addNode = (node: Omit<CanvasNode, 'id' | 'x' | 'y'>) => {
    const board = boardRef.current
    const cx = board ? board.clientWidth / 2 : 400
    const cy = board ? board.clientHeight / 2 : 300
    const x = (cx - cam.x) / cam.k - node.w / 2
    const y = (cy - cam.y) / cam.k - node.h / 2
    mutate((d) => ({ ...d, nodes: [...d.nodes, { ...node, id: uid(), x, y }] }))
  }

  const addText = () => addNode({ type: 'text', w: 220, h: 120, text: '', color: null })
  const addNote = () => setNotePicker(true)
  const addImage = async () => {
    const p = await window.wist.files.pickImage()
    if (p) addNode({ type: 'image', w: 240, h: 180, path: p, color: null })
  }

  // ---- pointer interaction ----
  const onPointerDownBoard = (e: React.PointerEvent) => {
    if (e.target !== boardRef.current && e.target !== e.currentTarget) return // a card handled it
    boardRef.current?.setPointerCapture(e.pointerId)
    drag.current = { mode: 'pan', sx: e.clientX, sy: e.clientY, ox: cam.x, oy: cam.y }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const dstate = drag.current
    if (!dstate) return
    if (dstate.mode === 'pan') {
      setCam((c) => ({ ...c, x: dstate.ox + (e.clientX - dstate.sx), y: dstate.oy + (e.clientY - dstate.sy) }))
    } else if (dstate.mode === 'move') {
      patchNode(dstate.id, { x: dstate.ox + (e.clientX - dstate.sx) / cam.k, y: dstate.oy + (e.clientY - dstate.sy) / cam.k })
    } else if (dstate.mode === 'resize') {
      patchNode(dstate.id, {
        w: Math.max(120, dstate.ow + (e.clientX - dstate.sx) / cam.k),
        h: Math.max(70, dstate.oh + (e.clientY - dstate.sy) / cam.k),
      })
    } else if (dstate.mode === 'connect') {
      const r = boardRef.current!.getBoundingClientRect()
      setCursor({ x: e.clientX - r.left, y: e.clientY - r.top })
    }
  }
  const onPointerUp = (e: React.PointerEvent) => {
    const dstate = drag.current
    if (dstate?.mode === 'connect' && data) {
      const r = boardRef.current!.getBoundingClientRect()
      const wx = (e.clientX - r.left - cam.x) / cam.k
      const wy = (e.clientY - r.top - cam.y) / cam.k
      const target = data.nodes.find((n) => wx >= n.x && wx <= n.x + n.w && wy >= n.y && wy <= n.y + n.h && n.id !== dstate.id)
      if (target) mutate((d) => ({ ...d, edges: [...d.edges, { id: uid(), from: dstate.id, to: target.id }] }))
    }
    drag.current = null
    setCursor(null)
  }
  const onWheel = (e: React.WheelEvent) => {
    const r = boardRef.current!.getBoundingClientRect()
    const sx = e.clientX - r.left
    const sy = e.clientY - r.top
    const f = Math.exp(-e.deltaY * 0.0015)
    setCam((c) => {
      const nk = Math.max(0.2, Math.min(2.5, c.k * f))
      return { k: nk, x: sx - ((sx - c.x) / c.k) * nk, y: sy - ((sy - c.y) / c.k) * nk }
    })
  }

  const screenCenter = (n: CanvasNode) => ({ x: cam.x + (n.x + n.w / 2) * cam.k, y: cam.y + (n.y + n.h / 2) * cam.k })

  if (!data) return <Spinner />

  return (
    <div className="flex h-full flex-col">
      {/* top bar */}
      <div className="flex items-center gap-2 border-b border-edge/60 px-4 py-2">
        <button className="btn-ghost !px-2 !py-1.5" onClick={() => navigate('/canvas')}>
          <ArrowLeft size={15} />
        </button>
        <input
          className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-white outline-none"
          value={name}
          onChange={(e) => {
            dirty.current = true
            setName(e.target.value)
          }}
        />
        <button className="btn-ghost !px-2 !py-1.5" title={t('world.fit')} onClick={() => setCam({ x: 200, y: 140, k: 1 })}>
          <Maximize2 size={14} />
        </button>
      </div>

      {/* board */}
      <div
        ref={boardRef}
        className="relative min-h-0 flex-1 touch-none overflow-hidden bg-raised/30"
        style={{ cursor: 'grab', backgroundImage: 'radial-gradient(rgb(var(--ink-0)/0.06) 1px, transparent 1px)', backgroundSize: `${24 * cam.k}px ${24 * cam.k}px`, backgroundPosition: `${cam.x}px ${cam.y}px` }}
        onPointerDown={onPointerDownBoard}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onWheel={onWheel}
      >
        {/* edges (screen space) */}
        <svg className="pointer-events-none absolute inset-0 h-full w-full" style={{ overflow: 'visible' }}>
          <defs>
            <marker id="cv-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="rgb(var(--ink-500))" />
            </marker>
          </defs>
          {data.edges.map((ed) => {
            const a = data.nodes.find((n) => n.id === ed.from)
            const b = data.nodes.find((n) => n.id === ed.to)
            if (!a || !b) return null
            const p1 = screenCenter(a)
            const p2 = screenCenter(b)
            return (
              <line
                key={ed.id}
                x1={p1.x}
                y1={p1.y}
                x2={p2.x}
                y2={p2.y}
                stroke="rgb(var(--ink-500))"
                strokeWidth={1.5}
                markerEnd="url(#cv-arrow)"
                className="pointer-events-auto cursor-pointer hover:stroke-[3]"
                onClick={() => mutate((d) => ({ ...d, edges: d.edges.filter((x) => x.id !== ed.id) }))}
              />
            )
          })}
          {/* temp connecting line */}
          {drag.current?.mode === 'connect' &&
            cursor &&
            (() => {
              const from = data.nodes.find((n) => n.id === (drag.current as { id: string }).id)
              if (!from) return null
              const p = screenCenter(from)
              return <line x1={p.x} y1={p.y} x2={cursor.x} y2={cursor.y} stroke="rgb(var(--accent-rgb))" strokeWidth={2} strokeDasharray="4 4" />
            })()}
        </svg>

        {/* nodes (world space, transformed) */}
        <div className="absolute left-0 top-0 origin-top-left" style={{ transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.k})` }}>
          {data.nodes.map((n) => (
            <CardNode
              key={n.id}
              node={n}
              note={n.noteId != null ? noteById.get(n.noteId) : undefined}
              t={t}
              onMoveStart={(e) => {
                e.stopPropagation()
                boardRef.current?.setPointerCapture(e.pointerId)
                drag.current = { mode: 'move', id: n.id, sx: e.clientX, sy: e.clientY, ox: n.x, oy: n.y }
              }}
              onResizeStart={(e) => {
                e.stopPropagation()
                boardRef.current?.setPointerCapture(e.pointerId)
                drag.current = { mode: 'resize', id: n.id, sx: e.clientX, sy: e.clientY, ow: n.w, oh: n.h }
              }}
              onConnectStart={(e) => {
                e.stopPropagation()
                boardRef.current?.setPointerCapture(e.pointerId)
                drag.current = { mode: 'connect', id: n.id }
              }}
              onText={(text) => patchNode(n.id, { text })}
              onColor={(color) => patchNode(n.id, { color })}
              onOpenNote={() => n.noteId != null && navigate(`/notes?open=${n.noteId}`)}
              onRemove={() => removeNode(n.id)}
            />
          ))}
        </div>

        {/* toolbar */}
        <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-edge bg-surface/95 p-1 shadow-lg backdrop-blur">
          <ToolBtn icon={Type} label={t('canvas.addText')} onClick={addText} />
          <ToolBtn icon={StickyNote} label={t('canvas.addNote')} onClick={addNote} />
          <ToolBtn icon={ImageIcon} label={t('canvas.addImage')} onClick={addImage} />
        </div>
      </div>

      {notePicker && (
        <Modal title={t('canvas.pickNote')} onClose={() => setNotePicker(false)} width="max-w-md">
          <div className="max-h-80 space-y-0.5 overflow-y-auto">
            {notes.length === 0 && <div className="py-6 text-center text-sm text-zinc-500">{t('notes.emptyTitle')}</div>}
            {notes.map((nt) => (
              <button
                key={nt.id}
                onClick={() => {
                  addNode({ type: 'note', w: 240, h: 120, noteId: nt.id, color: null })
                  setNotePicker(false)
                }}
                className="block w-full truncate rounded-md px-3 py-2 text-left text-sm text-zinc-300 transition-colors hover:bg-raised hover:text-white"
              >
                {nt.title || nt.content.slice(0, 40) || t('notes.untitled')}
              </button>
            ))}
          </div>
        </Modal>
      )}
    </div>
  )
}

type TFn = ReturnType<typeof useI18n>['t']

function ToolBtn({ icon: Icon, label, onClick }: { icon: typeof Type; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={label}
      className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-zinc-200"
    >
      <Icon size={15} /> {label}
    </button>
  )
}

function CardNode({
  node: n,
  note,
  t,
  onMoveStart,
  onResizeStart,
  onConnectStart,
  onText,
  onColor,
  onOpenNote,
  onRemove,
}: {
  node: CanvasNode
  note?: Note
  t: TFn
  onMoveStart: (e: React.PointerEvent) => void
  onResizeStart: (e: React.PointerEvent) => void
  onConnectStart: (e: React.PointerEvent) => void
  onText: (text: string) => void
  onColor: (color: string | null) => void
  onOpenNote: () => void
  onRemove: () => void
}) {
  const [palette, setPalette] = useState(false)
  const accent = n.color || 'rgb(var(--edge))'
  return (
    <div
      className="group absolute overflow-hidden rounded-xl border bg-surface shadow-lg"
      style={{ left: n.x, top: n.y, width: n.w, height: n.h, borderColor: n.color || 'rgb(var(--edge))', borderTopWidth: 3, borderTopColor: accent }}
    >
      {/* grip / header */}
      <div className="flex h-6 cursor-move items-center justify-between px-2" onPointerDown={onMoveStart}>
        <span className="flex items-center gap-1">
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => setPalette((v) => !v)}
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: n.color || 'rgb(var(--ink-600))' }}
            title={t('project.color')}
          />
        </span>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onRemove}
          className="rounded p-0.5 text-zinc-500 opacity-0 transition-all hover:text-red-400 group-hover:opacity-100"
        >
          <X size={12} />
        </button>
      </div>

      {palette && (
        <div className="absolute left-2 top-6 z-10 flex gap-1 rounded-lg border border-edge bg-surface p-1 shadow" onPointerDown={(e) => e.stopPropagation()}>
          <button onClick={() => { onColor(null); setPalette(false) }} className="h-4 w-4 rounded-full border border-edge text-[8px] text-zinc-500">✕</button>
          {CARD_COLORS.map((c) => (
            <button key={c} onClick={() => { onColor(c); setPalette(false) }} className="h-4 w-4 rounded-full" style={{ backgroundColor: c }} />
          ))}
        </div>
      )}

      {/* body */}
      <div className="h-[calc(100%-1.5rem)] overflow-hidden px-2.5 pb-2.5">
        {n.type === 'text' && (
          <textarea
            value={n.text ?? ''}
            onChange={(e) => onText(e.target.value)}
            onPointerDown={(e) => e.stopPropagation()}
            placeholder={t('canvas.textPlaceholder')}
            className="h-full w-full resize-none bg-transparent text-[13px] leading-relaxed text-zinc-200 outline-none placeholder:text-zinc-600"
          />
        )}
        {n.type === 'note' && (
          <button onPointerDown={(e) => e.stopPropagation()} onClick={() => note && onOpenNote()} className="flex h-full w-full flex-col items-start text-left">
            <div className={`flex items-center gap-1.5 text-[13px] font-semibold ${note ? 'text-zinc-100' : 'text-zinc-500'}`}>
              <StickyNote size={12} className="shrink-0 text-accent-bright" />
              <span className="truncate">{note ? note.title || note.content.slice(0, 30) : t('canvas.missingNote')}</span>
            </div>
            {note?.content && <p className="mt-1 line-clamp-4 text-[11px] text-zinc-500">{note.content}</p>}
          </button>
        )}
        {n.type === 'image' && n.path && (
          <img src={window.wist.media.fileUrl(n.path)} alt="" className="h-full w-full rounded-md object-cover" draggable={false} onPointerDown={(e) => e.stopPropagation()} />
        )}
      </div>

      {/* connect handle (right middle) */}
      <button
        onPointerDown={onConnectStart}
        title={t('canvas.connect')}
        className="absolute -right-2 top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center rounded-full border border-edge bg-surface text-accent-bright opacity-0 transition-opacity hover:bg-accent hover:text-[#fff] group-hover:opacity-100"
      >
        <Spline size={9} />
      </button>

      {/* resize handle */}
      <div
        onPointerDown={onResizeStart}
        className="absolute bottom-0 right-0 h-3 w-3 cursor-nwse-resize opacity-0 transition-opacity group-hover:opacity-100"
        style={{ background: 'linear-gradient(135deg, transparent 50%, rgb(var(--ink-600)) 50%)' }}
      />
    </div>
  )
}
