import { forwardRef, memo, useEffect, useImperativeHandle, useRef } from 'react'
import {
  forceSimulation,
  forceManyBody,
  forceLink,
  forceCollide,
  forceCenter,
  forceX,
  forceY,
  type Simulation,
  type ForceManyBody,
  type ForceLink,
  type ForceCollide,
  type ForceX,
  type ForceY,
} from 'd3-force'
import type { MemoryKind } from '../types/models'

export interface GraphNode {
  id: string
  kind: MemoryKind
  label: string
  sub: string | null
  route: string
}
export interface GraphEdge {
  a: number
  b: number
  weak?: boolean
}
export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
  kindNames: Record<MemoryKind, string>
}
export interface GraphView {
  arrows: boolean
  nodeScale: number
  linkWidth: number
  linkDistance: number
  repel: number
  linkForce: number
  centerForce: number
  labelFade: number
}
export const GRAPH_DEFAULTS: GraphView = {
  arrows: false,
  nodeScale: 1,
  linkWidth: 1,
  linkDistance: 120,
  repel: 300,
  linkForce: 0.06,
  centerForce: 0.05,
  labelFade: 1,
}
// Obsidian-style colour group: nodes matching `query` are painted `color`
export interface GraphGroup {
  id: string
  query: string // "tag:foo", "kind:note", or plain text matched against the label
  color: string
}
export interface GraphTip {
  head: string
  label: string
  sub: string | null
  color: string
  clientX: number
  clientY: number
}
export interface GraphHandle {
  highlight(id: string | null): void
  focus(id: string): void
  fit(): void
  animate(): void
}

interface SimNode {
  id: string
  deg: number
  color: string
  node: GraphNode
  x: number
  y: number
  vx: number
  vy: number
  fx?: number | null
  fy?: number | null
}
interface SimLink {
  source: SimNode
  target: SimNode
  weak: boolean
}

export interface GraphPalette {
  bg: string
  edge: string
  text: string
  linkBoost?: number // multiply edge alpha — light backgrounds need stronger edges to read
}

interface Props {
  data: GraphData
  accent: string // hex like #7c6af7
  colorOf: (kind: MemoryKind) => string
  groups: GraphGroup[]
  view: GraphView
  palette: GraphPalette
  onNavigate: (route: string) => void
  onTip: (tip: GraphTip | null) => void
}

const DEFAULT_PALETTE: GraphPalette = { bg: '#1e1e2e', edge: '#3b3b54', text: '#c9c9da' }

function hexA(hex: string, a: number): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!m) return `rgba(180,180,200,${a})`
  return `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${a})`
}
const radiusFor = (deg: number) => Math.min(16, 5 + Math.sqrt(deg) * 2.4)

// Obsidian-style group matcher: kind:x, tag:x, or plain label substring
function matchGroup(query: string, node: GraphNode): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return false
  if (q.startsWith('kind:')) return node.kind === q.slice(5).trim()
  if (q.startsWith('tag:')) return (node.sub ?? '').toLowerCase().includes('#' + q.slice(4).trim())
  return node.label.toLowerCase().includes(q)
}
function resolveColor(node: GraphNode, groups: GraphGroup[], base: (k: MemoryKind) => string): string {
  for (const g of groups) if (matchGroup(g.query, node)) return g.color
  return base(node.kind)
}

const GraphCanvasImpl = forwardRef<GraphHandle, Props>(function GraphCanvas(
  { data, accent, colorOf, groups, view, palette, onNavigate, onTip },
  ref
) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  // all mutable engine state lives here so the rAF loop always sees the latest
  const eng = useRef({
    sim: null as Simulation<SimNode, SimLink> | null,
    nodes: [] as SimNode[],
    links: [] as SimLink[],
    byId: new Map<string, SimNode>(),
    adj: new Map<string, Set<string>>(),
    cam: { x: 0, y: 0, k: 1 },
    hover: null as string | null,
    extHover: null as string | null,
    view,
    accent,
    palette: palette ?? DEFAULT_PALETTE,
    colorOf,
    groups,
    onNavigate,
    onTip,
    raf: 0,
    dpr: 1,
    dirty: true, // when false and the sim is settled, the rAF loop skips repainting
    pos: new Map<string, { x: number; y: number }>(), // remembered positions across rebuilds
  })

  // refresh latest props into the engine each render without restarting physics
  eng.current.view = view
  eng.current.accent = accent
  eng.current.palette = palette ?? DEFAULT_PALETTE
  eng.current.colorOf = colorOf
  eng.current.groups = groups
  eng.current.onNavigate = onNavigate
  eng.current.onTip = onTip
  eng.current.dirty = true // props (view/colors) may have changed → repaint next frame

  useImperativeHandle(ref, () => ({
    highlight(id) {
      eng.current.extHover = id
      eng.current.dirty = true
    },
    focus(id) {
      const n = eng.current.byId.get(id)
      const cv = canvasRef.current
      if (!n || !cv) return
      const e = eng.current
      e.cam.k = Math.max(e.cam.k, 1.2)
      e.cam.x = -n.x * e.cam.k
      e.cam.y = -n.y * e.cam.k
      e.extHover = id
      e.dirty = true
    },
    fit() {
      fitView()
      eng.current.dirty = true
    },
    animate() {
      // re-run the layout from a hot state (Obsidian's "Animate")
      eng.current.sim?.alpha(1)
      eng.current.dirty = true
    },
  }))

  function fitView() {
    const e = eng.current
    const cv = canvasRef.current
    if (!cv || !e.nodes.length) return
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const n of e.nodes) {
      minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x)
      minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y)
    }
    const w = cv.clientWidth, h = cv.clientHeight
    const spanX = Math.max(1, maxX - minX), spanY = Math.max(1, maxY - minY)
    const k = Math.min(w / (spanX + 120), h / (spanY + 120), 2)
    e.cam.k = k
    e.cam.x = -((minX + maxX) / 2) * k
    e.cam.y = -((minY + maxY) / 2) * k
  }

  // ---- (re)build the simulation when the data set changes ----
  useEffect(() => {
    const cv = canvasRef.current
    const wrap = wrapRef.current
    if (!cv || !wrap) return
    const e = eng.current
    const ctx = cv.getContext('2d')!

    const nodes: SimNode[] = data.nodes.map((node) => {
      const prev = e.pos.get(node.id)
      return {
        id: node.id,
        deg: 0,
        color: resolveColor(node, e.groups, colorOf),
        node,
        x: prev?.x ?? (Math.random() - 0.5) * 400,
        y: prev?.y ?? (Math.random() - 0.5) * 400,
        vx: 0,
        vy: 0,
      }
    })
    const byId = new Map(nodes.map((n) => [n.id, n]))
    const adj = new Map<string, Set<string>>()
    const links: SimLink[] = []
    for (const ed of data.edges) {
      const s = nodes[ed.a]
      const tg = nodes[ed.b]
      if (!s || !tg) continue
      s.deg++; tg.deg++
      links.push({ source: s, target: tg, weak: !!ed.weak })
      if (!adj.has(s.id)) adj.set(s.id, new Set())
      if (!adj.has(tg.id)) adj.set(tg.id, new Set())
      adj.get(s.id)!.add(tg.id)
      adj.get(tg.id)!.add(s.id)
    }

    const v = e.view
    const sim = forceSimulation<SimNode, SimLink>(nodes)
      .force('charge', forceManyBody<SimNode>().strength(-v.repel))
      .force('link', forceLink<SimNode, SimLink>(links).distance(v.linkDistance).strength(v.linkForce))
      .force('collide', forceCollide<SimNode>((d) => radiusFor(d.deg) * v.nodeScale + 6))
      .force('center', forceCenter(0, 0))
      .force('x', forceX(0).strength(v.centerForce))
      .force('y', forceY(0).strength(v.centerForce))
      // a remembered layout barely re-relaxes on filter toggles; a fresh graph cools from 1
      .alpha(e.pos.size ? 0.2 : 1)
      .alphaDecay(0.025)
      .stop()

    e.sim = sim
    e.nodes = nodes
    e.links = links
    e.byId = byId
    e.adj = adj

    // ---- canvas sizing (DPR-aware) ----
    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      e.dpr = dpr
      cv.width = Math.round(cv.clientWidth * dpr)
      cv.height = Math.round(cv.clientHeight * dpr)
      e.dirty = true
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(cv)

    if (!e.pos.size) fitView() // first build → frame the graph once it settles a bit
    let warm = e.pos.size ? 0 : 40
    while (warm-- > 0) sim.tick()
    if (!e.pos.size) fitView()

    // ---- draw ----
    const draw = () => {
      const { cam, hover, extHover, accent: acc, palette: pal } = e
      const focus = hover ?? extHover
      const W = cv.clientWidth, H = cv.clientHeight
      ctx.setTransform(e.dpr, 0, 0, e.dpr, 0, 0)
      ctx.fillStyle = pal.bg
      ctx.fillRect(0, 0, W, H)
      ctx.translate(W / 2 + cam.x, H / 2 + cam.y)
      ctx.scale(cam.k, cam.k)

      const neigh = focus ? e.adj.get(focus) : null
      const isLit = (id: string) => !focus || id === focus || (neigh?.has(id) ?? false)

      // edges
      ctx.lineCap = 'round'
      for (const l of e.links) {
        const touches = focus && (l.source.id === focus || l.target.id === focus)
        const dim = focus && !touches
        const ea = Math.min(0.95, (dim ? 0.05 : l.weak ? 0.16 : 0.3) * (pal.linkBoost ?? 1))
        ctx.strokeStyle = touches ? hexA(acc, 0.9) : hexA(pal.edge, ea)
        ctx.lineWidth = (touches ? 1.8 : 1) * e.view.linkWidth
        ctx.beginPath()
        ctx.moveTo(l.source.x, l.source.y)
        ctx.lineTo(l.target.x, l.target.y)
        ctx.stroke()
        if (e.view.arrows && !dim) {
          const tr = radiusFor(l.target.deg) * e.view.nodeScale + 2
          const ang = Math.atan2(l.target.y - l.source.y, l.target.x - l.source.x)
          const ax = l.target.x - Math.cos(ang) * tr
          const ay = l.target.y - Math.sin(ang) * tr
          const h = 5
          ctx.fillStyle = ctx.strokeStyle
          ctx.beginPath()
          ctx.moveTo(ax, ay)
          ctx.lineTo(ax - Math.cos(ang - 0.42) * h, ay - Math.sin(ang - 0.42) * h)
          ctx.lineTo(ax - Math.cos(ang + 0.42) * h, ay - Math.sin(ang + 0.42) * h)
          ctx.closePath()
          ctx.fill()
        }
      }

      // nodes
      for (const n of e.nodes) {
        const lit = isLit(n.id)
        const op = focus ? (lit ? 1 : 0.15) : 1
        let r = radiusFor(n.deg) * e.view.nodeScale
        if (n.id === focus) r *= 1.4
        const col = n.color
        ctx.globalAlpha = op
        ctx.shadowBlur = lit ? 15 : 0
        ctx.shadowColor = col
        ctx.beginPath()
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2)
        ctx.fillStyle = col
        ctx.fill()
        ctx.shadowBlur = 0
        if (n.id === focus) {
          ctx.lineWidth = 2 / cam.k
          ctx.strokeStyle = pal.text
          ctx.stroke()
        }
      }

      // labels
      const labelK = e.view.labelFade
      const show = labelK > 0 && cam.k * labelK > 0.55
      if (show || focus) {
        ctx.shadowBlur = 0
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        ctx.font = '11px Inter, -apple-system, system-ui, sans-serif'
        for (const n of e.nodes) {
          const lit = isLit(n.id)
          if (focus && !lit) continue
          if (!show && n.id !== focus && !(neigh?.has(n.id) ?? false)) continue
          const r = radiusFor(n.deg) * e.view.nodeScale * (n.id === focus ? 1.4 : 1)
          ctx.globalAlpha = focus ? (lit ? 1 : 0.15) : Math.min(1, cam.k * labelK - 0.4)
          ctx.fillStyle = pal.text
          const label = n.node.label.length > 24 ? n.node.label.slice(0, 23) + '…' : n.node.label
          ctx.fillText(label, n.x, n.y + r + 3)
        }
      }
      ctx.globalAlpha = 1
    }

    const frame = () => {
      if (e.sim && e.sim.alpha() > 0.004) {
        e.sim.tick()
        e.dirty = true
      }
      if (e.dirty) {
        draw()
        e.dirty = false
      }
      e.raf = requestAnimationFrame(frame)
    }
    e.raf = requestAnimationFrame(frame)

    // ---- interaction ----
    const toWorld = (clientX: number, clientY: number) => {
      const rect = cv.getBoundingClientRect()
      const sx = clientX - rect.left, sy = clientY - rect.top
      return {
        x: (sx - rect.width / 2 - e.cam.x) / e.cam.k,
        y: (sy - rect.height / 2 - e.cam.y) / e.cam.k,
        sx,
        sy,
      }
    }
    const pick = (wx: number, wy: number): SimNode | null => {
      let best: SimNode | null = null
      let bestD = Infinity
      for (const n of e.nodes) {
        const r = radiusFor(n.deg) * e.view.nodeScale + 4
        const d = (n.x - wx) ** 2 + (n.y - wy) ** 2
        if (d < r * r && d < bestD) {
          bestD = d
          best = n
        }
      }
      return best
    }

    let drag: { node: SimNode | null; sx: number; sy: number; moved: boolean; lastX: number; lastY: number } | null = null

    const reheat = () => {
      if (e.sim) e.sim.alpha(Math.max(e.sim.alpha(), 0.3))
      e.dirty = true
    }

    const onDown = (ev: PointerEvent) => {
      cv.setPointerCapture(ev.pointerId)
      const w = toWorld(ev.clientX, ev.clientY)
      const n = pick(w.x, w.y)
      drag = { node: n, sx: ev.clientX, sy: ev.clientY, moved: false, lastX: ev.clientX, lastY: ev.clientY }
      if (n) {
        n.fx = n.x
        n.fy = n.y
        reheat()
      }
    }
    const onMove = (ev: PointerEvent) => {
      if (drag) {
        if (Math.abs(ev.clientX - drag.sx) + Math.abs(ev.clientY - drag.sy) > 3) drag.moved = true
        if (drag.node) {
          const w = toWorld(ev.clientX, ev.clientY)
          drag.node.fx = w.x
          drag.node.fy = w.y
          reheat()
        } else {
          // DPR-safe pan: track our own client delta (movementX is unreliable on HiDPI Windows)
          e.cam.x += ev.clientX - drag.lastX
          e.cam.y += ev.clientY - drag.lastY
          e.dirty = true
        }
        drag.lastX = ev.clientX
        drag.lastY = ev.clientY
        return
      }
      // hover
      const w = toWorld(ev.clientX, ev.clientY)
      const n = pick(w.x, w.y)
      const id = n?.id ?? null
      if (id !== e.hover) {
        e.hover = id
        if (n) {
          e.onTip({
            head: data.kindNames[n.node.kind] ?? n.node.kind,
            label: n.node.label,
            sub: n.node.sub,
            color: n.color,
            clientX: ev.clientX,
            clientY: ev.clientY,
          })
        } else {
          e.onTip(null)
        }
      } else if (n) {
        e.onTip({
          head: data.kindNames[n.node.kind] ?? n.node.kind,
          label: n.node.label,
          sub: n.node.sub,
          color: n.color,
          clientX: ev.clientX,
          clientY: ev.clientY,
        })
      }
      cv.style.cursor = n ? 'pointer' : 'grab'
      e.dirty = true
    }
    const onUp = (ev: PointerEvent) => {
      if (drag) {
        if (drag.node) {
          drag.node.fx = null
          drag.node.fy = null
          if (!drag.moved) e.onNavigate(drag.node.node.route)
        }
        drag = null
        e.dirty = true
      }
      try {
        cv.releasePointerCapture(ev.pointerId)
      } catch {
        /* not captured */
      }
    }
    const onLeave = () => {
      if (!drag) {
        e.hover = null
        e.onTip(null)
        e.dirty = true
      }
    }
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault()
      const w = toWorld(ev.clientX, ev.clientY)
      const factor = Math.exp(-ev.deltaY * 0.0015)
      const nk = Math.max(0.15, Math.min(5, e.cam.k * factor))
      // keep the point under the cursor fixed
      e.cam.x = w.sx - cv.clientWidth / 2 - w.x * nk
      e.cam.y = w.sy - cv.clientHeight / 2 - w.y * nk
      e.cam.k = nk
      e.dirty = true
    }

    cv.addEventListener('pointerdown', onDown)
    cv.addEventListener('pointermove', onMove)
    cv.addEventListener('pointerup', onUp)
    cv.addEventListener('pointerleave', onLeave)
    cv.addEventListener('wheel', onWheel, { passive: false })

    return () => {
      cancelAnimationFrame(e.raf)
      ro.disconnect()
      cv.removeEventListener('pointerdown', onDown)
      cv.removeEventListener('pointermove', onMove)
      cv.removeEventListener('pointerup', onUp)
      cv.removeEventListener('pointerleave', onLeave)
      cv.removeEventListener('wheel', onWheel)
      for (const n of e.nodes) e.pos.set(n.id, { x: n.x, y: n.y }) // remember layout
      sim.stop()
      e.sim = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  // ---- live physics updates when the sliders change (no rebuild) ----
  useEffect(() => {
    const e = eng.current
    const sim = e.sim
    if (!sim) return
    const charge = sim.force('charge') as ForceManyBody<SimNode> | undefined
    charge?.strength(-view.repel)
    const link = sim.force('link') as ForceLink<SimNode, SimLink> | undefined
    link?.distance(view.linkDistance).strength(view.linkForce)
    const collide = sim.force('collide') as ForceCollide<SimNode> | undefined
    collide?.radius((d) => radiusFor(d.deg) * view.nodeScale + 6)
    ;(sim.force('x') as ForceX<SimNode> | undefined)?.strength(view.centerForce)
    ;(sim.force('y') as ForceY<SimNode> | undefined)?.strength(view.centerForce)
    sim.alpha(Math.max(sim.alpha(), 0.3))
    e.dirty = true
  }, [view.repel, view.linkDistance, view.nodeScale, view.linkForce, view.centerForce])

  // recolour nodes when the colour groups change (no rebuild)
  useEffect(() => {
    const e = eng.current
    for (const n of e.nodes) n.color = resolveColor(n.node, groups, e.colorOf)
    e.dirty = true
  }, [groups])

  return (
    <div ref={wrapRef} className="h-full w-full">
      <canvas ref={canvasRef} className="h-full w-full" style={{ touchAction: 'none' }} />
    </div>
  )
})

export default memo(GraphCanvasImpl)
