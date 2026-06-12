// CSP-safe shader math — must be imported before pixi.
import 'pixi.js/unsafe-eval'
import { Application, Container, Graphics, Sprite, Text, Texture } from 'pixi.js'
import type { MemoryKind } from '../types/models'

/**
 * My World — an Obsidian-style connection graph drawn as a quiet galaxy.
 * Theme-aware (light/dark), pre-settled force layout, Obsidian controls:
 * node size / link width / link distance / repel / label fade — all live.
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

export interface GalaxyOptions {
  light: boolean
  nodeScale: number // 0.5..2
  linkWidth: number // 0.5..2.5
  linkDistance: number // 40..200
  repel: number // 300..3000
  labelFade: number // 0..2 (2 = always show)
}

export const DEFAULT_GALAXY_OPTIONS: Omit<GalaxyOptions, 'light'> = {
  nodeScale: 1,
  linkWidth: 1,
  linkDistance: 85,
  repel: 1300,
  labelFade: 0.9,
}

export interface GalaxyHandle {
  set: (patch: Partial<GalaxyOptions>) => void
  destroy: () => void
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

export async function createGalaxy(
  host: HTMLDivElement,
  data: GalaxyData,
  cb: GalaxyCallbacks,
  initial: GalaxyOptions
): Promise<GalaxyHandle> {
  const opts: GalaxyOptions = { ...initial }

  const P = opts.light
    ? {
        bgTop: '#f7f7fb',
        bgBot: '#ecedf4',
        dust: 0xb9bdcf,
        edge: 0x7d8298,
        edgeLit: 0x3d4258,
        label: 0x4a4f63,
        coreStroke: 0xffffff,
        vignette: 'rgba(40,40,80,0.10)',
        haloBlend: 'normal' as const,
        haloAlpha: 0.32,
        edgeAlpha: 0.32,
        edgeWeakAlpha: 0.2,
      }
    : {
        bgTop: '#0a0916',
        bgBot: '#100d22',
        dust: 0xcfd6ff,
        edge: 0x8a8fb8,
        edgeLit: 0xdfe4ff,
        label: 0xb8bdd9,
        coreStroke: 0x0a0916,
        vignette: 'rgba(0,0,0,0.4)',
        haloBlend: 'add' as const,
        haloAlpha: 0.55,
        edgeAlpha: 0.18,
        edgeWeakAlpha: 0.1,
      }

  const app = new Application()
  await app.init({
    width: W,
    height: H,
    backgroundAlpha: 0,
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

  // ---------- backdrop ----------
  const bg = new Container()
  app.stage.addChild(bg)
  const sky = new Sprite(linearTex(32, H, [[0, P.bgTop], [1, P.bgBot]]))
  sky.width = W
  sky.height = H
  bg.addChild(sky)

  const dust: Array<{ s: Sprite; ph: number }> = []
  for (let i = 0; i < 130; i++) {
    const s = new Sprite(glowHard)
    s.anchor.set(0.5)
    s.tint = P.dust
    s.width = s.height = seed(`fs${i}`) > 0.92 ? 4.5 : 2.4
    s.alpha = opts.light ? 0.35 : 0.6
    if (!opts.light) s.blendMode = 'add'
    s.x = seed(`fx${i}`) * W
    s.y = seed(`fy${i}`) * H
    bg.addChild(s)
    dust.push({ s, ph: seed(`fp${i}`) * 6 })
  }

  if (!opts.light) {
    const nebTints = [0x4a3a8a, 0x2a5a7a]
    nebTints.forEach((tint, i) => {
      const nb = new Sprite(glowSoft)
      nb.anchor.set(0.5)
      nb.tint = tint
      nb.width = nb.height = 820 - i * 160
      nb.alpha = 0.08
      nb.blendMode = 'add'
      nb.position.set(i === 0 ? 420 : 860, i === 0 ? 300 : 470)
      bg.addChild(nb)
    })
  }

  // ---------- world ----------
  const world = new Container()
  app.stage.addChild(world)
  world.position.set(W / 2, H / 2)

  const edgesG = new Graphics()
  world.addChild(edgesG)

  const vig = new Sprite(radialTex(512, [[0, 'rgba(0,0,0,0)'], [0.72, 'rgba(0,0,0,0)'], [1, P.vignette]]))
  vig.anchor.set(0.5)
  vig.position.set(W / 2, H / 2)
  vig.width = W * 1.2
  vig.height = H * 1.2
  app.stage.addChild(vig)

  // ---------- graph state ----------
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
  const adj: number[][] = Array.from({ length: n }, () => [])
  data.edges.forEach((e) => {
    adj[e.a].push(e.b)
    adj[e.b].push(e.a)
  })

  // compact spiral sized to the graph — small graphs stay cozy
  const maxR = Math.min(330, 26 + 26 * Math.sqrt(n))
  const order = data.nodes.map((_, i) => i).sort((a, b) => seed(`sh${data.nodes[a].id}`) - seed(`sh${data.nodes[b].id}`))
  order.forEach((idx, k) => {
    const t = n === 1 ? 0 : k / (n - 1)
    const r = 14 + maxR * Math.sqrt(t)
    const theta = k * 2.39996 + seed(data.nodes[idx].id) * 0.6
    px[idx] = Math.cos(theta) * r
    py[idx] = Math.sin(theta) * r * 0.85
  })

  // ---------- sprites ----------
  let hovered = -1
  let dragIdx = -1
  const nodeC: Container[] = []
  const labels: Text[] = []
  const halos: Sprite[] = []
  const cores: Graphics[] = []
  const baseR = (i: number) =>
    (data.nodes[i].kind === 'title' || data.nodes[i].kind === 'book' ? 4.4 : 3.5) + Math.min(5, degree[i] * 1.05)

  data.nodes.forEach((node, i) => {
    const c = new Container()
    const halo = new Sprite(glowSoft)
    halo.anchor.set(0.5)
    halo.tint = KIND_COLORS[node.kind]
    halo.blendMode = P.haloBlend
    halo.alpha = P.haloAlpha
    const core = new Graphics()
    const hl = new Graphics()
    c.addChild(halo, core, hl)
    halos.push(halo)
    cores.push(core)

    const label = new Text({
      text: node.label.length > 26 ? node.label.slice(0, 25) + '…' : node.label,
      style: { fontFamily: 'Inter, sans-serif', fontSize: 11, fill: P.label },
    })
    label.anchor.set(0.5, 0)
    label.alpha = 0
    c.addChild(label)
    labels.push(label)

    c.eventMode = 'static'
    c.cursor = 'pointer'
    c.on('pointerover', () => (hovered = i))
    c.on('pointerout', () => {
      if (hovered === i) hovered = -1
      cb.tip(null)
    })
    c.on('pointermove', (e) =>
      cb.tip({
        clientX: e.clientX,
        clientY: e.clientY,
        color: hex(KIND_COLORS[node.kind]),
        head: data.kindNames[node.kind],
        label: node.label,
        sub: node.sub,
      })
    )
    c.on('pointerdown', (e) => {
      dragIdx = i
      dragMoved = false
      e.stopPropagation()
    })
    world.addChild(c)
    nodeC.push(c)
  })

  // (re)draw node bodies — called when nodeScale changes
  let drawnScale = -1
  const redrawNodes = () => {
    if (drawnScale === opts.nodeScale) return
    drawnScale = opts.nodeScale
    for (let i = 0; i < n; i++) {
      const r = baseR(i) * opts.nodeScale
      cores[i].clear()
      cores[i].circle(0, 0, r).fill({ color: KIND_COLORS[data.nodes[i].kind] })
      cores[i].stroke({ width: 1.2, color: P.coreStroke, alpha: 0.9 })
      halos[i].width = halos[i].height = r * 7
      labels[i].y = r + 5
    }
  }
  redrawNodes()

  // ---------- physics ----------
  let alpha = 1
  const reheat = (to = 0.4) => (alpha = Math.max(alpha, to))

  function simStep() {
    if (alpha < 0.01) return
    for (let i = 0; i < n; i++) {
      vx[i] -= px[i] * 0.0014 * alpha
      vy[i] -= py[i] * 0.0019 * alpha
      for (let j = i + 1; j < n; j++) {
        let dx = px[i] - px[j]
        let dy = py[i] - py[j]
        let d2 = dx * dx + dy * dy
        if (d2 < 1) {
          dx = (seed(`${i}-${j}`) - 0.5) * 2
          dy = (seed(`${j}-${i}`) - 0.5) * 2
          d2 = 1
        }
        if (d2 > 120000) continue
        const f = (opts.repel / d2) * alpha
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
      const k = 0.028 * (e.weak ? 0.35 : 1) * (d - opts.linkDistance) * alpha
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
      vx[i] = Math.max(-14, Math.min(14, vx[i] * 0.8))
      vy[i] = Math.max(-14, Math.min(14, vy[i] * 0.8))
      px[i] += vx[i]
      py[i] += vy[i]
    }
    alpha *= 0.982
  }

  // settle BEFORE the first frame — the graph appears already laid out
  for (let k = 0; k < 220 && alpha > 0.01; k++) simStep()
  alpha = 0

  // ---------- interaction ----------
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
      reheat(0.22)
    } else if (panning) {
      world.x += s.sx - lastSX
      world.y += s.sy - lastSY
      bg.x += (s.sx - lastSX) * 0.05
      bg.y += (s.sy - lastSY) * 0.05
    }
    lastSX = s.sx
    lastSY = s.sy
  })
  const endPointer = () => {
    if (dragIdx >= 0 && !dragMoved) cb.navigate(data.nodes[dragIdx].route)
    dragIdx = -1
    panning = false
  }
  app.stage.on('pointerup', endPointer)
  app.stage.on('pointerupoutside', endPointer)

  const onWheel = (e: WheelEvent) => {
    e.preventDefault()
    const s = toScreen(e.clientX, e.clientY)
    const factor = Math.pow(1.0016, -e.deltaY)
    const next = Math.min(2.8, Math.max(0.4, scale * factor))
    const k = next / scale
    world.x = s.sx - (s.sx - world.x) * k
    world.y = s.sy - (s.sy - world.y) * k
    scale = next
    world.scale.set(scale)
  }
  app.canvas.addEventListener('wheel', onWheel, { passive: false })

  // ---------- render ----------
  let elapsed = 0
  const isNeighbor = (i: number) => hovered === i || adj[hovered]?.includes(i)

  const tick = () => {
    elapsed += app.ticker.deltaMS
    simStep()
    redrawNodes()

    for (const f of dust) f.s.alpha = (opts.light ? 0.22 : 0.3) + (opts.light ? 0.2 : 0.4) * (0.5 + 0.5 * Math.sin(elapsed * 0.0009 + f.ph))

    edgesG.clear()
    const focus = hovered >= 0
    for (const e of data.edges) {
      const lit = focus && (e.a === hovered || e.b === hovered)
      const dim = focus && !lit
      edgesG.moveTo(px[e.a], py[e.a]).lineTo(px[e.b], py[e.b])
      edgesG.stroke({
        width: ((lit ? 1.7 : e.weak ? 0.7 : 1) * opts.linkWidth) / scale,
        color: lit ? P.edgeLit : P.edge,
        alpha: lit ? 0.9 : dim ? 0.05 : e.weak ? P.edgeWeakAlpha : P.edgeAlpha,
      })
    }

    const labelBase = Math.min(1, Math.max(0, (scale - (1.8 - opts.labelFade)) * 2))
    for (let i = 0; i < n; i++) {
      const c = nodeC[i]
      c.position.set(px[i], py[i])
      const lit = focus && isNeighbor(i)
      c.alpha = focus ? (lit ? 1 : opts.light ? 0.22 : 0.16) : 1
      halos[i].alpha = (focus && lit ? Math.min(1, P.haloAlpha * 1.8) : P.haloAlpha) + 0.06 * Math.sin(elapsed * 0.0012 + i)
      const target = hovered === i ? 1 : lit ? Math.max(0.85, labelBase) : labelBase * 0.85
      labels[i].alpha += (target - labels[i].alpha) * 0.18
      labels[i].scale.set(1 / Math.max(0.7, scale))
    }
  }
  app.ticker.add(tick)

  return {
    set: (patch) => {
      const physics = patch.repel !== undefined || patch.linkDistance !== undefined
      Object.assign(opts, patch)
      if (physics) reheat(0.5)
    },
    destroy: () => {
      app.canvas.removeEventListener('wheel', onWheel)
      app.destroy(true, { children: true, texture: true })
    },
  }
}
