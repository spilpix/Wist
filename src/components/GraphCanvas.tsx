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
  /** Hint: start the node near this world-space coordinate (optional). */
  initialX?: number
  initialY?: number
  /** If true, render dimmed + smaller (asteroid belt orphan). */
  orphan?: boolean
  /** Capacities soft bg color (--obj-*-soft) for the node chip background. */
  colorSoft?: string
  /** Structural anchor (root / kind hub) — rendered larger, fixed radius. */
  hub?: boolean
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
  linkDistance: 120,
  repel: 230,
  linkForce: 0.16,
  centerForce: 0.05,
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
  baseR: number // resolved render radius (hub-aware), computed once per build
  color: string
  colorSoft: string // (unused for dot rendering; kept for API compatibility)
  node: GraphNode
  x: number
  y: number
  vx: number
  vy: number
  fx?: number | null
  fy?: number | null
  driftA: number // wander angle — gives the graph perpetual gentle motion
  driftSpeed: number
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

// Exact Capacities icons — polyline/line/rect converted to M..L.. path strings.
const ICON_P2D: Record<string, Path2D[]> = {
  note: [   // blue: FileText
    new Path2D('M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z'),
    new Path2D('M14 2L14 8L20 8'),
  ],
  task: [   // orange: CheckSquare
    new Path2D('M9 11L12 14L22 4'),
    new Path2D('M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11'),
  ],
  project: [  // indigo: Folder
    new Path2D('M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z'),
  ],
  canvas: [   // purple: MessageSquare / idea
    new Path2D('M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'),
  ],
  vault: [    // slate: Archive
    new Path2D('M21 8L21 21L3 21L3 8'),
    new Path2D('M1 3H23V8H1Z'),
    new Path2D('M10 12L14 12'),
  ],
  file: [     // slate: Archive (same)
    new Path2D('M21 8L21 21L3 21L3 8'),
    new Path2D('M1 3H23V8H1Z'),
    new Path2D('M10 12L14 12'),
  ],
  folder: [   // indigo: Folder (same as project)
    new Path2D('M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z'),
  ],
  root: [     // indigo: LayoutGrid — workspace anchor
    new Path2D('M3 3H10V10H3Z'),
    new Path2D('M14 3H21V10H14Z'),
    new Path2D('M14 14H21V21H14Z'),
    new Path2D('M3 14H10V21H3Z'),
  ],
}
// Rounded rect helper (avoids TS issues with ctx.roundRect in older type defs)
function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

// Obsidian-style dots — small, grow gently with connections; hubs a touch bigger
const radiusFor = (deg: number) => Math.max(4.5, Math.min(11, 4 + Math.sqrt(deg) * 1.3))
const resolveRadius = (n: SimNode): number =>
  n.node.hub ? (n.node.kind === 'root' ? 13 : 10) : radiusFor(n.deg)
const isHubKind = (k: string) => k === 'root' || k === 'group'
// gentle pop-in easing (slight overshoot) for the entrance animation
const easeOutBack = (t: number) => {
  if (t <= 0) return 0
  if (t >= 1) return 1
  const c1 = 1.12, c3 = c1 + 1
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
}

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
    pulseNodes: new Map<string, number>(),  // nodeId → animation start ms
    hoverScales: new Map<string, number>(), // nodeId → current scale (lerped)
    births: new Map<string, number>(),      // nodeId → entrance delay ms (staggered)
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
    // cap zoom-in low so sparse graphs stay zoomed-out (small chips + room for labels)
    const k = Math.min(w / (spanX + 220), h / (spanY + 220), 1.0)
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
        baseR: 16,
        color: resolveColor(node, e.groups, colorOf),
        colorSoft: node.colorSoft ?? '',
        node,
        x: prev?.x ?? node.initialX ?? (Math.random() - 0.5) * 240,
        y: prev?.y ?? node.initialY ?? (Math.random() - 0.5) * 240,
        vx: 0,
        vy: 0,
        driftA: Math.random() * Math.PI * 2,
        driftSpeed: 0.01 + Math.random() * 0.015,
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
    // resolve render radius now that degrees are known (used by collide + draw)
    for (const n of nodes) n.baseR = resolveRadius(n)

    const v = e.view
    const sim = forceSimulation<SimNode, SimLink>(nodes)
      .force('charge', forceManyBody<SimNode>().strength((d) => -v.repel * (d.node.hub ? 2.4 : 1)).distanceMin(12).distanceMax(520))
      .force('link', forceLink<SimNode, SimLink>(links).distance((l) => (l.source.node.hub || l.target.node.hub ? v.linkDistance * 1.5 : v.linkDistance)).strength(v.linkForce))
      .force('collide', forceCollide<SimNode>((d) => d.baseR * v.nodeScale + 18).strength(1))
      .force('center', forceCenter(0, 0).strength(0.6))
      .force('x', forceX(0).strength(v.centerForce))
      .force('y', forceY(0).strength(v.centerForce))
      .alpha(e.pos.size ? 0.4 : 1)
      .alphaDecay(0.0228)
      .alphaTarget(0.025) // never fully cools — keeps the graph alive (no stagnation)
      .velocityDecay(0.62) // strong damping → slow, smooth drift (not jittery)
      .stop()

    e.sim = sim
    e.nodes = nodes
    e.links = links
    e.byId = byId
    e.adj = adj
    e.born = typeof performance !== 'undefined' ? performance.now() : Date.now()
    e.fitDone = false
    e.userMoved = false
    // staggered entrance — root first, hubs next, leaves last (+ small scatter)
    e.births.clear()
    nodes.forEach((n, i) => {
      const depth = n.node.kind === 'root' ? 0 : n.node.hub ? 1 : 2
      e.births.set(n.id, depth * 85 + ((i * 23) % 130))
    })
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
      // per-node entrance progress (0→1) with staggered birth delays
      const GROW = 360
      const apOf = (id: string) => clamp01((e.clock - e.born - (e.births.get(id) ?? 0)) / GROW)
      ctx.setTransform(e.dpr, 0, 0, e.dpr, 0, 0)
      ctx.fillStyle = pal.bg
      ctx.fillRect(0, 0, W, H) // solid ground — no vignette
      // Dot grid — scrolls with pan (Capacities-style background texture)
      {
        const GRID = 26
        const ox = ((W / 2 + cam.x) % GRID + GRID) % GRID
        const oy = ((H / 2 + cam.y) % GRID + GRID) % GRID
        ctx.fillStyle = darkBg ? 'rgba(255,255,255,0.048)' : 'rgba(0,0,0,0.06)'
        for (let gx = ox - GRID; gx < W + 1; gx += GRID)
          for (let gy = oy - GRID; gy < H + 1; gy += GRID) {
            ctx.beginPath(); ctx.arc(gx, gy, 0.85, 0, Math.PI * 2); ctx.fill()
          }
      }
      ctx.globalAlpha = gAppear
      ctx.translate(W / 2 + cam.x, H / 2 + cam.y)
      ctx.scale(cam.k, cam.k)

      const neigh = focus ? e.adj.get(focus) : null
      const isLit = (id: string) => !focus || id === focus || (neigh?.has(id) ?? false)
      const linkCol = e.view.linkColor || pal.edge
      const boost = pal.linkBoost ?? 1

      // ---- edges: thin lines trimmed to chip edges; draw-in on entrance; accent on focus ----
      ctx.lineCap = 'round'
      for (const l of e.links) {
        const s = l.source, tg = l.target
        const eap = Math.min(apOf(s.id), apOf(tg.id)) // entrance: appear once both ends are in
        if (eap <= 0.01) continue
        const touches = focus && (s.id === focus || tg.id === focus)
        const dim = focus && !touches
        const a = (touches ? 0.9 : dim ? 0.04 : Math.min(0.55, (l.weak ? 0.14 : 0.27) * boost)) * eap
        // trim endpoints to each node's chip edge so lines kiss the squares, not overlap them
        const dx = tg.x - s.x, dy = tg.y - s.y
        const len = Math.hypot(dx, dy) || 1
        const ux = dx / len, uy = dy / len
        const sr = (s.baseR * e.view.nodeScale + 2)
        const tr = (tg.baseR * e.view.nodeScale + 2)
        if (len <= sr + tr) continue // nodes overlap — skip the line
        const sx = s.x + ux * sr, sy = s.y + uy * sr
        const fx = tg.x - ux * tr, fy = tg.y - uy * tr
        // grow the line from the source toward the target during the entrance
        const ex = sx + (fx - sx) * eap, ey = sy + (fy - sy) * eap
        ctx.strokeStyle = touches ? hexA(acc, a) : hexA(linkCol, a)
        ctx.lineWidth = (touches ? 1.5 : l.weak ? 0.55 : 0.9) * e.view.linkWidth
        ctx.beginPath()
        ctx.moveTo(sx, sy)
        ctx.lineTo(ex, ey)
        ctx.stroke()
      }

      // ---- pulse rings (click feedback, drawn in world space before nodes) ----
      for (const [pid, startT] of [...e.pulseNodes.entries()]) {
        const progress = Math.min(1, (e.clock - startT) / 700)
        if (progress >= 1) { e.pulseNodes.delete(pid); continue }
        const pn = e.byId.get(pid)
        if (!pn) { e.pulseNodes.delete(pid); continue }
        const pr = pn.baseR * e.view.nodeScale * (pn.node.orphan ? 0.65 : 1)
        const pulseR = pr * 1.4 + progress * 28
        ctx.globalAlpha = gAppear * (1 - progress) * 0.55
        ctx.beginPath()
        ctx.arc(pn.x, pn.y, pulseR, 0, Math.PI * 2)
        ctx.strokeStyle = hexA(acc, 1)
        ctx.lineWidth = 2.5 / cam.k
        ctx.stroke()
      }

      // ---- nodes: Obsidian-style bright dots with a soft glow ----
      for (const n of e.nodes) {
        const lit = isLit(n.id)
        const focusedThis = n.id === focus
        const ap = apOf(n.id)
        if (ap <= 0.001) continue
        const apScale = easeOutBack(ap) // pop-in scale

        // smooth hover scale (dot swells a touch on hover)
        const hsTarget = focusedThis ? 1.4 : 1.0
        const hsCur = e.hoverScales.get(n.id) ?? 1.0
        const hsNext = lerp(hsCur, hsTarget, 0.18)
        if (Math.abs(hsNext - 1.0) < 0.003 && !focusedThis) e.hoverScales.delete(n.id)
        else e.hoverScales.set(n.id, hsNext)

        const r = n.baseR * e.view.nodeScale * (n.node.orphan ? 0.7 : 1) * hsNext * apScale
        const nodeAlpha = (focus ? (lit ? 1 : 0.1) : 1) * ap
        const col = focusedThis ? acc : n.color

        // soft glow (dark bg, lit nodes) so the bright dots feel alive
        ctx.globalAlpha = nodeAlpha
        if (darkBg && lit) {
          ctx.shadowColor = col
          ctx.shadowBlur = (focusedThis ? r * 2.4 : focus ? r * 1.6 : r * 1.1)
        }
        ctx.beginPath()
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2)
        ctx.fillStyle = col
        ctx.fill()
        ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0

        // hub nodes (root / sections) get a thin halo ring so the structure reads at a glance
        if (n.node.hub && !focusedThis) {
          ctx.globalAlpha = nodeAlpha * 0.45
          ctx.lineWidth = 1.2 / cam.k
          ctx.strokeStyle = col
          ctx.beginPath()
          ctx.arc(n.x, n.y, r + 3.5 / cam.k, 0, Math.PI * 2)
          ctx.stroke()
          ctx.globalAlpha = nodeAlpha
        }

        // crisp focus ring
        if (focusedThis) {
          ctx.globalAlpha = nodeAlpha * 0.5
          ctx.lineWidth = 1.4 / cam.k
          ctx.strokeStyle = acc
          ctx.beginPath()
          ctx.arc(n.x, n.y, r + 4 / cam.k, 0, Math.PI * 2)
          ctx.stroke()
        }
      }
      ctx.globalAlpha = 1

      // ---- labels: Capacities-style frosted-glass pills below each chip ----
      // Each label sits on a rounded translucent pill (reads on any background), with
      // a gap below the icon. Greedy anti-overlap keeps dense clusters tidy; hubs and
      // the focused cluster always win.
      ctx.setTransform(e.dpr, 0, 0, e.dpr, 0, 0)
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      const lf = e.view.labelFade
      const GAP = 7, PADX = 8, PADY = 4
      const cands: Array<{
        nv: number; sx: number; top: number; w: number; h: number
        hub: boolean; lit: boolean; pr: number; text: string; font: string
      }> = []
      for (const n of e.nodes) {
        const hub = isHubKind(n.node.kind) || !!n.node.hub
        const ap = apOf(n.id)
        if (ap <= 0.02) continue
        // follow the chip: label glides down as the chip grows on hover / pops in
        const hs = e.hoverScales.get(n.id) ?? 1
        const r = n.baseR * e.view.nodeScale * hs * easeOutBack(ap)
        const thr = hub ? 0.05 : 0.38 // show item labels earlier — fewer anonymous dots
        const z = cam.k * lf
        let target: number
        if (focus) target = isLit(n.id) ? 1 : 0
        else if (lf <= 0) target = 0
        else target = clamp01((z - thr) / 0.3)

        const sx = W / 2 + cam.x + n.x * cam.k
        const nodeBottom = H / 2 + cam.y + n.y * cam.k + r * cam.k
        if (sx < -220 || sx > W + 220 || nodeBottom < -40 || nodeBottom > H + 60) target = 0

        const cur = e.labelOp.get(n.id) ?? 0
        const nv = lerp(cur, target, 0.22) * ap
        if (nv <= 0.02) { e.labelOp.delete(n.id); continue }
        e.labelOp.set(n.id, nv / (ap || 1))

        const raw = n.node.label
        const text = raw.length > 16 ? raw.slice(0, 15) + '…' : raw
        const fpx = 11 // единый размер текста для всех нод
        const font = `${hub ? '600 ' : '500 '}${fpx}px Inter, -apple-system, system-ui, sans-serif`
        ctx.font = font
        const w = ctx.measureText(text).width + PADX * 2
        const lit = !focus || isLit(n.id)
        const pr = (focus && lit ? 4 : 0) + (hub ? 2 : 0)
        // extra nudge down when focused so the label clears the enlarged chip
        cands.push({ nv, sx, top: nodeBottom + GAP + (n.id === focus ? 3 : 0), w, h: fpx + PADY * 2, hub, lit, pr, text, font })
      }

      cands.sort((a, b) => b.pr - a.pr)
      const placed: Array<{ x0: number; y0: number; x1: number; y1: number }> = []
      const MARGIN = 4 // px breathing room between pills so nothing kisses
      for (const c of cands) {
        const box = { x0: c.sx - c.w / 2 - MARGIN, y0: c.top - MARGIN, x1: c.sx + c.w / 2 + MARGIN, y1: c.top + c.h + MARGIN }
        const must = c.hub || (!!focus && c.lit)
        if (!must && placed.some((p) => box.x0 < p.x1 && box.x1 > p.x0 && box.y0 < p.y1 && box.y1 > p.y0)) continue
        placed.push(box)

        ctx.font = c.font
        ctx.globalAlpha = c.nv
        // Obsidian-style plain text with shadow for readability
        ctx.shadowColor = darkBg ? 'rgba(0,0,0,0.9)' : 'rgba(255,255,255,0.95)'
        ctx.shadowBlur = 5
        ctx.shadowOffsetY = 0
        ctx.fillStyle = c.lit && !!focus ? acc : pal.text
        ctx.fillText(c.text, c.sx, c.top + c.h / 2 + 0.5)
        ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0
      }
      ctx.globalAlpha = 1
    }

    const frame = () => {
      e.clock = typeof performance !== 'undefined' ? performance.now() : Date.now()
      if (e.sim && e.sim.alpha() > 0.0015) {
        e.sim.tick()
        // perpetual gentle wander — each node slowly circles, so the graph is always
        // subtly alive (no stagnation); collision keeps air between them
        for (const n of e.nodes) {
          if (n.fx != null) continue
          n.driftA += n.driftSpeed
          n.vx += Math.cos(n.driftA) * 0.18
          n.vy += Math.sin(n.driftA) * 0.18
        }
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
      if (e.clock - e.born < 820) e.dirty = true // keep drawing through the staggered entrance
      if (e.pulseNodes.size > 0 || e.hoverScales.size > 0) e.dirty = true
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
        const r = n.baseR * e.view.nodeScale + 5
        const dx = Math.abs(n.x - wx), dy = Math.abs(n.y - wy)
        if (dx < r && dy < r) {
          const d = dx * dx + dy * dy
          if (d < bestD) { bestD = d; best = n }
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
            ? {
                head: n.node.hub
                  ? (n.node.kind === 'root' ? 'Воркспейс' : 'Раздел')
                  : (data.kindNames[n.node.kind] ?? n.node.kind),
                label: n.node.label, sub: n.node.sub, color: n.color, clientX: ev.clientX, clientY: ev.clientY,
              }
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
            e.pulseNodes.set(drag.node.id, e.clock) // ripple on click
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
    ;(sim.force('charge') as ForceManyBody<SimNode> | undefined)?.strength((d) => -view.repel * (d.node.hub ? 2.4 : 1))
    ;(sim.force('link') as ForceLink<SimNode, SimLink> | undefined)?.distance((l) => (l.source.node.hub || l.target.node.hub ? view.linkDistance * 1.5 : view.linkDistance)).strength(view.linkForce)
    ;(sim.force('collide') as ForceCollide<SimNode> | undefined)?.radius((d) => d.baseR * view.nodeScale + 18)
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
