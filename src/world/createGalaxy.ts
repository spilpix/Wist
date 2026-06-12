// CSP-safe shader math — must be imported before pixi.
import 'pixi.js/unsafe-eval'
import { Application, Container, Graphics, Sprite, Text, Texture } from 'pixi.js'
import type { MemoryKind } from '../types/models'

/**
 * My World — a galaxy of connections (Obsidian graph, reimagined as deep space).
 * Star nodes = titles / notes / moments / journal days; filaments = real links.
 * Force-directed layout, pan/zoom, hover focuses the constellation.
 */

export const KIND_COLORS: Record<MemoryKind, number> = {
  moment: 0xa888f0,
  title: 0x4ade80,
  book: 0xf59e0b,
  note: 0x60a5fa,
  journal: 0xf472b6,
}

const W = 1200
const H = 760

export interface GalaxyNode {
  id: string
  kind: MemoryKind
  label: string
  sub?: string | null
  route: string
}

export interface GalaxyEdge {
  a: number
  b: number
  weak?: boolean
}

export interface WorldTip {
  clientX: number
  clientY: number
  color: string
  head: string
  label: string
  sub?: string | null
}

export interface GalaxyData {
  nodes: GalaxyNode[]
  edges: GalaxyEdge[]
  kindNames: Record<MemoryKind, string>
}

export interface GalaxyCallbacks {
  navigate: (to: string) => void
  tip: (t: WorldTip | null) => void
}

function seed(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return ((h >>> 0) % 10000) / 10000
}

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`

function radialTex(size: number, stops: Array<[number, string]>): Texture {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  for (const [o, col] of stops) g.addColorStop(o, col)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  return Texture.from(c)
}

function linearTex(w: number, h: number, stops: Array<[number, string]>): Texture {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')!
  const g = ctx.createLinearGradient(0, 0, 0, h)
  for (const [o, col] of stops) g.addColorStop(o, col)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
  return Texture.from(c)
}

export async function createGalaxy(host: HTMLDivElement, data: GalaxyData, cb: GalaxyCallbacks): Promise<() => void> {
  const app = new Application()
  await app.init({
    width: W,
    height: H,
    backgroundAlpha: 1,
    background: 0x07060f,
    antialias: true,
    resolution: Math.min(2, window.devicePixelRatio || 1),
    autoDensity: true,
  })
  host.appendChild(app.canvas)
  app.canvas.style.width = '100%'
  app.canvas.style.height = 'auto'
  app.canvas.style.display = 'block'
  app.canvas.style.touchAction = 'none'

  const glowSoft = radialTex(256, [[0, 'rgba(255,255,255,0.9)'], [0.3, 'rgba(255,255,255,0.32)'], [1, 'rgba(255,255,255,0)']])
  const glowHard = radialTex(128, [[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,0.9)'], [1, 'rgba(255,255,255,0)']])
  const mkGlow = (tint: number, size: number, alpha = 1, hard = false) => {
    const s = new Sprite(hard ? glowHard : glowSoft)
    s.anchor.set(0.5)
    s.tint = tint
    s.width = s.height = size
    s.alpha = alpha
    s.blendMode = 'add'
    return s
  }

  // ---------- backdrop: deep space ----------
  const bg = new Container()
  app.stage.addChild(bg)
  const skyG = new Sprite(linearTex(32, H, [[0, '#07060f'], [0.5, '#0a0918'], [1, '#0d0a1e']]))
  skyG.width = W
  skyG.height = H
  bg.addChild(skyG)

  // nebula breaths — barely-there color fields
  const nebulae: Array<{ s: Sprite; ph: number }> = [
    { s: mkGlow(0x4a3a8a, 900, 0.10), ph: 0 },
    { s: mkGlow(0x2a5a7a, 760, 0.08), ph: 2.4 },
    { s: mkGlow(0x6a3a6a, 680, 0.07), ph: 4.1 },
  ]
  nebulae[0].s.position.set(420, 300)
  nebulae[1].s.position.set(880, 480)
  nebulae[2].s.position.set(640, 180)
  for (const n of nebulae) bg.addChild(n.s)

  // far static stars (do not pan with the graph — depth)
  const farStars: Array<{ s: Sprite; ph: number }> = []
  for (let i = 0; i < 160; i++) {
    const s = mkGlow(0xcfd6ff, seed(`fs${i}`) > 0.93 ? 5 : 2.6, 0.7, true)
    s.x = seed(`fx${i}`) * W
    s.y = seed(`fy${i}`) * H
    bg.addChild(s)
    farStars.push({ s, ph: seed(`fp${i}`) * 6 })
  }

  // ---------- world (pans & zooms) ----------
  const world = new Container()
  app.stage.addChild(world)
  world.position.set(W / 2, H / 2)

  const edgesG = new Graphics()
  world.addChild(edgesG)

  // vignette on top
  const vig = new Sprite(radialTex(512, [[0, 'rgba(0,0,0,0)'], [0.7, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.45)']]))
  vig.anchor.set(0.5)
  vig.position.set(W / 2, H / 2)
  vig.width = W * 1.2
  vig.height = H * 1.2
  app.stage.addChild(vig)

  // ---------- layout state ----------
  const n = data.nodes.length
  const px = new Float32Array(n)
  const py = new Float32Array(n)
  const vx = new Float32Array(n)
  const vy = new Float32Array(n)
  const degree = new Array<number>(n).fill(0)
  for (const e of data.edges) {
    degree[e.a]++
    degree[e.b]++
  }

  // initial layout: golden-angle spiral → instantly galaxy-like
  const shuffled = data.nodes.map((_, i) => i).sort((a, b) => seed(`sh${data.nodes[a].id}`) - seed(`sh${data.nodes[b].id}`))
  shuffled.forEach((idx, order) => {
    const t = order / Math.max(1, n - 1)
    const r = 26 + 300 * Math.sqrt(t)
    const theta = order * 2.39996 + seed(data.nodes[idx].id) * 0.6
    px[idx] = Math.cos(theta) * r
    py[idx] = Math.sin(theta) * r * 0.82 // slight ellipse
  })

  const adj: number[][] = Array.from({ length: n }, () => [])
  data.edges.forEach((e) => {
    adj[e.a].push(e.b)
    adj[e.b].push(e.a)
  })

  // ---------- node sprites ----------
  let hovered = -1
  let dragIdx = -1
  const nodeC: Container[] = []
  const labels: Text[] = []
  const halos: Sprite[] = []

  const radiusOf = (i: number) =>
    (data.nodes[i].kind === 'title' || data.nodes[i].kind === 'book' ? 4.6 : 3.6) + Math.min(5, degree[i] * 1.1)

  data.nodes.forEach((node, i) => {
    const c = new Container()
    const r = radiusOf(i)
    const halo = mkGlow(KIND_COLORS[node.kind], r * 7, 0.55)
    const core = new Graphics().circle(0, 0, r).fill({ color: KIND_COLORS[node.kind] })
    core.stroke({ width: 1.2, color: 0x07060f, alpha: 0.9 })
    const hl = new Graphics().circle(-r * 0.3, -r * 0.3, r * 0.32).fill({ color: 0xffffff, alpha: 0.85 })
    c.addChild(halo, core, hl)
    halos.push(halo)

    const label = new Text({
      text: node.label.length > 26 ? node.label.slice(0, 25) + '…' : node.label,
      style: { fontFamily: 'Inter, sans-serif', fontSize: 11, fill: 0xb8bdd9 },
    })
    label.anchor.set(0.5, 0)
    label.y = r + 5
    label.alpha = 0
    c.addChild(label)
    labels.push(label)

    c.eventMode = 'static'
    c.cursor = 'pointer'
    c.on('pointerover', () => {
      hovered = i
      reheat(0.06)
    })
    c.on('pointerout', () => {
      if (hovered === i) hovered = -1
      cb.tip(null)
    })
    c.on('pointermove', (e) => {
      cb.tip({
        clientX: e.clientX,
        clientY: e.clientY,
        color: hex(KIND_COLORS[node.kind]),
        head: data.kindNames[node.kind],
        label: node.label,
        sub: node.sub,
      })
    })
    c.on('pointerdown', (e) => {
      dragIdx = i
      dragMoved = false
      e.stopPropagation()
    })
    world.addChild(c)
    nodeC.push(c)
  })

  // ---------- physics ----------
  let alpha = 1
  const reheat = (to = 0.5) => {
    alpha = Math.max(alpha, to)
  }

  function simStep() {
    if (alpha < 0.012) return
    const rep = 1300
    const spring = 0.028
    const rest = 78
    for (let i = 0; i < n; i++) {
      // centering gravity
      vx[i] -= px[i] * 0.0012 * alpha
      vy[i] -= py[i] * 0.0016 * alpha
      // repulsion (n² fine for our scale)
      for (let j = i + 1; j < n; j++) {
        let dx = px[i] - px[j]
        let dy = py[i] - py[j]
        let d2 = dx * dx + dy * dy
        if (d2 < 1) {
          dx = (seed(`${i}-${j}`) - 0.5) * 2
          dy = (seed(`${j}-${i}`) - 0.5) * 2
          d2 = 1
        }
        if (d2 > 90000) continue
        const f = (rep / d2) * alpha
        const d = Math.sqrt(d2)
        const fx = (dx / d) * f
        const fy = (dy / d) * f
        vx[i] += fx
        vy[i] += fy
        vx[j] -= fx
        vy[j] -= fy
      }
    }
    for (const e of data.edges) {
      const dx = px[e.b] - px[e.a]
      const dy = py[e.b] - py[e.a]
      const d = Math.hypot(dx, dy) || 1
      const k = spring * (e.weak ? 0.35 : 1) * (d - rest) * alpha
      const fx = (dx / d) * k
      const fy = (dy / d) * k
      vx[e.a] += fx
      vy[e.a] += fy
      vx[e.b] -= fx
      vy[e.b] -= fy
    }
    for (let i = 0; i < n; i++) {
      if (i === dragIdx) {
        vx[i] = 0
        vy[i] = 0
        continue
      }
      vx[i] *= 0.82
      vy[i] *= 0.82
      px[i] += vx[i]
      py[i] += vy[i]
    }
    alpha *= 0.985
  }

  // ---------- interaction: pan / zoom / drag ----------
  let scale = 1
  let panning = false
  let dragMoved = false
  let lastSX = 0
  let lastSY = 0

  const toScreen = (clientX: number, clientY: number) => {
    const rect = app.canvas.getBoundingClientRect()
    return { sx: ((clientX - rect.left) / rect.width) * W, sy: ((clientY - rect.top) / rect.height) * H }
  }

  app.stage.eventMode = 'static'
  app.stage.hitArea = { contains: () => true }
  app.stage.on('pointerdown', (e) => {
    panning = true
    const s = toScreen(e.clientX, e.clientY)
    lastSX = s.sx
    lastSY = s.sy
  })
  app.stage.on('pointermove', (e) => {
    const s = toScreen(e.clientX, e.clientY)
    if (dragIdx >= 0) {
      px[dragIdx] = (s.sx - world.x) / scale
      py[dragIdx] = (s.sy - world.y) / scale
      dragMoved = true
      reheat(0.25)
    } else if (panning) {
      world.x += s.sx - lastSX
      world.y += s.sy - lastSY
      bg.x += (s.sx - lastSX) * 0.06
      bg.y += (s.sy - lastSY) * 0.06
    }
    lastSX = s.sx
    lastSY = s.sy
  })
  const endPointer = () => {
    if (dragIdx >= 0 && !dragMoved) {
      cb.navigate(data.nodes[dragIdx].route) // click = navigate
    }
    dragIdx = -1
    panning = false
  }
  app.stage.on('pointerup', endPointer)
  app.stage.on('pointerupoutside', endPointer)

  const onWheel = (e: WheelEvent) => {
    e.preventDefault()
    const s = toScreen(e.clientX, e.clientY)
    const factor = Math.pow(1.0016, -e.deltaY)
    const next = Math.min(2.6, Math.max(0.45, scale * factor))
    const k = next / scale
    world.x = s.sx - (s.sx - world.x) * k
    world.y = s.sy - (s.sy - world.y) * k
    scale = next
    world.scale.set(scale)
  }
  app.canvas.addEventListener('wheel', onWheel, { passive: false })

  // ---------- render loop ----------
  let elapsed = 0
  const isNeighbor = (i: number) => hovered === i || adj[hovered]?.includes(i)

  const tick = () => {
    elapsed += app.ticker.deltaMS
    simStep()

    // backdrop life
    for (const f of farStars) f.s.alpha = 0.22 + 0.5 * (0.5 + 0.5 * Math.sin(elapsed * 0.001 + f.ph))
    nebulae.forEach((nb, i) => {
      nb.s.alpha = (i === 0 ? 0.10 : i === 1 ? 0.08 : 0.07) * (0.8 + 0.25 * Math.sin(elapsed * 0.00018 + nb.ph))
    })

    // edges
    edgesG.clear()
    const focus = hovered >= 0
    for (const e of data.edges) {
      const lit = focus && (e.a === hovered || e.b === hovered)
      const dim = focus && !lit
      edgesG.moveTo(px[e.a], py[e.a]).lineTo(px[e.b], py[e.b])
      edgesG.stroke({
        width: lit ? 1.6 / scale : (e.weak ? 0.7 : 1) / scale,
        color: lit ? 0xdfe4ff : 0x8a8fb8,
        alpha: lit ? 0.85 : dim ? 0.05 : e.weak ? 0.10 : 0.16,
      })
    }

    // nodes
    const labelZoom = Math.min(1, Math.max(0, (scale - 1.15) * 1.8))
    for (let i = 0; i < n; i++) {
      const c = nodeC[i]
      c.position.set(px[i], py[i])
      const lit = focus && isNeighbor(i)
      c.alpha = focus ? (lit ? 1 : 0.16) : 1
      halos[i].alpha = (focus && lit ? 0.95 : 0.5) + 0.12 * Math.sin(elapsed * 0.0012 + i)
      const lblTarget = hovered === i ? 1 : lit ? Math.max(0.85, labelZoom) : labelZoom * 0.8
      labels[i].alpha += (lblTarget - labels[i].alpha) * 0.18
      // keep labels readable while zooming
      labels[i].scale.set(1 / Math.max(0.7, scale))
    }
  }
  app.ticker.add(tick)

  return () => {
    app.canvas.removeEventListener('wheel', onWheel)
    app.destroy(true, { children: true, texture: true })
  }
}
