import type { Dispatch, RefObject, SetStateAction, MutableRefObject } from 'react'
import type { CanvasAnchor, CanvasConnectorType, CanvasData, CanvasEdge, CanvasGuide, CanvasNode } from '../types/models'
import {
  anchorPoint,
  bbox,
  type Box,
  boxesIntersect,
  boxIntersectsPolygon,
  center,
  nearestAnchor,
  nodeAABB,
  pointInBox,
  type Pt,
  rotate,
  snap as snapTo,
  snapToObjects,
  unrotate,
} from './geometry'
import { DEFAULTS, GRID, maxRadius, ROUND_RECT_RADIUS, RULER_SIZE, type ToolKey } from './constants'
import { type Sign } from './boardGeometry'
import type { useHistory } from './history'
import type { PenStyle } from './BottomToolbar'

type Cam = { x: number; y: number; k: number }

// the origin of an in-progress connector: an anchor on a node, or a free-floating point
export type ConnectFrom = { id: string; anchor: CanvasAnchor } | { point: Pt }

export type Drag =
  | { mode: 'pan'; sx: number; sy: number; ox: number; oy: number; button: number; moved: boolean }
  | { mode: 'move'; sx: number; sy: number; start: Record<string, Pt>; firstId: string; moved: boolean; tapEdit: boolean }
  | { mode: 'resize'; id: string; sign: Sign; sx: number; sy: number; box: Box; rot: number; aspect: boolean }
  | { mode: 'gresize'; sign: Sign; sx: number; sy: number; box: Box; start: Record<string, Box> }
  | { mode: 'rotate'; id: string; cxC: number; cyC: number; startAngle: number; startRot: number }
  | { mode: 'radius'; id: string; corner: Sign; sx: number; sy: number; start: number; max: number }
  | { mode: 'marquee'; sx: number; sy: number; additive: boolean; base: Set<string> }
  | { mode: 'connect'; from: ConnectFrom; cur: Pt }
  | { mode: 'create'; tool: ToolKey; down: Pt }
  | { mode: 'guide'; axis: 'h' | 'v'; index: number | null } // index null = creating a new guide
  | { mode: 'pen' }
  | { mode: 'lasso'; points: Pt[] }
  | { mode: 'erase'; erased: Set<string> }
  | { mode: 'crop'; corner: Sign | 'move'; sx: number; sy: number; rect: { x: number; y: number; w: number; h: number }; box: { w: number; h: number } }
  | null

/**
 * The canvas board's pointer/drag state machine — extracted VERBATIM from CanvasBoard's body
 * (behaviour preserved by construction; gated by tsc + scripts/smoke-drag.cjs). Every handler
 * is unchanged; the 40-odd things they reference are passed in via `deps` and destructured
 * once below, so the bodies read exactly as they did inline. This is modularisation (the board
 * file shrinks ~500 lines and the machine is its own unit), not decoupling — the surface is wide.
 */
export interface CanvasDragDeps {
  drag: MutableRefObject<Drag>
  boardRef: RefObject<HTMLDivElement | null>
  camRef: MutableRefObject<Cam>
  selRef: MutableRefObject<Set<string>>
  toolRef: MutableRefObject<ToolKey>
  lastTap: MutableRefObject<{ id: string; t: number }>
  cam: Cam
  sel: Set<string>
  editing: string | null
  present: number | null
  cropping: string | null
  cropRect: { x: number; y: number; w: number; h: number } | null
  penDraft: Pt[] | null
  guideDraft: CanvasGuide | null
  penStyle: PenStyle
  connType: CanvasConnectorType
  snap: boolean
  space: boolean
  selNodes: CanvasNode[]
  nodesById: Map<string, CanvasNode>
  setCam: Dispatch<SetStateAction<Cam>>
  setSel: Dispatch<SetStateAction<Set<string>>>
  setSelEdge: Dispatch<SetStateAction<string | null>>
  setMenu: Dispatch<SetStateAction<{ x: number; y: number; world: Pt; onNode: boolean } | null>>
  setGuides: Dispatch<SetStateAction<{ vx: number[]; hy: number[] } | null>>
  setGuideDraft: Dispatch<SetStateAction<CanvasGuide | null>>
  setDropFrame: Dispatch<SetStateAction<string | null>>
  setMarquee: Dispatch<SetStateAction<{ x: number; y: number; w: number; h: number } | null>>
  setConnectCur: Dispatch<SetStateAction<Pt | null>>
  setConnectMenu: Dispatch<SetStateAction<{ sx: number; sy: number; from: ConnectFrom; at: Pt } | null>>
  setHover: Dispatch<SetStateAction<string | null>>
  setPenDraft: Dispatch<SetStateAction<Pt[] | null>>
  setLassoDraft: Dispatch<SetStateAction<Pt[] | null>>
  setCropRect: Dispatch<SetStateAction<{ x: number; y: number; w: number; h: number } | null>>
  setOpenComment: Dispatch<SetStateAction<string | null>>
  hist: ReturnType<typeof useHistory>
  toWorld: (cx: number, cy: number) => Pt
  zoomAt: (sx: number, sy: number, factor: number) => void
  cancelCamAnim: () => void
  nodeAt: (w: Pt) => CanvasNode | undefined
  frameContaining: (node: CanvasNode, nodes: CanvasNode[]) => string | null
  startEdit: (id: string) => void
  addNode: (n: any) => string
  addComment: (w: Pt) => void
  createObject: (tool: ToolKey, down: Pt, up: Pt) => void
  finalizePen: (pts: Pt[]) => void
  uid: () => string
}

export function useCanvasDrag(deps: CanvasDragDeps) {
  const {
    drag, boardRef, camRef, selRef, toolRef, lastTap,
    cam, sel, editing, present, cropping, cropRect, penDraft, guideDraft, penStyle, connType, snap, space, selNodes, nodesById,
    setCam, setSel, setSelEdge, setMenu, setGuides, setGuideDraft, setDropFrame, setMarquee, setConnectCur, setConnectMenu, setHover, setPenDraft, setLassoDraft, setCropRect, setOpenComment,
    hist, toWorld, zoomAt, cancelCamAnim,
    nodeAt, frameContaining, startEdit, addNode, addComment, createObject, finalizePen, uid,
  } = deps

  // pull a new guide out of a ruler band (top → horizontal, left → vertical)
  const startGuide = (e: React.PointerEvent, axis: 'h' | 'v') => {
    if (e.button !== 0 || space || toolRef.current === 'hand') return // fall through to board pan
    e.stopPropagation()
    setMenu(null)
    boardRef.current?.setPointerCapture(e.pointerId)
    const w = toWorld(e.clientX, e.clientY)
    drag.current = { mode: 'guide', axis, index: null }
    setGuideDraft({ axis, pos: Math.round(axis === 'h' ? w.y : w.x) })
  }
  // grab an existing guide to reposition (or drop it back on the ruler to delete)
  const startMoveGuide = (e: React.PointerEvent, index: number) => {
    if (e.button !== 0 || space || toolRef.current === 'hand') return
    e.stopPropagation()
    const g = hist.get().guides?.[index]
    if (!g) return
    boardRef.current?.setPointerCapture(e.pointerId)
    drag.current = { mode: 'guide', axis: g.axis, index }
    setGuideDraft({ ...g })
  }

  const startConnect = (from: { id: string; anchor: CanvasAnchor } | { point: Pt }, e: React.PointerEvent) => {
    e.stopPropagation()
    boardRef.current?.setPointerCapture(e.pointerId)
    const w = toWorld(e.clientX, e.clientY)
    drag.current = { mode: 'connect', from, cur: w }
    setConnectCur(w)
  }

  const onNodePointerDown = (e: React.PointerEvent, n: CanvasNode) => {
    if (e.button !== 0 || present != null || cropping) return
    const tk = toolRef.current
    if (tk === 'connector') {
      e.stopPropagation()
      const w = toWorld(e.clientX, e.clientY)
      startConnect({ id: n.id, anchor: nearestAnchor(n, w) }, e)
      return
    }
    if (tk !== 'select') return // hand / creation handled by the board
    e.stopPropagation()
    // double-tap → edit. Pointer capture (below) steals the native dblclick from the
    // node, so we detect the second quick tap ourselves and open the editor.
    const editable = n.type === 'sticky' || n.type === 'text' || n.type === 'shape' || n.type === 'frame'
    // a click on an already-selected editable node that doesn't drag → enter edit on
    // release (so re-editing is a forgiving 2 clicks, no 350ms double-tap timing needed)
    const wasSoleEditable = !e.shiftKey && editable && !n.locked && selRef.current.size === 1 && selRef.current.has(n.id)
    if (!e.shiftKey && editable && !n.locked) {
      const now = Date.now()
      if (lastTap.current.id === n.id && now - lastTap.current.t < 350) {
        lastTap.current = { id: '', t: 0 }
        setSel(new Set([n.id]))
        setSelEdge(null)
        startEdit(n.id)
        return
      }
      lastTap.current = { id: n.id, t: now }
    }
    boardRef.current?.setPointerCapture(e.pointerId)
    setSelEdge(null)
    let next: Set<string>
    if (e.shiftKey) {
      next = new Set(selRef.current)
      next.has(n.id) ? next.delete(n.id) : next.add(n.id)
      setSel(next)
      return // shift-toggle never starts a move
    }
    next = selRef.current.has(n.id) ? selRef.current : new Set([n.id])
    if (next !== selRef.current) setSel(next)
    const cur = hist.get().nodes
    const movers = cur.filter((m) => next.has(m.id) && !m.locked)
    if (!movers.length) return
    // a frame drags its children along — by stored membership OR geometric containment,
    // so a frame drawn around existing objects still moves them (Figma/Miro behaviour)
    const ids = new Set(movers.map((m) => m.id))
    for (const m of movers)
      if (m.type === 'frame')
        for (const ch of cur)
          if (ch.id !== m.id && ch.type !== 'frame' && !ch.locked && (ch.frameId === m.id || pointInBox(center(ch), m))) ids.add(ch.id)
    const startNodes = cur.filter((nn) => ids.has(nn.id))
    hist.begin()
    drag.current = {
      mode: 'move',
      sx: e.clientX,
      sy: e.clientY,
      firstId: movers[0].id,
      moved: false,
      tapEdit: wasSoleEditable && movers.length === 1 && movers[0].id === n.id,
      start: Object.fromEntries(startNodes.map((m) => [m.id, { x: m.x, y: m.y }])),
    }
  }

  const onBoardPointerDown = (e: React.PointerEvent) => {
    if (present != null || cropping) return
    cancelCamAnim() // any direct interaction interrupts a camera tween
    setMenu(null)
    const tk = toolRef.current
    boardRef.current?.setPointerCapture(e.pointerId)
    if (e.button === 2 || e.button === 1 || space || tk === 'hand') {
      drag.current = { mode: 'pan', sx: e.clientX, sy: e.clientY, ox: cam.x, oy: cam.y, button: e.button, moved: false }
      return
    }
    if (e.button !== 0) return
    const w = toWorld(e.clientX, e.clientY)
    if (tk === 'sticky' || tk === 'text' || tk === 'shape' || tk === 'frame') {
      drag.current = { mode: 'create', tool: tk, down: w }
      return
    }
    if (tk === 'lasso') {
      drag.current = { mode: 'lasso', points: [w] }
      setLassoDraft([w])
      setSel(new Set())
      setSelEdge(null)
      return
    }
    if (tk === 'pen') {
      if (penStyle.kind === 'eraser') {
        const erased = new Set<string>()
        const radius = (penStyle.size * 2) / camRef.current.k
        for (const n of hist.get().nodes) {
          if (n.type !== 'pen') continue
          const ex = { x: n.x - radius, y: n.y - radius, w: n.w + radius * 2, h: n.h + radius * 2 }
          if (!pointInBox(w, ex)) continue
          const loc = { x: w.x - n.x, y: w.y - n.y }
          if ((n.points ?? []).some((p) => Math.hypot(p.x - loc.x, p.y - loc.y) <= radius)) erased.add(n.id)
        }
        if (erased.size > 0) hist.live((dd) => ({ ...dd, nodes: dd.nodes.filter((n) => !erased.has(n.id)) }))
        drag.current = { mode: 'erase', erased }
        return
      }
      drag.current = { mode: 'pen' }
      setPenDraft([w])
      return
    }
    if (tk === 'comment') {
      addComment(w)
      return
    }
    if (tk === 'connector') {
      const hit = nodeAt(w)
      if (hit) startConnect({ id: hit.id, anchor: nearestAnchor(hit, w) }, e)
      else startConnect({ point: w }, e)
      return
    }
    const additive = e.shiftKey
    if (!additive) {
      setSel(new Set())
      setSelEdge(null)
    }
    drag.current = { mode: 'marquee', sx: e.clientX, sy: e.clientY, additive, base: new Set(additive ? selRef.current : []) }
    setMarquee({ x: e.clientX, y: e.clientY, w: 0, h: 0 })
  }

  // double-click empty canvas → drop a text object right there and start typing
  // (Figma/FigJam quick-create; a double-click ON a node is handled by the node → edit)
  const onBoardDoubleClick = (e: React.MouseEvent) => {
    if (present != null || cropping || toolRef.current !== 'select') return
    const w = toWorld(e.clientX, e.clientY)
    if (nodeAt(w)) return
    const def = DEFAULTS.text
    const nid = addNode({ type: 'text', x: w.x - 6, y: w.y - 12, w: def.w, h: def.h, text: '', autoWidth: true })
    setSel(new Set([nid]))
    setSelEdge(null)
    startEdit(nid)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const c = camRef.current
    if (d.mode === 'pan') {
      if (Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) > 3) d.moved = true
      setCam((cc) => ({ ...cc, x: d.ox + (e.clientX - d.sx), y: d.oy + (e.clientY - d.sy) }))
    } else if (d.mode === 'move') {
      if (Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) > 2) d.moved = true
      let dx = (e.clientX - d.sx) / c.k
      let dy = (e.clientY - d.sy) / c.k
      const f = d.start[d.firstId]
      // smart alignment: snap to other objects' edges/centres, then grid as fallback
      const cur = hist.get().nodes
      const boxes: Box[] = []
      for (const id of Object.keys(d.start)) {
        const n = nodesById.get(id)
        if (n) boxes.push({ x: d.start[id].x + dx, y: d.start[id].y + dy, w: n.w, h: n.h })
      }
      const movingBox = bbox(boxes)
      if (movingBox) {
        const sn = snapToObjects(movingBox, cur.filter((n) => !d.start[n.id]), 6 / c.k)
        if (sn.mx) dx += sn.dx
        if (sn.my) dy += sn.dy
        if (snap && !sn.mx) dx = snapTo(f.x + dx, GRID) - f.x
        if (snap && !sn.my) dy = snapTo(f.y + dy, GRID) - f.y
        setGuides(sn.vx.length || sn.hy.length ? { vx: sn.vx, hy: sn.hy } : null)
      } else if (snap) {
        dx = snapTo(f.x + dx, GRID) - f.x
        dy = snapTo(f.y + dy, GRID) - f.y
      }
      hist.live((dd) => ({ ...dd, nodes: dd.nodes.map((n) => (d.start[n.id] ? { ...n, x: d.start[n.id].x + dx, y: d.start[n.id].y + dy } : n)) }))
      // Figma-style: light up the frame the dragged object would drop into
      const movingFrame = Object.keys(d.start).some((id) => nodesById.get(id)?.type === 'frame')
      const primary = hist.get().nodes.find((nn) => nn.id === d.firstId)
      setDropFrame(primary && !movingFrame && primary.type !== 'frame' ? frameContaining(primary, hist.get().nodes) : null)
    } else if (d.mode === 'resize') {
      const wd = (e.clientX - d.sx) / c.k
      const hd = (e.clientY - d.sy) / c.k
      const l = unrotate(wd, hd, d.rot)
      let nw = Math.max(24, d.box.w + d.sign[0] * l.x)
      let nh = Math.max(24, d.box.h + d.sign[1] * l.y)
      if (d.aspect && d.sign[0] !== 0 && d.sign[1] !== 0) {
        const ratio = d.box.w ? d.box.h / d.box.w : 1
        nh = Math.max(24, nw * ratio)
        nw = ratio ? nh / ratio : nw
      }
      const shiftLocal = { x: (d.sign[0] * (nw - d.box.w)) / 2, y: (d.sign[1] * (nh - d.box.h)) / 2 }
      const sw = rotate(shiftLocal.x, shiftLocal.y, d.rot)
      const c0 = { x: d.box.x + d.box.w / 2, y: d.box.y + d.box.h / 2 }
      let nx = c0.x + sw.x - nw / 2
      let ny = c0.y + sw.y - nh / 2
      if (snap && !d.rot) {
        nx = snapTo(nx, GRID)
        ny = snapTo(ny, GRID)
      }
      hist.live((dd) => ({ ...dd, nodes: dd.nodes.map((n) => (n.id === d.id ? { ...n, x: nx, y: ny, w: nw, h: nh } : n)) }))
    } else if (d.mode === 'gresize') {
      const wd = (e.clientX - d.sx) / c.k
      const hd = (e.clientY - d.sy) / c.k
      const b = d.box
      const nw = d.sign[0] !== 0 ? Math.max(40, b.w + d.sign[0] * wd) : b.w
      const nh = d.sign[1] !== 0 ? Math.max(40, b.h + d.sign[1] * hd) : b.h
      const fx = d.sign[0] === -1 ? b.x + b.w : b.x
      const fy = d.sign[1] === -1 ? b.y + b.h : b.y
      const sx = b.w ? nw / b.w : 1
      const sy = b.h ? nh / b.h : 1
      hist.live((dd) => ({
        ...dd,
        nodes: dd.nodes.map((n) => {
          const s = d.start[n.id]
          if (!s) return n
          return { ...n, x: fx + (s.x - fx) * sx, w: s.w * sx, y: fy + (s.y - fy) * sy, h: s.h * sy }
        }),
      }))
    } else if (d.mode === 'rotate') {
      const ang = Math.atan2(e.clientY - d.cyC, e.clientX - d.cxC)
      let deg = d.startRot + ((ang - d.startAngle) * 180) / Math.PI
      if (e.shiftKey) deg = Math.round(deg / 15) * 15
      hist.live((dd) => ({ ...dd, nodes: dd.nodes.map((n) => (n.id === d.id ? { ...n, rotation: Math.round(deg) } : n)) }))
    } else if (d.mode === 'radius') {
      // drag a corner handle inward → larger radius (project the move onto the inward diagonal)
      const dw = ((e.clientX - d.sx) / c.k) * -d.corner[0]
      const dh = ((e.clientY - d.sy) / c.k) * -d.corner[1]
      const r = Math.round(Math.max(0, Math.min(d.max, d.start + (dw + dh) / 2)))
      hist.live((dd) => ({ ...dd, nodes: dd.nodes.map((n) => (n.id === d.id ? { ...n, radius: r } : n)) }))
    } else if (d.mode === 'marquee') {
      const x = Math.min(d.sx, e.clientX)
      const y = Math.min(d.sy, e.clientY)
      const w = Math.abs(e.clientX - d.sx)
      const h = Math.abs(e.clientY - d.sy)
      setMarquee({ x, y, w, h })
      const w0 = toWorld(x, y)
      const w1 = toWorld(x + w, y + h)
      const rect: Box = { x: w0.x, y: w0.y, w: w1.x - w0.x, h: w1.y - w0.y }
      const picked = new Set(d.base)
      for (const n of hist.get().nodes) if (boxesIntersect(rect, n)) picked.add(n.id)
      setSel(picked)
    } else if (d.mode === 'connect') {
      const w = toWorld(e.clientX, e.clientY)
      d.cur = w
      setConnectCur(w)
      const hit = nodeAt(w)
      setHover(hit ? hit.id : null)
    } else if (d.mode === 'pen') {
      const w = toWorld(e.clientX, e.clientY)
      setPenDraft((pts) => (pts ? [...pts, w] : [w]))
    } else if (d.mode === 'lasso') {
      const w = toWorld(e.clientX, e.clientY)
      d.points = [...d.points, w]
      setLassoDraft([...d.points])
    } else if (d.mode === 'erase') {
      const w = toWorld(e.clientX, e.clientY)
      const radius = (penStyle.size * 2) / c.k
      const freshIds: string[] = []
      for (const n of hist.get().nodes) {
        if (n.type !== 'pen' || d.erased.has(n.id)) continue
        const ex = { x: n.x - radius, y: n.y - radius, w: n.w + radius * 2, h: n.h + radius * 2 }
        if (!pointInBox(w, ex)) continue
        const loc = { x: w.x - n.x, y: w.y - n.y }
        if ((n.points ?? []).some((p) => Math.hypot(p.x - loc.x, p.y - loc.y) <= radius)) freshIds.push(n.id)
      }
      if (freshIds.length > 0) {
        freshIds.forEach((id) => d.erased.add(id))
        hist.live((dd) => ({ ...dd, nodes: dd.nodes.filter((n) => !d.erased.has(n.id)) }))
      }
    } else if (d.mode === 'guide') {
      const w = toWorld(e.clientX, e.clientY)
      const raw = d.axis === 'h' ? w.y : w.x
      setGuideDraft({ axis: d.axis, pos: snap ? snapTo(raw, GRID) : Math.round(raw) })
    } else if (d.mode === 'crop') {
      const wd = (e.clientX - d.sx) / c.k
      const hd = (e.clientY - d.sy) / c.k
      let { x, y, w, h } = d.rect
      if (d.corner === 'move') {
        x = Math.max(0, Math.min(d.box.w - d.rect.w, d.rect.x + wd))
        y = Math.max(0, Math.min(d.box.h - d.rect.h, d.rect.y + hd))
      } else {
        const [cxn, cyn] = d.corner
        if (cxn < 0) {
          x = Math.max(0, Math.min(d.rect.x + wd, d.rect.x + d.rect.w - 24))
          w = d.rect.x + d.rect.w - x
        }
        if (cxn > 0) w = Math.max(24, Math.min(d.box.w - d.rect.x, d.rect.w + wd))
        if (cyn < 0) {
          y = Math.max(0, Math.min(d.rect.y + hd, d.rect.y + d.rect.h - 24))
          h = d.rect.y + d.rect.h - y
        }
        if (cyn > 0) h = Math.max(24, Math.min(d.box.h - d.rect.y, d.rect.h + hd))
      }
      setCropRect({ x, y, w, h })
    }
  }

  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current
    drag.current = null
    setGuides(null)
    setDropFrame(null)
    if (!d) return
    if (d.mode === 'move') {
      if (d.moved) {
        const selIds = selRef.current
        hist.live((dd) => ({
          ...dd,
          nodes: dd.nodes.map((n) => (selIds.has(n.id) && n.type !== 'frame' ? { ...n, frameId: frameContaining(n, dd.nodes) } : n)),
        }))
      }
      hist.end()
      // a click/tap (small net movement) on a lone comment opens its thread (jitter-tolerant)
      const dist = Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy)
      const ids = Object.keys(d.start)
      if (dist < 5 && ids.length === 1) {
        const node = nodesById.get(ids[0])
        if (node?.type === 'comment') setOpenComment(node.id)
      }
      // tap (small net movement, jitter-tolerant — NOT the 2px move flag) on an
      // already-selected editable node → edit. The 2px move flag was too twitchy:
      // a normal click jitters >2px, so editing wrongly needed a 3rd, perfectly-still click.
      if (dist < 6 && d.tapEdit && editing !== d.firstId) startEdit(d.firstId)
    } else if (d.mode === 'resize' || d.mode === 'gresize' || d.mode === 'rotate' || d.mode === 'radius') {
      hist.end()
    } else if (d.mode === 'pen') {
      const pts = penDraft
      setPenDraft(null)
      if (pts) finalizePen(pts)
    } else if (d.mode === 'lasso') {
      const poly = d.points
      setLassoDraft(null)
      if (poly.length > 2) {
        const hit = new Set(hist.get().nodes.filter((n) => n.type !== 'frame' && boxIntersectsPolygon(nodeAABB(n), poly)).map((n) => n.id))
        setSel(hit)
        setSelEdge(null)
      }
    } else if (d.mode === 'erase') {
      if (d.erased.size > 0) hist.end()
      else hist.live((dd) => dd)
    } else if (d.mode === 'marquee') {
      setMarquee(null)
    } else if (d.mode === 'connect') {
      const w = toWorld(e.clientX, e.clientY)
      const target = nodeAt(w)
      const fromId = 'id' in d.from ? d.from.id : ''
      if (target && target.id !== fromId) {
        const edge: CanvasEdge = {
          id: uid(),
          from: fromId,
          to: target.id,
          fromAnchor: 'anchor' in d.from ? d.from.anchor : undefined,
          fromPoint: 'point' in d.from ? d.from.point : undefined,
          toAnchor: nearestAnchor(target, w),
          type: connType,
          arrow: 'end',
        }
        hist.commit((dd) => ({ ...dd, edges: [...dd.edges, edge] }))
        setSelEdge(edge.id)
        setSel(new Set())
      } else if (!target) {
        const src = 'id' in d.from ? nodesById.get(d.from.id) : null
        const p0 = 'point' in d.from ? d.from.point : src ? anchorPoint(src, d.from.anchor) : null
        // dragged out into empty space → offer to create & wire a new card / note here
        if (p0 && Math.hypot(w.x - p0.x, w.y - p0.y) > 12) {
          setConnectMenu({ sx: e.clientX, sy: e.clientY, from: d.from, at: w })
        }
      }
      setConnectCur(null)
      setHover(null)
    } else if (d.mode === 'create') {
      createObject(d.tool, d.down, toWorld(e.clientX, e.clientY))
    } else if (d.mode === 'guide') {
      const r = boardRef.current!.getBoundingClientRect()
      // released back over the originating ruler band → delete (or discard a new one)
      const onRuler = d.axis === 'h' ? e.clientY - r.top < RULER_SIZE : e.clientX - r.left < RULER_SIZE
      const draft = guideDraft
      setGuideDraft(null)
      if (d.index == null) {
        if (!onRuler && draft) hist.commit((dd) => ({ ...dd, guides: [...(dd.guides ?? []), draft] }))
      } else if (onRuler) {
        hist.commit((dd) => ({ ...dd, guides: (dd.guides ?? []).filter((_, i) => i !== d.index) }))
      } else if (draft) {
        hist.commit((dd) => ({ ...dd, guides: (dd.guides ?? []).map((g, i) => (i === d.index ? draft : g)) }))
      }
    } else if (d.mode === 'pan') {
      if (d.button === 2 && !d.moved) {
        const w = toWorld(e.clientX, e.clientY)
        const hit = nodeAt(w)
        if (hit && !sel.has(hit.id)) setSel(new Set([hit.id]))
        setMenu({ x: e.clientX, y: e.clientY, world: w, onNode: !!hit })
      }
    }
  }

  // finalize a gesture interrupted by the OS / lost pointer capture
  const cancelGesture = () => {
    const d = drag.current
    drag.current = null
    if (d && (d.mode === 'move' || d.mode === 'resize' || d.mode === 'gresize' || d.mode === 'rotate' || d.mode === 'radius')) hist.end()
    setMarquee(null)
    setConnectCur(null)
    setPenDraft(null)
    setGuides(null)
    setDropFrame(null)
    setHover(null)
    setGuideDraft(null)
  }

  const onWheel = (e: React.WheelEvent) => {
    if (present != null || cropping) return
    cancelCamAnim()
    if (e.ctrlKey || e.metaKey) {
      const r = boardRef.current!.getBoundingClientRect()
      zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015))
    } else {
      setCam((c) => ({ ...c, x: c.x - e.deltaX, y: c.y - e.deltaY }))
    }
  }

  const startResize = (e: React.PointerEvent, n: CanvasNode, sign: Sign) => {
    e.stopPropagation()
    boardRef.current?.setPointerCapture(e.pointerId)
    hist.begin()
    // dragging a text node's width handle pins its width → switch from auto-width to
    // fixed-width (wrapping, auto-height), so the resize sticks instead of snapping back
    if (n.type === 'text' && n.autoWidth !== false) {
      hist.live((d) => ({ ...d, nodes: d.nodes.map((m) => (m.id === n.id ? { ...m, autoWidth: false } : m)) }))
    }
    drag.current = {
      mode: 'resize',
      id: n.id,
      sign,
      sx: e.clientX,
      sy: e.clientY,
      box: { x: n.x, y: n.y, w: n.w, h: n.h },
      rot: n.rotation || 0,
      aspect: n.type === 'image' || e.shiftKey,
    }
  }
  const startGroupResize = (e: React.PointerEvent, sign: Sign, b: Box) => {
    e.stopPropagation()
    boardRef.current?.setPointerCapture(e.pointerId)
    hist.begin()
    drag.current = {
      mode: 'gresize',
      sign,
      sx: e.clientX,
      sy: e.clientY,
      box: b,
      start: Object.fromEntries(selNodes.filter((n) => !n.locked).map((n) => [n.id, { x: n.x, y: n.y, w: n.w, h: n.h }])),
    }
  }
  const startRotate = (e: React.PointerEvent, n: CanvasNode) => {
    e.stopPropagation()
    boardRef.current?.setPointerCapture(e.pointerId)
    const r = boardRef.current!.getBoundingClientRect()
    const cc = center(n)
    const cxC = r.left + cam.x + cc.x * cam.k
    const cyC = r.top + cam.y + cc.y * cam.k
    hist.begin()
    drag.current = { mode: 'rotate', id: n.id, cxC, cyC, startAngle: Math.atan2(e.clientY - cyC, e.clientX - cxC), startRot: n.rotation || 0 }
  }
  const startRadius = (e: React.PointerEvent, n: CanvasNode, corner: Sign) => {
    e.stopPropagation()
    boardRef.current?.setPointerCapture(e.pointerId)
    hist.begin()
    const cur = n.radius ?? (n.type === 'shape' && n.shape === 'roundRect' ? ROUND_RECT_RADIUS : n.type === 'sticky' || n.type === 'image' ? 6 : 0)
    drag.current = { mode: 'radius', id: n.id, corner, sx: e.clientX, sy: e.clientY, start: cur, max: maxRadius(n.w, n.h) }
  }
  const startCropDrag = (e: React.PointerEvent, corner: Sign | 'move') => {
    e.stopPropagation()
    boardRef.current?.setPointerCapture(e.pointerId)
    const node = cropping ? nodesById.get(cropping) : null
    if (!node || !cropRect) return
    drag.current = { mode: 'crop', corner, sx: e.clientX, sy: e.clientY, rect: cropRect, box: { w: node.w, h: node.h } }
  }

  return {
    startGuide,
    startMoveGuide,
    startConnect,
    onNodePointerDown,
    onBoardPointerDown,
    onBoardDoubleClick,
    onPointerMove,
    onPointerUp,
    cancelGesture,
    onWheel,
    startResize,
    startGroupResize,
    startRotate,
    startRadius,
    startCropDrag,
  }
}
