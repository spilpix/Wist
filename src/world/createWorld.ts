// CSP-safe shader math: the renderer forbids eval, this swaps Pixi's
// new Function() codegen for a precompiled fallback. Must come first.
import 'pixi.js/unsafe-eval'
import {
  Application,
  BlurFilter,
  Container,
  Graphics,
  NoiseFilter,
  Sprite,
  Text,
  Texture,
  Assets,
} from 'pixi.js'
import type { MemoryEvent, MemoryKind } from '../types/models'

/**
 * The World — cinematic WebGL scene (Ori-grade look):
 * letterbox framing, intro zoom, color grade, film grain, depth of field,
 * layered parallax, luminous spirit tree with glowing canopy, a little
 * spirit companion, particles (dust, petals, fireflies), shooting stars.
 * Painted PNG layers from %APPDATA%/Wist/world override procedural art.
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

export interface WorldTip {
  clientX: number
  clientY: number
  color: string
  head: string
  label: string
  sub?: string | null
}

export interface WorldData {
  events: MemoryEvent[]
  months: Array<{ key: string; label: string }>
  stats: { titles: number; notes: number; openTasks: number; doneTasks: number; streak: number; moments: number }
  assets: Partial<Record<'sky' | 'hillsFar' | 'hillsNear' | 'tree' | 'foreground', string>>
  zoneLabels: { library: string; notes: string; journal: string; tasks: string; moments: string; tasksSub: string; journalSub: string }
  kindNames: Record<MemoryKind, string>
  dateOf: (iso: string) => string
}

export interface WorldCallbacks {
  navigate: (to: string) => void
  tip: (t: WorldTip | null) => void
}

function seed(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return ((h >>> 0) % 10000) / 10000
}

type Pt = { x: number; y: number }
const bez = (p0: Pt, p1: Pt, p2: Pt, t: number): Pt => ({
  x: (1 - t) ** 2 * p0.x + 2 * (1 - t) * t * p1.x + t ** 2 * p2.x,
  y: (1 - t) ** 2 * p0.y + 2 * (1 - t) * t * p1.y + t ** 2 * p2.y,
})
const bezN = (p0: Pt, p1: Pt, p2: Pt, t: number): Pt => {
  const dx = 2 * (1 - t) * (p1.x - p0.x) + 2 * t * (p2.x - p1.x)
  const dy = 2 * (1 - t) * (p1.y - p0.y) + 2 * t * (p2.y - p1.y)
  const len = Math.hypot(dx, dy) || 1
  return { x: -dy / len, y: dx / len }
}

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`

// ---------- canvas-painted textures (uploaded to GPU once) ----------

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

const loadTex = (src: string) => Assets.load({ src, loadParser: 'loadTextures' })

export async function createWorld(host: HTMLDivElement, data: WorldData, cb: WorldCallbacks): Promise<() => void> {
  const app = new Application()
  await app.init({
    width: W,
    height: H,
    backgroundAlpha: 1,
    background: 0x06051a,
    antialias: true,
    resolution: Math.min(2, window.devicePixelRatio || 1),
    autoDensity: true,
  })
  host.appendChild(app.canvas)
  app.canvas.style.width = '100%'
  app.canvas.style.height = 'auto'
  app.canvas.style.display = 'block'

  const glowSoft = radialTex(256, [[0, 'rgba(255,255,255,0.85)'], [0.35, 'rgba(255,255,255,0.28)'], [1, 'rgba(255,255,255,0)']])
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

  // camera (intro zoom + idle drift) holds the parallax layers
  const camera = new Container()
  camera.position.set(W / 2, H / 2)
  camera.pivot.set(W / 2, H / 2)
  app.stage.addChild(camera)

  const Lsky = new Container()
  const Lfar = new Container()
  const Lmid = new Container()
  const Ltree = new Container()
  const Lfront = new Container()
  const Lfx = new Container()
  camera.addChild(Lsky, Lfar, Lmid, Ltree, Lfront, Lfx)

  // depth of field: far layer softly out of focus
  Lfar.filters = [new BlurFilter({ strength: 2.5 })]

  const animated: Array<(t: number, dt: number) => void> = []

  // ---------- sky ----------
  if (data.assets.sky) {
    const s = new Sprite(await loadTex(data.assets.sky))
    s.width = W
    s.height = H
    Lsky.addChild(s)
  } else {
    const sky = new Sprite(linearTex(64, H, [[0, '#05041a'], [0.4, '#100c30'], [0.75, '#2a1f5c'], [1, '#473573']]))
    sky.width = W
    sky.height = H
    Lsky.addChild(sky)
  }

  // stars
  for (let i = 0; i < 120; i++) {
    const star = mkGlow(0xdfe6ff, seed(`s${i}`) > 0.9 ? 7 : 4, 0.8, true)
    star.x = 20 + seed(`sx${i}`) * (W - 40)
    star.y = 14 + seed(`sy${i}`) * 350
    const ph = seed(`sp${i}`) * Math.PI * 2
    Lsky.addChild(star)
    animated.push((t) => {
      star.alpha = 0.2 + 0.6 * (0.5 + 0.5 * Math.sin(t * 0.0011 + ph))
    })
  }

  // shooting star — crosses the sky every ~9s
  const shoot = new Sprite(linearTex(4, 64, [[0, 'rgba(223,230,255,0)'], [1, 'rgba(223,230,255,0.95)']]))
  shoot.anchor.set(0.5)
  shoot.width = 3
  shoot.height = 90
  shoot.rotation = Math.PI * 0.72
  shoot.blendMode = 'add'
  shoot.alpha = 0
  Lsky.addChild(shoot)
  animated.push((t) => {
    const cycle = (t % 9000) / 9000
    if (cycle < 0.13) {
      const k = cycle / 0.13
      shoot.x = 220 + k * 520
      shoot.y = 60 + k * 150
      shoot.alpha = Math.sin(k * Math.PI) * 0.9
    } else shoot.alpha = 0
  })

  // aurora ribbons
  const auroraTex = linearTex(8, 90, [[0, 'rgba(70,227,192,0)'], [0.5, 'rgba(70,227,192,0.45)'], [1, 'rgba(138,111,240,0)']])
  for (let i = 0; i < 3; i++) {
    const a = new Sprite(auroraTex)
    a.width = 780 + i * 140
    a.height = 110 - i * 18
    a.anchor.set(0.5)
    a.x = 520 + i * 110
    a.y = 120 + i * 50
    a.rotation = -0.06 + i * 0.04
    a.blendMode = 'add'
    a.filters = [new BlurFilter({ strength: 14 })]
    Lsky.addChild(a)
    animated.push((t) => {
      a.x = 520 + i * 110 + Math.sin(t * 0.00018 + i * 1.7) * 36
      a.alpha = 0.5 + 0.35 * Math.sin(t * 0.0003 + i)
    })
  }

  // moon + god rays
  const moonHalo = mkGlow(0xcdd8ff, 340, 0.85)
  moonHalo.x = 956
  moonHalo.y = 124
  const moon = new Graphics().circle(956, 124, 30).fill({ color: 0xeef2ff })
  Lsky.addChild(moonHalo, moon)
  const rayTex = linearTex(8, 64, [[0, 'rgba(205,216,255,0.16)'], [1, 'rgba(205,216,255,0)']])
  for (let i = 0; i < 3; i++) {
    const ray = new Sprite(rayTex)
    ray.anchor.set(0.5, 0)
    ray.width = 120 + i * 70
    ray.height = 560 + i * 40
    ray.x = 930 + i * 26
    ray.y = 150
    ray.rotation = 0.42 + i * 0.1
    ray.blendMode = 'add'
    Lsky.addChild(ray)
    animated.push((t) => (ray.alpha = 0.35 + 0.3 * Math.sin(t * 0.00045 + i * 1.2)))
  }
  animated.push((t) => (moonHalo.alpha = 0.7 + 0.18 * Math.sin(t * 0.0006)))

  // ---------- hills ----------
  const hill = (pts: Array<[number, number]>, color: number, alpha = 1) => {
    const g = new Graphics()
    g.moveTo(pts[0][0], pts[0][1])
    for (let i = 1; i < pts.length - 1; i += 2) g.quadraticCurveTo(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1])
    g.lineTo(W, H).lineTo(0, H).closePath()
    g.fill({ color, alpha })
    return g
  }

  if (data.assets.hillsFar) {
    const s = new Sprite(await loadTex(data.assets.hillsFar))
    s.width = W
    s.height = H
    Lfar.addChild(s)
  } else {
    Lfar.addChild(hill([[0, 470], [200, 380], [400, 450], [640, 400], [880, 455], [1050, 415], [1200, 440]], 0x261c52, 0.9))
    // distant pine silhouettes on the ridge
    for (let i = 0; i < 14; i++) {
      const px = 60 + i * 86 + seed(`pn${i}`) * 40
      const py = 430 + Math.sin(i * 0.8) * 22
      const ph = 26 + seed(`pnh${i}`) * 26
      const pine = new Graphics().moveTo(px - 7, py).lineTo(px, py - ph).lineTo(px + 7, py).closePath().fill({ color: 0x1d1545, alpha: 0.9 })
      Lfar.addChild(pine)
    }
  }

  if (data.assets.hillsNear) {
    const s = new Sprite(await loadTex(data.assets.hillsNear))
    s.width = W
    s.height = H
    Lmid.addChild(s)
  } else {
    Lmid.addChild(hill([[0, 540], [260, 450], [520, 525], [800, 480], [1000, 525], [1100, 500], [1200, 515]], 0x1b1340))
    Lmid.addChild(hill([[0, 620], [300, 560], [620, 600], [900, 575], [1200, 595]], 0x130d30))
  }

  const mist = mkGlow(0x8d9bff, 800, 0.15)
  mist.x = 600
  mist.y = 595
  mist.scale.y *= 0.2
  Lmid.addChild(mist)
  animated.push((t) => (mist.x = 600 + Math.sin(t * 0.00012) * 44))

  // ground
  Lfront.addChild(hill([[0, 642], [300, 606], [620, 630], [900, 612], [1200, 626]], 0x0e0926))

  // ---------- interaction helpers ----------
  const hot = (c: Container, onTap: () => void, tipData: () => Omit<WorldTip, 'clientX' | 'clientY'>) => {
    c.eventMode = 'static'
    c.cursor = 'pointer'
    c.on('pointertap', onTap)
    c.on('pointermove', (e) => cb.tip({ clientX: e.clientX, clientY: e.clientY, ...tipData() }))
    c.on('pointerover', () => animateScale(c, 1.04))
    c.on('pointerout', () => {
      animateScale(c, 1)
      cb.tip(null)
    })
  }
  const animateScale = (c: Container, target: number) => {
    const from = c.scale.x
    const start = performance.now()
    const step = () => {
      const k = Math.min(1, (performance.now() - start) / 140)
      c.scale.set(from + (target - from) * k)
      if (k < 1) requestAnimationFrame(step)
    }
    step()
  }

  // ---------- landmarks ----------

  // Story Forest (library)
  const forest = new Container()
  forest.pivot.set(210, 615)
  forest.position.set(210, 615)
  for (let i = 0; i < 7; i++) {
    const fx = 86 + i * 42 + seed(`f${i}`) * 16
    const fh = 58 + seed(`fh${i}`) * 46
    const fy = 616 - seed(`fy${i}`) * 10
    forest.addChild(new Graphics().moveTo(fx, fy).lineTo(fx, fy - fh * 0.45).stroke({ width: 5, color: 0x231b4e, cap: 'round' }))
    forest.addChild(new Graphics().ellipse(fx, fy - fh * 0.66, 17 + seed(`fr${i}`) * 10, fh * 0.4).fill({ color: i % 2 ? 0x241b52 : 0x342a70 }))
    forest.addChild(new Graphics().ellipse(fx - 6, fy - fh * 0.58, 9, fh * 0.22).fill({ color: 0x3d3180, alpha: 0.6 }))
    if (i % 2 === 0) {
      const berry = mkGlow(0x4ade80, 16, 0.9)
      berry.x = fx + 7
      berry.y = fy - fh * 0.66
      forest.addChild(berry)
      const ph = i * 1.3
      animated.push((t) => (berry.alpha = 0.35 + 0.55 * (0.5 + 0.5 * Math.sin(t * 0.0014 + ph))))
    }
  }
  hot(forest, () => cb.navigate('/library'), () => ({ color: hex(KIND_COLORS.title), head: data.zoneLabels.library, label: String(data.stats.titles) }))
  Lfront.addChild(forest)

  // Lake of Days (journal) with ripple rings
  const lake = new Container()
  lake.pivot.set(1010, 688)
  lake.position.set(1010, 688)
  lake.addChild(new Graphics().ellipse(1010, 688, 158, 28).fill({ color: 0x1d2458 }))
  lake.addChild(new Graphics().ellipse(1010, 688, 158, 28).stroke({ width: 1.5, color: 0x9fb4ff, alpha: 0.3 }))
  const moonRefl = mkGlow(0xbcd0ff, 120, 0.5)
  moonRefl.x = 1052
  moonRefl.y = 684
  moonRefl.scale.y *= 0.22
  lake.addChild(moonRefl)
  for (let i = 0; i < 3; i++) {
    const shine = new Sprite(linearTex(64, 4, [[0, 'rgba(188,208,255,0)'], [0.5, 'rgba(188,208,255,0.8)'], [1, 'rgba(188,208,255,0)']]))
    shine.anchor.set(0.5)
    shine.x = 960 + i * 46
    shine.y = 682 + i * 5
    shine.width = 60 - i * 12
    shine.height = 2.4
    shine.blendMode = 'add'
    lake.addChild(shine)
    animated.push((t) => (shine.alpha = 0.3 + 0.6 * (0.5 + 0.5 * Math.sin(t * 0.0012 + i * 2.1))))
  }
  // expanding ripple ring
  const ripple = new Graphics()
  lake.addChild(ripple)
  animated.push((t) => {
    const k = (t % 5200) / 5200
    ripple.clear()
    ripple.ellipse(1000 + 30 * Math.sin(Math.floor(t / 5200)), 690, 18 + k * 70, (18 + k * 70) * 0.18)
    ripple.stroke({ width: 1.4, color: 0x9fb4ff, alpha: (1 - k) * 0.5 })
  })
  hot(lake, () => cb.navigate('/journal'), () => ({ color: hex(KIND_COLORS.journal), head: data.zoneLabels.journal, label: data.zoneLabels.journalSub }))
  Lfront.addChild(lake)

  // Garden of Thoughts (notes)
  const garden = new Container()
  garden.pivot.set(820, 640)
  garden.position.set(820, 640)
  for (let i = 0; i < 9; i++) {
    const gx = 758 + i * 15 + seed(`g${i}`) * 9
    const gy = 648 - seed(`gy${i}`) * 8
    const gh = 20 + seed(`gh${i}`) * 18
    garden.addChild(new Graphics().moveTo(gx, gy).quadraticCurveTo(gx + 3, gy - gh * 0.6, gx + 1, gy - gh).stroke({ width: 1.8, color: 0x3a4274, cap: 'round' }))
    const head = mkGlow(0x60a5fa, 18 + seed(`ghd${i}`) * 10, 0.95)
    head.x = gx + 1
    head.y = gy - gh - 2
    garden.addChild(head)
    const ph = seed(`gp${i}`) * 6
    animated.push((t) => {
      head.alpha = 0.5 + 0.45 * (0.5 + 0.5 * Math.sin(t * 0.0016 + ph))
      head.y = gy - gh - 2 + Math.sin(t * 0.0009 + ph) * 1.6
    })
  }
  hot(garden, () => cb.navigate('/notes'), () => ({ color: hex(KIND_COLORS.note), head: data.zoneLabels.notes, label: String(data.stats.notes) }))
  Lfront.addChild(garden)

  // Path of Deeds (tasks)
  const path = new Container()
  path.pivot.set(520, 700)
  path.position.set(520, 700)
  const pathG = new Graphics()
  const p0 = { x: 410, y: 756 }
  const p1 = { x: 500, y: 692 }
  const p2 = { x: 608, y: 650 }
  for (let i = 0; i <= 16; i++) {
    const pt = bez(p0, p1, p2, i / 16)
    pathG.circle(pt.x, pt.y, 2.4 - (i / 16) * 1.1).fill({ color: 0x4a3f7e, alpha: 0.9 })
  }
  path.addChild(pathG)
  const lanternCount = 4
  const totalTasks = data.stats.openTasks + data.stats.doneTasks
  const lit = totalTasks > 0 ? Math.round((data.stats.doneTasks / totalTasks) * lanternCount) : 0
  for (let i = 0; i < lanternCount; i++) {
    const lp = bez(p0, p1, p2, 0.16 + i * 0.25)
    path.addChild(new Graphics().moveTo(lp.x, lp.y).lineTo(lp.x, lp.y - 27).stroke({ width: 2.5, color: 0x231b4e }))
    const isLit = i < lit
    path.addChild(new Graphics().circle(lp.x, lp.y - 31, 4).fill({ color: isLit ? 0xffd27d : 0x4a4376 }))
    if (isLit) {
      const halo = mkGlow(0xffc66b, 46, 0.85)
      halo.x = lp.x
      halo.y = lp.y - 31
      path.addChild(halo)
      const ph = i * 0.9
      animated.push((t) => (halo.alpha = 0.5 + 0.4 * (0.5 + 0.5 * Math.sin(t * 0.0021 + ph))))
    }
  }
  hot(path, () => cb.navigate('/tasks'), () => ({ color: '#ffd27d', head: data.zoneLabels.tasks, label: data.zoneLabels.tasksSub }))
  Lfront.addChild(path)

  // glowing mushrooms + rune stones (set dressing)
  for (let i = 0; i < 3; i++) {
    const mx = 330 + i * 26 + seed(`m${i}`) * 12
    const my = 700 + seed(`my${i}`) * 24
    const mh = 10 + seed(`mh${i}`) * 8
    Lfront.addChild(new Graphics().moveTo(mx, my).lineTo(mx, my - mh).stroke({ width: 2.5, color: 0x9aa4d8, cap: 'round' }))
    Lfront.addChild(new Graphics().ellipse(mx, my - mh, 7, 4).fill({ color: 0x7fe3d2 }))
    const mg = mkGlow(0x7fe3d2, 26, 0.8)
    mg.x = mx
    mg.y = my - mh
    Lfront.addChild(mg)
    const ph = i * 2
    animated.push((t) => (mg.alpha = 0.4 + 0.4 * (0.5 + 0.5 * Math.sin(t * 0.0018 + ph))))
  }
  const rock = new Graphics()
  rock.ellipse(760, 666, 26, 14).fill({ color: 0x18123a })
  rock.ellipse(795, 672, 16, 9).fill({ color: 0x140f33 })
  Lfront.addChild(rock)
  for (let i = 0; i < 3; i++) {
    const rg = mkGlow(0xa888f0, 10, 0.9, true)
    rg.x = 750 + i * 10
    rg.y = 662 + (i % 2) * 5
    Lfront.addChild(rg)
    animated.push((t) => (rg.alpha = 0.3 + 0.6 * (0.5 + 0.5 * Math.sin(t * 0.002 + i * 2.2))))
  }

  // grass
  const grass = new Graphics()
  for (let i = 0; i < 80; i++) {
    const gx = 14 + i * 15 + seed(`gr${i}`) * 10
    const gy = 700 + seed(`gry${i}`) * 48
    const gh = 7 + seed(`grh${i}`) * 14
    grass.moveTo(gx, gy).lineTo(gx + (seed(`grd${i}`) - 0.5) * 7, gy - gh).stroke({ width: 1.6, color: 0x1d1644, cap: 'round' })
  }
  Lfront.addChild(grass)

  // ---------- Spirit Tree (detailed model) ----------
  const treeC = new Container()
  Ltree.addChild(treeC)

  const crownHalo = mkGlow(0xcfe0ff, 520, 0.5)
  crownHalo.x = 600
  crownHalo.y = 250
  treeC.addChild(crownHalo)
  animated.push((t) => (crownHalo.alpha = 0.36 + 0.16 * Math.sin(t * 0.0005)))

  // ground contact light
  const groundGlow = mkGlow(0x9fb4ff, 300, 0.35)
  groundGlow.x = 600
  groundGlow.y = 668
  groundGlow.scale.y *= 0.18
  treeC.addChild(groundGlow)

  if (data.assets.tree) {
    const s = new Sprite(await loadTex(data.assets.tree))
    s.width = W
    s.height = H
    treeC.addChild(s)
  } else {
    const drawTrunk = (g: Graphics) => {
      g.moveTo(556, 668)
      g.bezierCurveTo(572, 592, 580, 524, 585, 458)
      g.bezierCurveTo(589, 392, 583, 320, 595, 246)
      g.bezierCurveTo(597, 224, 600, 206, 601, 192)
      g.bezierCurveTo(603, 208, 607, 232, 610, 254)
      g.bezierCurveTo(621, 334, 616, 410, 622, 480)
      g.bezierCurveTo(628, 554, 640, 614, 654, 668)
      g.closePath()
    }
    // bloom body
    const glowTrunk = new Graphics()
    drawTrunk(glowTrunk)
    glowTrunk.fill({ color: 0x9fb4ff, alpha: 0.85 })
    glowTrunk.filters = [new BlurFilter({ strength: 20 })]
    glowTrunk.blendMode = 'add'
    treeC.addChild(glowTrunk)

    // roots spreading over the ground
    const roots = new Graphics()
    roots.moveTo(566, 660).bezierCurveTo(534, 668, 498, 676, 452, 672)
    roots.moveTo(580, 666).bezierCurveTo(560, 676, 540, 682, 512, 684)
    roots.moveTo(640, 660).bezierCurveTo(672, 668, 706, 676, 750, 671)
    roots.moveTo(626, 666).bezierCurveTo(648, 678, 668, 683, 696, 685)
    roots.stroke({ width: 9, color: 0xb9c4f2, cap: 'round' })
    treeC.addChild(roots)

    const trunk = new Graphics()
    drawTrunk(trunk)
    trunk.fill({ color: 0xe9efff })
    treeC.addChild(trunk)

    // shade + rim light
    const shade = new Graphics()
    shade.moveTo(556, 668)
    shade.bezierCurveTo(572, 592, 580, 524, 585, 458)
    shade.bezierCurveTo(589, 392, 585, 328, 595, 250)
    shade.bezierCurveTo(589, 330, 587, 420, 591, 500)
    shade.bezierCurveTo(594, 570, 587, 632, 579, 668)
    shade.closePath()
    shade.fill({ color: 0xaab4e8, alpha: 0.6 })
    treeC.addChild(shade)
    const rim = new Graphics()
    rim.moveTo(610, 254).bezierCurveTo(621, 334, 616, 410, 622, 480).bezierCurveTo(628, 554, 640, 614, 652, 664)
    rim.stroke({ width: 2.2, color: 0xffffff, alpha: 0.9, cap: 'round' })
    rim.blendMode = 'add'
    treeC.addChild(rim)

    // light veins
    for (let i = 0; i < 3; i++) {
      const vein = new Graphics()
      if (i === 0) vein.moveTo(592, 650).bezierCurveTo(596, 560, 592, 470, 599, 300)
      else if (i === 1) vein.moveTo(614, 650).bezierCurveTo(610, 560, 614, 470, 604, 320)
      else vein.moveTo(602, 640).bezierCurveTo(606, 540, 600, 430, 602, 330)
      vein.stroke({ width: i === 2 ? 1.2 : 2, color: 0xd4ecff, cap: 'round' })
      vein.blendMode = 'add'
      treeC.addChild(vein)
      animated.push((t) => (vein.alpha = 0.3 + 0.6 * (0.5 + 0.5 * Math.sin(t * 0.0008 + i * 1.4))))
    }

    // major boughs with luminous canopy clusters (the Ori crown)
    const boughs: Array<{ from: Pt; ctrl: Pt; to: Pt }> = [
      { from: { x: 598, y: 240 }, ctrl: { x: 520, y: 190 }, to: { x: 440, y: 175 } },
      { from: { x: 604, y: 235 }, ctrl: { x: 690, y: 185 }, to: { x: 768, y: 172 } },
      { from: { x: 600, y: 215 }, ctrl: { x: 560, y: 150 }, to: { x: 512, y: 112 } },
      { from: { x: 602, y: 212 }, ctrl: { x: 650, y: 145 }, to: { x: 700, y: 108 } },
      { from: { x: 601, y: 200 }, ctrl: { x: 600, y: 150 }, to: { x: 598, y: 92 } },
    ]
    const canopyTints = [0xbfd6ff, 0xcfe2ff, 0xb6ccff]
    boughs.forEach((b, bi) => {
      const bough = new Graphics()
      bough.moveTo(b.from.x, b.from.y).quadraticCurveTo(b.ctrl.x, b.ctrl.y, b.to.x, b.to.y)
      bough.stroke({ width: 7 - bi * 0.8, color: 0xdde3ff, cap: 'round' })
      treeC.addChild(bough)
      // canopy: clustered light foliage at the bough end
      for (let c = 0; c < 6; c++) {
        const blob = mkGlow(canopyTints[c % 3], 46 + seed(`cb${bi}-${c}`) * 56, 0.5)
        blob.x = b.to.x + (seed(`cbx${bi}-${c}`) - 0.5) * 90
        blob.y = b.to.y + (seed(`cby${bi}-${c}`) - 0.5) * 56
        treeC.addChild(blob)
        const ph = seed(`cbp${bi}-${c}`) * 6
        animated.push((t) => (blob.alpha = 0.3 + 0.3 * (0.5 + 0.5 * Math.sin(t * 0.0007 + ph))))
      }
      const tipLight = mkGlow(0xeef2ff, 22, 1, true)
      tipLight.x = b.to.x
      tipLight.y = b.to.y
      treeC.addChild(tipLight)
      animated.push((t) => (tipLight.alpha = 0.5 + 0.45 * (0.5 + 0.5 * Math.sin(t * 0.0016 + bi))))
    })
  }

  // ---------- the little spirit companion ----------
  const spirit = new Container()
  spirit.position.set(702, 648)
  const sGlow = mkGlow(0xdfe9ff, 70, 0.8)
  const body = new Graphics().ellipse(0, -8, 7, 10).fill({ color: 0xeef2ff })
  const head = new Graphics().circle(0, -22, 6.5).fill({ color: 0xeef2ff })
  const earL = new Graphics().moveTo(-3, -27).quadraticCurveTo(-8, -40, -4, -44).quadraticCurveTo(-1, -38, -1, -28).closePath().fill({ color: 0xeef2ff })
  const earR = new Graphics().moveTo(3, -27).quadraticCurveTo(9, -38, 6, -43).quadraticCurveTo(2, -37, 1, -28).closePath().fill({ color: 0xeef2ff })
  const eyeL = new Graphics().circle(-2.4, -23, 1).fill({ color: 0x2a2152 })
  const eyeR = new Graphics().circle(2.4, -23, 1).fill({ color: 0x2a2152 })
  spirit.addChild(sGlow, earL, earR, body, head, eyeL, eyeR)
  Lfront.addChild(spirit)
  // idle bob + blink; tap → hop with sparkle burst
  let hopT = -1
  animated.push((t) => {
    const bob = Math.sin(t * 0.0015) * 2
    spirit.y = 648 + bob + (hopT >= 0 ? -16 * Math.sin(Math.min(1, (t - hopT) / 420) * Math.PI) : 0)
    if (hopT >= 0 && t - hopT > 420) hopT = -1
    const blink = t % 4200 < 140
    eyeL.visible = !blink
    eyeR.visible = !blink
    sGlow.alpha = 0.55 + 0.25 * Math.sin(t * 0.0012)
  })
  spirit.eventMode = 'static'
  spirit.cursor = 'pointer'
  let now = 0
  spirit.on('pointertap', () => {
    hopT = now
    for (let i = 0; i < 9; i++) {
      const sp = mkGlow(0xcfe0ff, 12, 1, true)
      sp.x = spirit.x
      sp.y = spirit.y - 24
      Lfx.addChild(sp)
      const ang = (i / 9) * Math.PI * 2
      const start = now
      animated.push((t) => {
        const k = Math.min(1, (t - start) / 700)
        sp.x = spirit.x + Math.cos(ang) * 38 * k
        sp.y = spirit.y - 24 + Math.sin(ang) * 26 * k - 14 * k
        sp.alpha = 1 - k
        if (k >= 1) sp.visible = false
      })
    }
  })

  // ---------- year branches + memory orbs ----------
  const byMonth = new Map<string, MemoryEvent[]>()
  for (const ev of data.events) {
    const k = ev.date.slice(0, 7)
    if (!byMonth.has(k)) byMonth.set(k, [])
    byMonth.get(k)!.push(ev)
  }

  data.months.forEach(({ key, label }, i) => {
    const evs = byMonth.get(key) ?? []
    const attach: Pt = { x: 600 + Math.sin(i * 0.95) * 7, y: 596 - i * 31 }
    const side = i % 2 === 0 ? -1 : 1
    const len = evs.length ? 120 + Math.min(evs.length, 14) * 13 : 70
    const lift = len * (0.4 + 0.16 * seed(key))
    const tipPt: Pt = { x: attach.x + side * len, y: attach.y - lift }
    const ctrl: Pt = { x: attach.x + side * len * 0.42, y: attach.y - lift * 0.08 }

    const branch = new Graphics()
    branch.moveTo(attach.x, attach.y).quadraticCurveTo(ctrl.x, ctrl.y, tipPt.x, tipPt.y)
    branch.stroke({ width: evs.length ? 5 : 2.5, color: evs.length ? 0xdde3ff : 0x6f76ad, cap: 'round', alpha: evs.length ? 1 : 0.75 })
    if (evs.length) {
      const branchLight = new Graphics()
      branchLight.moveTo(attach.x, attach.y).quadraticCurveTo(ctrl.x, ctrl.y, tipPt.x, tipPt.y)
      branchLight.stroke({ width: 1.6, color: 0xffffff, alpha: 0.7, cap: 'round' })
      branchLight.blendMode = 'add'
      Ltree.addChild(branch, branchLight)
    } else Ltree.addChild(branch)

    const lbl = new Text({
      text: label,
      style: { fontFamily: 'Inter, sans-serif', fontSize: 13, fill: evs.length ? 0xa8aed6 : 0x565b85 },
    })
    lbl.anchor.set(side === 1 ? 0 : 1, 0.5)
    lbl.x = tipPt.x + side * 13
    lbl.y = tipPt.y
    Ltree.addChild(lbl)

    evs.forEach((ev, j) => {
      const ft = 0.3 + 0.68 * (evs.length === 1 ? 0.85 : j / (evs.length - 1))
      const p = bez(attach, ctrl, tipPt, ft)
      const n = bezN(attach, ctrl, tipPt, ft)
      const off = (seed(ev.key) - 0.5) * 2 * (10 + 15 * seed(ev.key + 'o'))
      const r = 3.5 + 2.5 * seed(ev.key + 'r')
      const orb = new Container()
      orb.x = p.x + n.x * off
      orb.y = p.y + n.y * off
      const halo = mkGlow(KIND_COLORS[ev.kind], r * 8, 0.9)
      const core = new Graphics().circle(0, 0, r).fill({ color: KIND_COLORS[ev.kind] })
      const spark = new Graphics().circle(-r * 0.3, -r * 0.3, r * 0.35).fill({ color: 0xffffff, alpha: 0.9 })
      orb.addChild(halo, core, spark)
      orb.eventMode = 'static'
      orb.cursor = 'pointer'
      orb.on('pointertap', () => {
        if (ev.kind === 'note') cb.navigate(`/notes?open=${ev.ref_id}`)
        else if (ev.kind === 'journal') cb.navigate('/journal')
        else cb.navigate(`/title/${ev.ref_id}`)
      })
      orb.on('pointermove', (e) =>
        cb.tip({
          clientX: e.clientX,
          clientY: e.clientY,
          color: hex(KIND_COLORS[ev.kind]),
          head: `${data.kindNames[ev.kind]} · ${data.dateOf(ev.date)}`,
          label: ev.label,
          sub: ev.sublabel,
        })
      )
      orb.on('pointerout', () => cb.tip(null))
      Ltree.addChild(orb)
      const ph = seed(ev.key) * 6
      const bx = orb.x
      const by = orb.y
      animated.push((t) => {
        orb.y = by + Math.sin(t * 0.0008 + ph) * 2.4
        orb.x = bx + Math.cos(t * 0.0006 + ph) * 1.4
        halo.alpha = 0.6 + 0.3 * Math.sin(t * 0.0012 + ph)
      })
    })
  })

  // ---------- particles ----------
  for (let i = 0; i < 36; i++) {
    const d = mkGlow(0xbcd0ff, 6 + seed(`d${i}`) * 8, 0.5, true)
    const baseX = seed(`dx${i}`) * W
    const speed = 0.006 + seed(`ds${i}`) * 0.012
    const ph = seed(`dp${i}`) * 6
    Lfx.addChild(d)
    animated.push((t) => {
      const k = ((t * speed) / 10 + seed(`do${i}`) * 100) % 120
      d.x = baseX + Math.sin(t * 0.0004 + ph) * 30
      d.y = 700 - k * 5.6
      d.alpha = 0.12 + 0.3 * (0.5 + 0.5 * Math.sin(t * 0.001 + ph)) * Math.min(1, (120 - k) / 30)
    })
  }

  // falling spirit petals
  for (let i = 0; i < 9; i++) {
    const petal = new Graphics().ellipse(0, 0, 4, 2).fill({ color: 0x9db4ff, alpha: 0.85 })
    Lfx.addChild(petal)
    const px = 380 + seed(`pe${i}`) * 460
    const dur = 9000 + seed(`ped${i}`) * 6000
    const ph = seed(`pep${i}`) * dur
    animated.push((t) => {
      const k = ((t + ph) % dur) / dur
      petal.x = px + Math.sin(k * 9 + i) * 46
      petal.y = 180 + k * 480
      petal.rotation = k * 7 + i
      petal.alpha = k < 0.08 ? k / 0.08 : k > 0.9 ? (1 - k) / 0.1 : 0.85
    })
  }

  const ffCount = Math.min(14, Math.max(5, data.stats.moments))
  const ffC = new Container()
  for (let i = 0; i < ffCount; i++) {
    const f = mkGlow(0xffe9a3, 10, 0.9, true)
    const cx = 180 + seed(`ff${i}`) * 840
    const cyy = 430 + seed(`ffy${i}`) * 200
    const ph = seed(`ffp${i}`) * 6
    ffC.addChild(f)
    animated.push((t) => {
      f.x = cx + Math.sin(t * 0.0005 + ph) * 46 + Math.sin(t * 0.0013 + ph * 2) * 12
      f.y = cyy + Math.cos(t * 0.0007 + ph) * 26
      f.alpha = 0.15 + 0.7 * (0.5 + 0.5 * Math.sin(t * 0.0023 + ph))
    })
  }
  hot(ffC, () => cb.navigate('/moments'), () => ({ color: hex(KIND_COLORS.moment), head: data.zoneLabels.moments, label: String(data.stats.moments) }))
  Lfx.addChild(ffC)

  if (data.assets.foreground) {
    const s = new Sprite(await loadTex(data.assets.foreground))
    s.width = W
    s.height = H
    Lfx.addChild(s)
  } else {
    // foreground framing foliage (out of focus, like Ori shots)
    const frame = new Container()
    const fern = (fx: number, fy: number, dir: number, n: number) => {
      const g = new Graphics()
      for (let i = 0; i < n; i++) {
        const ang = -0.5 - i * 0.22
        g.moveTo(fx, fy).quadraticCurveTo(fx + dir * 50 * Math.cos(ang), fy + 60 * Math.sin(ang) * 0.6 - 20, fx + dir * (90 + i * 16) * Math.cos(ang), fy + (90 + i * 14) * Math.sin(ang))
      }
      g.stroke({ width: 4, color: 0x07051c, cap: 'round' })
      return g
    }
    frame.addChild(fern(-10, 768, 1, 5))
    frame.addChild(fern(1212, 776, -1, 5))
    const tuft = new Graphics()
    for (let i = 0; i < 26; i++) {
      const tx = i < 13 ? 8 + i * 14 : 1010 + (i - 13) * 15
      const th = 26 + seed(`tf${i}`) * 40
      tuft.moveTo(tx, 764).quadraticCurveTo(tx + 6, 764 - th * 0.6, tx + (seed(`tfd${i}`) - 0.5) * 18, 764 - th)
    }
    tuft.stroke({ width: 3, color: 0x07051c, cap: 'round' })
    frame.addChild(tuft)
    frame.filters = [new BlurFilter({ strength: 2 })]
    Lfx.addChild(frame)
  }

  // ---------- cinematic post: grade, vignette, letterbox, grain, fade-in ----------
  const grade = new Sprite(linearTex(16, H, [[0, 'rgba(40,70,140,0.16)'], [0.55, 'rgba(20,18,60,0.10)'], [1, 'rgba(60,30,90,0.22)']]))
  grade.width = W
  grade.height = H
  grade.blendMode = 'multiply'
  app.stage.addChild(grade)

  const warm = mkGlow(0xffd9a0, 620, 0.1)
  warm.x = 956
  warm.y = 124
  app.stage.addChild(warm)

  const vig = new Sprite(radialTex(512, [[0, 'rgba(0,0,0,0)'], [0.68, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.5)']]))
  vig.anchor.set(0.5)
  vig.x = W / 2
  vig.y = H / 2
  vig.width = W * 1.18
  vig.height = H * 1.18
  app.stage.addChild(vig)

  const barH = 42
  const barTop = new Graphics().rect(0, 0, W, barH).fill({ color: 0x000000 })
  const barBot = new Graphics().rect(0, H - barH, W, barH).fill({ color: 0x000000 })
  app.stage.addChild(barTop, barBot)

  const fade = new Graphics().rect(0, 0, W, H).fill({ color: 0x06051a })
  app.stage.addChild(fade)

  app.stage.filters = [new NoiseFilter({ noise: 0.045 })]
  const grain = app.stage.filters[0] as NoiseFilter

  // ---------- camera + ticker ----------
  let targetX = 0
  let targetY = 0
  const onMove = (e: PointerEvent) => {
    const rect = app.canvas.getBoundingClientRect()
    targetX = ((e.clientX - rect.left) / rect.width - 0.5) * 2
    targetY = ((e.clientY - rect.top) / rect.height - 0.5) * 2
  }
  app.canvas.addEventListener('pointermove', onMove)

  let elapsed = 0
  const tick = () => {
    elapsed += app.ticker.deltaMS
    now = elapsed
    for (const fn of animated) fn(elapsed, app.ticker.deltaMS)

    // intro: fade from black + slow zoom-out
    const intro = Math.min(1, elapsed / 2400)
    const ease = 1 - (1 - intro) ** 3
    fade.alpha = 1 - Math.min(1, elapsed / 1100)
    camera.scale.set(1.07 - 0.07 * ease + 0.006 * Math.sin(elapsed * 0.00022)) // then breathe

    // idle camera drift
    camera.x = W / 2 + Math.sin(elapsed * 0.00006) * 7
    camera.y = H / 2 + Math.cos(elapsed * 0.00005) * 4

    // parallax
    const lerp = (c: Container, fx: number, fy: number) => {
      c.x += (targetX * fx - c.x) * 0.04
      c.y += (targetY * fy - c.y) * 0.04
    }
    lerp(Lsky, -6, -3)
    lerp(Lfar, -13, -6)
    lerp(Lmid, -22, -9)
    lerp(Ltree, -30, -12)
    lerp(Lfront, -42, -16)
    lerp(Lfx, -52, -20)

    grain.seed = (elapsed % 1000) / 1000
  }
  app.ticker.add(tick)

  return () => {
    app.canvas.removeEventListener('pointermove', onMove)
    app.destroy(true, { children: true, texture: true })
  }
}
