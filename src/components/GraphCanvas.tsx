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

// ─────────────────────────────────────────────────────────────────────────────
// A clean, faithful Obsidian-style force graph on canvas:
//   • straight links (low opacity, they cross freely — that's normal)
//   • d3-force: many-body repulsion + link spring + center/position gravity
//   • node radius ∝ √(degree); labels sit centred BELOW the node and fade in by
//     zoom (the "text fade" threshold), bigger nodes label sooner — NO collision
//     stacking (zoom in to read a dense cluster, exactly like Obsidian)
//   • smooth eased camera (zoom / focus / fit), gentle fade-in on (re)build
// ─────────────────────────────────────────────────────────────────────────────

export interface GraphNode {
  id: string
  kind: string
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
  kindNames: Record<string, string>
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
  linkColor?: string // '' / undefined = use the theme edge colour
}
// Obsidian-calibrated defaults — a compact, centred ball you zoom into.
export const GRAPH_DEFAULTS: GraphView = {
  arrows: false,
  nodeScale: 1,
  linkWidth: 1,
  linkDistance: 85,
  repel: 120,
  linkForce: 0.18,
  centerForce: 0.08,
  labelFade: 1,
  linkColor: '',
}
// Obsidian-style group: nodes matching `query` are painted `color`
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
  linkBoost?: number
}

interface Props {
  data: GraphData
  accent: string
  colorOf: (kind: string) => string
  groups: GraphGroup[]
  view: GraphView
  palette: GraphPalette
  onNavigate: (route: string) => void
  onTip: (tip: GraphTip | null) => void
}

const FADE_IN = 420 // ms gentle whole-graph fade-in on (re)build

function cssVarHex(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  const m = /^(\d+)\s+(\d+)\s+(\d+)$/.exec(raw)
  if (!m) return raw || fallback
  const toHex = (n: string) => Math.max(0, Math.min(255, parseInt(n, 10))).toString(16).padStart(2, '0')
  return `#${toHex(m[1])}${toHex(m[2])}${toHex(m[3])}`
}
function themePalette(): GraphPalette {
  return { bg: cssVarHex('--bg', '#191919'), edge: cssVarHex('--edge', '#363636'), text: cssVarHex('--ink-400', '#9b9b99') }
}
function hexA(hex: string, a: number): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!m) return `rgba(150,150,160,${a})`
  return `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${a})`
}
function isDarkHex(hex: string): boolean {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!m) return true
  return 0.299 * parseInt(m[1], 16) + 0.587 * parseInt(m[2], 16) + 0.114 * parseInt(m[3], 16) < 128
}
const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n)
const easeOut = (t: number) => 1 - (1 - t) * (1 - t)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

// node radius from degree — hubs bigger, leaves smaller (Obsidian's heuristic)
const radiusFor = (deg: number) => Math.min(18, 4.5 + Math.sqrt(deg) * 2.8)
const isHubKind = (k: string) => k === 'root' || k === 'group'

function matchGroup(query: string, node: GraphNode): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return false
  if (q.startsWith('kind:')) return node.kind === q.slice(5).trim()
  if (q.startsWith('tag:')) return (node.sub ?? '').toLowerCase().includes('#' + q.slice(4).trim())
  return node.label.toLowerCase().includes(q)
}
function resolveColor(node: GraphNode, groups: GraphGroup[], base: (k: string) => string): string {
  for (const g of groups) if (matchGroup(g.query, node)) return g.color
  return base(node.kind)
}

const GraphCanvasImpl = forwardRef<GraphHandle, Props>(function GraphCanvas(
  { data, accent, colorOf, groups, view, palette, onNavigate, onTip },
  ref
) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  const eng = useRef({
    sim: null as Simulation<SimNode, SimLink> | null,
    nodes: [] as SimNode[],
    links: [] as SimLink[],
    byId: new Map<string, SimNode>(),
    adj: new Map<string, Set<string>>(),
    cam: { x: 0, y: 0, k: 1 },
    camT: { x: 0, y: 0, k: 1 },
    hover: null as string | null,
    extHover: null as string | null,
    pinned: null as string | null,
    view,
    accent,
    palette: palette ?? themePalette(),
    colorOf,
    groups,
    onNavigate,
    onTip,
    raf: 0,
    dpr: 1,
    dirty: true,
    clock: 0,
    born: 0,
    fitDone: false, // one auto-fit once the layout has settled
    userMoved: false, // suppress auto-fit after the user pans/zooms
    pos: new Map<string, { x: number; y: number }>(),
    labelOp: new Map<string, number>(), // smoothed per-node label opacity
  })

  eng.current.view = view
  eng.current.accent = accent
  eng.current.palette = palette ?? themePalette()
  eng.current.colorOf = colorOf
  eng.current.groups = groups
  eng.current.onNavigate = onNavigate
  eng.current.onTip = onTip
  eng.current.dirty = true

  useImperativeHandle(ref, () => ({
    highlight(id) {
      eng.current.extHover = id
      eng.current.dirty = true
    },
    focus(id) {
      const n = eng.current.byId.get(id)
      if (!n) return
      const e = eng.current
      e.camT.k = Math.max(e.cam.k, 1.4)
      e.camT.x = -n.x * e.camT.k
      e.camT.y = -n.y * e.camT.k
      e.extHover = id
      e.dirty = true
    },
    fit() {
      fitView(false)
      eng.current.dirty = true
    },
    animate() {
      const e = eng.current
      e.born = e.clock || (typeof performance !== 'undefined' ? performance.now() : Date.now())
      e.sim?.alpha(0.9)
      e.dirty = true
    },
  }))

  function fitView(snap: boolean) {
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
    const k = Math.min(w / (spanX + 140), h / (spanY + 140), 1.6)
    e.camT.k = k
    e.camT.x = -((minX + maxX) / 2) * k
    e.camT.y = -((minY + maxY) / 2) * k
    if (snap) e.cam = { ...e.camT }
  }

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
        x: prev?.x ?? (Math.random() - 0.5) * 240,
        y: prev?.y ?? (Math.random() - 0.5) * 240,
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
      .force('charge', forceManyBody<SimNode>().strength(-v.repel).distanceMin(12).distanceMax(480))
      .force('link', forceLink<SimNode, SimLink>(links).distance(v.linkDistance).strength(v.linkForce))
      .force('collide', forceCollide<SimNode>((d) => radiusFor(d.deg) * v.nodeScale + 4))
      .force('center', forceCenter(0, 0).strength(0.6))
      .force('x', forceX(0).strength(v.centerForce))
      .force('y', forceY(0).strength(v.centerForce))
      .alpha(e.pos.size ? 0.25 : 1)
      .alphaDecay(0.0228)
      .velocityDecay(0.4)
      .stop()

    e.sim = sim
    e.nodes = nodes
    e.links = links
    e.byId = byId
    e.adj = adj
    e.born = typeof performance !== 'undefined' ? performance.now() : Date.now()
    e.fitDone = false
    e.userMoved = false
    if (e.pinned && !byId.has(e.pinned)) e.pinned = null
    for (const id of [...e.labelOp.keys()]) if (!byId.has(id)) e.labelOp.delete(id)

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

    // pre-warm a little so the first frame is sane, then let it settle on screen
    let warm = e.pos.size ? 0 : 40
    while (warm-- > 0) sim.tick()
    fitView(!e.pos.size)

    const draw = () => {
      const { cam, hover, extHover, pinned, accent: acc, palette: pal } = e
      const focus = hover ?? pinned ?? extHover
      const W = cv.clientWidth, H = cv.clientHeight
      const darkBg = isDarkHex(pal.bg)
      const gAppear = easeOut(clamp01((e.clock - e.born) / FADE_IN))
      ctx.setTransform(e.dpr, 0, 0, e.dpr, 0, 0)
      ctx.fillStyle = pal.bg
      ctx.fillRect(0, 0, W, H) // solid ground — no vignette
      ctx.globalAlpha = gAppear
      ctx.translate(W / 2 + cam.x, H / 2 + cam.y)
      ctx.scale(cam.k, cam.k)

      const neigh = focus ? e.adj.get(focus) : null
      const isLit = (id: string) => !focus || id === focus || (neigh?.has(id) ?? false)
      const linkCol = e.view.linkColor || pal.edge
      const boost = pal.linkBoost ?? 1

      // ---- edges: straight lines, low opacity (focused node's links glow accent) ----
      ctx.lineCap = 'round'
      for (const l of e.links) {
        const s = l.source, tg = l.target
        const touches = focus && (s.id === focus || tg.id === focus)
        const dim = focus && !touches
        const a = touches ? 0.85 : Math.min(0.9, (dim ? 0.04 : l.weak ? 0.12 : 0.2) * boost)
        ctx.strokeStyle = touches ? hexA(acc, 0.85) : hexA(linkCol, a)
        ctx.lineWidth = (touches ? 1.8 : l.weak ? 0.7 : 1) * e.view.linkWidth
        ctx.beginPath()
        ctx.moveTo(s.x, s.y)
        ctx.lineTo(tg.x, tg.y)
        ctx.stroke()
        if (e.view.arrows && !dim) {
          const tr = radiusFor(tg.deg) * e.view.nodeScale + 2
          const ang = Math.atan2(tg.y - s.y, tg.x - s.x)
          const ax = tg.x - Math.cos(ang) * tr
          const ay = tg.y - Math.sin(ang) * tr
          const hh = 5
          ctx.fillStyle = ctx.strokeStyle
          ctx.beginPath()
          ctx.moveTo(ax, ay)
          ctx.lineTo(ax - Math.cos(ang - 0.42) * hh, ay - Math.sin(ang - 0.42) * hh)
          ctx.lineTo(ax - Math.cos(ang + 0.42) * hh, ay - Math.sin(ang + 0.42) * hh)
          ctx.closePath()
          ctx.fill()
        }
      }

      // ---- nodes: flat fills; hubs get a thin rim + soft halo; focus gets accent ring ----
      for (const n of e.nodes) {
        const lit = isLit(n.id)
        ctx.globalAlpha = gAppear * (focus ? (lit ? 1 : 0.12) : 1)
        const hub = isHubKind(n.node.kind)
        let r = radiusFor(n.deg) * e.view.nodeScale
        if (n.id === focus) r *= 1.3
        if ((hub || n.id === focus) && lit) {
          ctx.beginPath()
          ctx.arc(n.x, n.y, r + 3.5, 0, Math.PI * 2)
          ctx.fillStyle = hexA(n.id === focus ? acc : n.color, 0.16)
          ctx.fill()
        }
        ctx.beginPath()
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2)
        ctx.fillStyle = n.color
        ctx.fill()
        if (n.id === focus) {
          ctx.lineWidth = 2.5 / cam.k
          ctx.strokeStyle = hexA(acc, 0.9)
          ctx.stroke()
        } else if (hub) {
          ctx.lineWidth = 1.5 / cam.k
          ctx.strokeStyle = hexA(darkBg ? '#ffffff' : '#000000', 0.14)
          ctx.stroke()
        }
      }
      ctx.globalAlpha = 1

      // ---- labels (screen-space; centred below the node; fade in by zoom — no stacking) ----
      // Obsidian behaviour: zoomed out → only hubs/big nodes are labelled; zooming in
      // fades the rest in. Dense clusters overlap (you zoom to read) — we DON'T juggle slots.
      ctx.setTransform(e.dpr, 0, 0, e.dpr, 0, 0)
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      const lf = e.view.labelFade
      for (const n of e.nodes) {
        const hub = isHubKind(n.node.kind)
        const r = radiusFor(n.deg) * e.view.nodeScale * (n.id === focus ? 1.3 : 1)
        const sizeF = clamp01((radiusFor(n.deg) - 4.5) / 8) // 0 (leaf) … 1 (hub-sized)
        // zoom threshold: hubs label early, leaves only once you've zoomed in
        const thr = hub ? 0.3 : 1.0 - sizeF * 0.4
        const z = cam.k * lf
        let target: number
        if (focus) target = isLit(n.id) ? 1 : 0
        else if (lf <= 0) target = 0
        else target = clamp01((z - thr) / 0.35)

        const sx = W / 2 + cam.x + n.x * cam.k
        const sy = H / 2 + cam.y + n.y * cam.k + r * cam.k + 4
        if (sx < -180 || sx > W + 180 || sy < -30 || sy > H + 40) target = 0

        const cur = e.labelOp.get(n.id) ?? 0
        const nv = lerp(cur, target, 0.22) * gAppear
        if (nv <= 0.02) {
          e.labelOp.delete(n.id)
          continue
        }
        e.labelOp.set(n.id, nv / (gAppear || 1))
        const raw = n.node.label
        const label = raw.length > 26 ? raw.slice(0, 25) + '…' : raw
        ctx.font = `${hub ? '600 12' : '11'}px Inter, -apple-system, system-ui, sans-serif`
        ctx.globalAlpha = nv
        ctx.lineWidth = 3.5
        ctx.lineJoin = 'round'
        ctx.strokeStyle = hexA(pal.bg, 0.9) // halo keeps text legible over edges
        ctx.strokeText(label, sx, sy)
        ctx.fillStyle = pal.text
        ctx.fillText(label, sx, sy)
      }
      ctx.globalAlpha = 1
    }

    const frame = () => {
      e.clock = typeof performance !== 'undefined' ? performance.now() : Date.now()
      if (e.sim && e.sim.alpha() > 0.0015) {
        e.sim.tick()
        e.dirty = true
        // once the layout has settled, frame it once (unless the user already explored)
        if (!e.fitDone && !e.userMoved && e.sim.alpha() < 0.06) {
          fitView(false)
          e.fitDone = true
        }
      }
      const c = e.cam, ct = e.camT
      if (Math.abs(c.x - ct.x) > 0.4 || Math.abs(c.y - ct.y) > 0.4 || Math.abs(c.k - ct.k) > 0.001) {
        c.x = lerp(c.x, ct.x, 0.22)
        c.y = lerp(c.y, ct.y, 0.22)
        c.k = lerp(c.k, ct.k, 0.22)
        e.dirty = true
      }
      if (e.clock - e.born < FADE_IN) e.dirty = true // keep drawing through the fade-in
      if (e.dirty) {
        draw()
        e.dirty = false
      }
      e.raf = requestAnimationFrame(frame)
    }
    e.raf = requestAnimationFrame(frame)

    // ---- interaction ----
    const toWorld = (clientX: number, clientY: number, useCam: { x: number; y: number; k: number }) => {
      const rect = cv.getBoundingClientRect()
      const sx = clientX - rect.left, sy = clientY - rect.top
      return { x: (sx - rect.width / 2 - useCam.x) / useCam.k, y: (sy - rect.height / 2 - useCam.y) / useCam.k, sx, sy }
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
      const w = toWorld(ev.clientX, ev.clientY, e.cam)
      const n = pick(w.x, w.y)
      drag = { node: n, sx: ev.clientX, sy: ev.clientY, moved: false, lastX: ev.clientX, lastY: ev.clientY }
      if (n) {
        n.fx = n.x; n.fy = n.y
        reheat()
      }
    }
    const onMove = (ev: PointerEvent) => {
      if (drag) {
        if (Math.abs(ev.clientX - drag.sx) + Math.abs(ev.clientY - drag.sy) > 3) drag.moved = true
        if (drag.node) {
          const w = toWorld(ev.clientX, ev.clientY, e.cam)
          drag.node.fx = w.x; drag.node.fy = w.y
          reheat()
        } else {
          const dx = ev.clientX - drag.lastX, dy = ev.clientY - drag.lastY
          e.cam.x += dx; e.cam.y += dy
          e.camT.x += dx; e.camT.y += dy
          e.userMoved = true
          e.dirty = true
        }
        drag.lastX = ev.clientX; drag.lastY = ev.clientY
        return
      }
      const w = toWorld(ev.clientX, ev.clientY, e.cam)
      const n = pick(w.x, w.y)
      const id = n?.id ?? null
      if (id !== e.hover || n) {
        e.hover = id
        e.onTip(
          n
            ? { head: data.kindNames[n.node.kind] ?? n.node.kind, label: n.node.label, sub: n.node.sub, color: n.color, clientX: ev.clientX, clientY: ev.clientY }
            : null
        )
      }
      cv.style.cursor = n ? 'pointer' : 'grab'
      e.dirty = true
    }
    const onUp = (ev: PointerEvent) => {
      if (drag) {
        if (drag.node) {
          drag.node.fx = null; drag.node.fy = null
          if (!drag.moved) {
            const route = drag.node.node.route
            if (route) e.onNavigate(route)
            else e.pinned = e.pinned === drag.node.id ? null : drag.node.id
          }
        } else if (!drag.moved) {
          e.pinned = null
        }
        drag = null
        e.dirty = true
      }
      try { cv.releasePointerCapture(ev.pointerId) } catch { /* not captured */ }
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
      e.userMoved = true
      const w = toWorld(ev.clientX, ev.clientY, e.camT)
      const factor = Math.exp(-ev.deltaY * 0.0015)
      const nk = Math.max(0.15, Math.min(6, e.camT.k * factor))
      e.camT.x = w.sx - cv.clientWidth / 2 - w.x * nk
      e.camT.y = w.sy - cv.clientHeight / 2 - w.y * nk
      e.camT.k = nk
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
      for (const n of e.nodes) e.pos.set(n.id, { x: n.x, y: n.y })
      sim.stop()
      e.sim = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  // live physics updates when the sliders change (no rebuild)
  useEffect(() => {
    const e = eng.current
    const sim = e.sim
    if (!sim) return
    ;(sim.force('charge') as ForceManyBody<SimNode> | undefined)?.strength(-view.repel)
    ;(sim.force('link') as ForceLink<SimNode, SimLink> | undefined)?.distance(view.linkDistance).strength(view.linkForce)
    ;(sim.force('collide') as ForceCollide<SimNode> | undefined)?.radius((d) => radiusFor(d.deg) * view.nodeScale + 4)
    ;(sim.force('x') as ForceX<SimNode> | undefined)?.strength(view.centerForce)
    ;(sim.force('y') as ForceY<SimNode> | undefined)?.strength(view.centerForce)
    sim.alpha(Math.max(sim.alpha(), 0.3))
    e.dirty = true
  }, [view.repel, view.linkDistance, view.nodeScale, view.linkForce, view.centerForce])

  useEffect(() => {
    const e = eng.current
    for (const n of e.nodes) n.color = resolveColor(n.node, groups, colorOf)
    e.dirty = true
  }, [groups, colorOf])

  return (
    <div ref={wrapRef} className="h-full w-full">
      <canvas ref={canvasRef} className="h-full w-full" style={{ touchAction: 'none' }} />
    </div>
  )
})

export default memo(GraphCanvasImpl)
