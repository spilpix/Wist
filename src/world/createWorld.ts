import {
  Application,
  BlurFilter,
  Container,
  Graphics,
  Sprite,
  Text,
  Texture,
  Assets,
} from 'pixi.js'
import type { MemoryEvent, MemoryKind } from '../types/models'

/**
 * The World — a game-grade WebGL scene (Ori-inspired spirit night).
 * Procedural art out of the box; drops to painted PNG layers when the user
 * provides them in %APPDATA%/Wist/world (sky / hills-far / hills-near / tree / foreground).
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

// ---------- texture factories (canvas-drawn, GPU-uploaded once) ----------

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

export async function createWorld(host: HTMLDivElement, data: WorldData, cb: WorldCallbacks): Promise<() => void> {
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

  // shared glow textures
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

  // parallax layers
  const Lsky = new Container()
  const Lfar = new Container()
  const Lmid = new Container()
  const Ltree = new Container()
  const Lfront = new Container()
  const Lfx = new Container()
  app.stage.addChild(Lsky, Lfar, Lmid, Ltree, Lfront, Lfx)

  const animated: Array<(t: number, dt: number) => void> = []

  // ---------- sky ----------
  if (data.assets.sky) {
    const t = await Assets.load({ src: data.assets.sky, loadParser: 'loadTextures' })
    const s = new Sprite(t)
    s.width = W
    s.height = H
    Lsky.addChild(s)
  } else {
    const sky = new Sprite(linearTex(64, H, [[0, '#06051a'], [0.45, '#120e33'], [0.8, '#2c2160'], [1, '#43306f']]))
    sky.width = W
    sky.height = H
    Lsky.addChild(sky)
  }

  // stars
  for (let i = 0; i < 110; i++) {
    const star = mkGlow(0xdfe6ff, seed(`s${i}`) > 0.9 ? 7 : 4, 0.8, true)
    star.x = 20 + seed(`sx${i}`) * (W - 40)
    star.y = 14 + seed(`sy${i}`) * 360
    const ph = seed(`sp${i}`) * Math.PI * 2
    Lsky.addChild(star)
    animated.push((t) => {
      star.alpha = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(t * 0.0011 + ph))
    })
  }

  // aurora ribbons
  const auroraTex = linearTex(8, 90, [[0, 'rgba(70,227,192,0)'], [0.5, 'rgba(70,227,192,0.45)'], [1, 'rgba(138,111,240,0)']])
  for (let i = 0; i < 3; i++) {
    const a = new Sprite(auroraTex)
    a.width = 760 + i * 140
    a.height = 110 - i * 18
    a.anchor.set(0.5)
    a.x = 520 + i * 110
    a.y = 130 + i * 52
    a.rotation = -0.06 + i * 0.04
    a.blendMode = 'add'
    a.filters = [new BlurFilter({ strength: 14 })]
    Lsky.addChild(a)
    animated.push((t) => {
      a.x = 520 + i * 110 + Math.sin(t * 0.00018 + i * 1.7) * 36
      a.alpha = 0.55 + 0.35 * Math.sin(t * 0.0003 + i)
    })
  }

  // moon + god ray
  const moonHalo = mkGlow(0xcdd8ff, 320, 0.85)
  moonHalo.x = 956
  moonHalo.y = 128
  const moon = new Graphics().circle(956, 128, 30).fill({ color: 0xeef2ff })
  const ray = new Sprite(linearTex(8, 64, [[0, 'rgba(205,216,255,0.16)'], [1, 'rgba(205,216,255,0)']]))
  ray.anchor.set(0.5, 0)
  ray.width = 200
  ray.height = 560
  ray.x = 940
  ray.y = 150
  ray.rotation = 0.5
  ray.blendMode = 'add'
  Lsky.addChild(moonHalo, moon, ray)
  animated.push((t) => {
    moonHalo.alpha = 0.7 + 0.18 * Math.sin(t * 0.0006)
    ray.alpha = 0.5 + 0.3 * Math.sin(t * 0.00045)
  })

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
    const t = await Assets.load({ src: data.assets.hillsFar, loadParser: 'loadTextures' })
    const s = new Sprite(t)
    s.width = W
    s.height = H
    Lfar.addChild(s)
  } else {
    Lfar.addChild(hill([[0, 470], [200, 380], [400, 450], [640, 400], [880, 455], [1050, 415], [1200, 440]], 0x261c52, 0.9))
  }

  if (data.assets.hillsNear) {
    const t = await Assets.load({ src: data.assets.hillsNear, loadParser: 'loadTextures' })
    const s = new Sprite(t)
    s.width = W
    s.height = H
    Lmid.addChild(s)
  } else {
    Lmid.addChild(hill([[0, 540], [260, 450], [520, 525], [800, 480], [1000, 525], [1100, 500], [1200, 515]], 0x1b1340))
    Lmid.addChild(hill([[0, 620], [300, 560], [620, 600], [900, 575], [1200, 595]], 0x130d30))
  }

  // mist
  const mist = mkGlow(0x8d9bff, 760, 0.16)
  mist.x = 600
  mist.y = 600
  mist.scale.y *= 0.22
  Lmid.addChild(mist)
  animated.push((t) => {
    mist.x = 600 + Math.sin(t * 0.00012) * 40
  })

  // ground
  Lfront.addChild(hill([[0, 642], [300, 606], [620, 630], [900, 612], [1200, 626]], 0x0e0926))

  // ---------- landmarks ----------
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
    const start = perf()
    const step = () => {
      const k = Math.min(1, (perf() - start) / 140)
      const v = from + (target - from) * k
      c.scale.set(v)
      if (k < 1) requestAnimationFrame(step)
    }
    step()
  }
  const perf = () => performance.now()

  // Story Forest (library) — left grove
  const forest = new Container()
  forest.pivot.set(220, 615)
  forest.position.set(220, 615)
  for (let i = 0; i < 6; i++) {
    const fx = 110 + i * 44 + seed(`f${i}`) * 16
    const fh = 56 + seed(`fh${i}`) * 40
    const fy = 614 - seed(`fy${i}`) * 10
    const tr = new Graphics()
    tr.moveTo(fx, fy).lineTo(fx, fy - fh * 0.45).stroke({ width: 5, color: 0x2a2152, cap: 'round' })
    const crown = new Graphics().ellipse(fx, fy - fh * 0.66, 17 + seed(`fr${i}`) * 9, fh * 0.4).fill({ color: i % 2 ? 0x241b52 : 0x352a72 })
    forest.addChild(tr, crown)
    if (i % 2 === 0) {
      const berry = mkGlow(0x4ade80, 16, 0.9)
      berry.x = fx + 7
      berry.y = fy - fh * 0.66
      forest.addChild(berry)
      const ph = i * 1.3
      animated.push((t) => (berry.alpha = 0.4 + 0.5 * (0.5 + 0.5 * Math.sin(t * 0.0014 + ph))))
    }
  }
  hot(forest, () => cb.navigate('/library'), () => ({ color: hex(KIND_COLORS.title), head: data.zoneLabels.library, label: String(data.stats.titles) }))
  Lfront.addChild(forest)

  // Lake of Days (journal)
  const lake = new Container()
  lake.pivot.set(1010, 688)
  lake.position.set(1010, 688)
  lake.addChild(new Graphics().ellipse(1010, 688, 158, 28).fill({ color: 0x232b66 }))
  lake.addChild(new Graphics().ellipse(1010, 688, 158, 28).stroke({ width: 1.5, color: 0x9fb4ff, alpha: 0.3 }))
  const moonRefl = mkGlow(0xbcd0ff, 110, 0.5)
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
    const stem = new Graphics().moveTo(gx, gy).quadraticCurveTo(gx + 3, gy - gh * 0.6, gx + 1, gy - gh).stroke({ width: 1.8, color: 0x3a4274, cap: 'round' })
    const head = mkGlow(0x60a5fa, 18 + seed(`ghd${i}`) * 10, 0.95)
    head.x = gx + 1
    head.y = gy - gh - 2
    garden.addChild(stem, head)
    const ph = seed(`gp${i}`) * 6
    animated.push((t) => {
      head.alpha = 0.5 + 0.45 * (0.5 + 0.5 * Math.sin(t * 0.0016 + ph))
      head.y = gy - gh - 2 + Math.sin(t * 0.0009 + ph) * 1.6
    })
  }
  hot(garden, () => cb.navigate('/notes'), () => ({ color: hex(KIND_COLORS.note), head: data.zoneLabels.notes, label: String(data.stats.notes) }))
  Lfront.addChild(garden)

  // Path of Deeds (tasks) with lanterns
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
  const total = data.stats.openTasks + data.stats.doneTasks
  const lit = total > 0 ? Math.round((data.stats.doneTasks / total) * lanternCount) : 0
  for (let i = 0; i < lanternCount; i++) {
    const lp = bez(p0, p1, p2, 0.16 + i * 0.25)
    const post = new Graphics().moveTo(lp.x, lp.y).lineTo(lp.x, lp.y - 27).stroke({ width: 2.5, color: 0x2a2152 })
    path.addChild(post)
    const isLit = i < lit
    const bulb = new Graphics().circle(lp.x, lp.y - 31, 4).fill({ color: isLit ? 0xffd27d : 0x4a4376 })
    path.addChild(bulb)
    if (isLit) {
      const halo = mkGlow(0xffc66b, 44, 0.85)
      halo.x = lp.x
      halo.y = lp.y - 31
      path.addChild(halo)
      const ph = i * 0.9
      animated.push((t) => (halo.alpha = 0.55 + 0.35 * (0.5 + 0.5 * Math.sin(t * 0.0021 + ph))))
    }
  }
  hot(path, () => cb.navigate('/tasks'), () => ({ color: '#ffd27d', head: data.zoneLabels.tasks, label: data.zoneLabels.tasksSub }))
  Lfront.addChild(path)

  // grass blades
  const grass = new Graphics()
  for (let i = 0; i < 70; i++) {
    const gx = 14 + i * 17 + seed(`gr${i}`) * 10
    const gy = 706 + seed(`gry${i}`) * 46
    const gh = 7 + seed(`grh${i}`) * 13
    grass.moveTo(gx, gy).lineTo(gx + (seed(`grd${i}`) - 0.5) * 7, gy - gh).stroke({ width: 1.6, color: 0x231a4e, cap: 'round' })
  }
  Lfront.addChild(grass)

  // ---------- Spirit Tree ----------
  const treeC = new Container()
  Ltree.addChild(treeC)

  const crownHalo = mkGlow(0xcfe0ff, 460, 0.5)
  crownHalo.x = 600
  crownHalo.y = 235
  treeC.addChild(crownHalo)
  animated.push((t) => (crownHalo.alpha = 0.38 + 0.16 * Math.sin(t * 0.0005)))

  if (data.assets.tree) {
    const t = await Assets.load({ src: data.assets.tree, loadParser: 'loadTextures' })
    const s = new Sprite(t)
    s.width = W
    s.height = H
    treeC.addChild(s)
  } else {
    const drawTrunk = (g: Graphics) => {
      g.moveTo(560, 666)
      g.bezierCurveTo(574, 596, 582, 530, 586, 462)
      g.bezierCurveTo(590, 396, 584, 322, 596, 248)
      g.bezierCurveTo(598, 226, 600, 210, 601, 196)
      g.bezierCurveTo(603, 212, 606, 234, 609, 256)
      g.bezierCurveTo(620, 336, 615, 412, 621, 482)
      g.bezierCurveTo(627, 556, 638, 614, 650, 666)
      g.closePath()
    }
    // outer glow body (blurred, additive)
    const glowTrunk = new Graphics()
    drawTrunk(glowTrunk)
    glowTrunk.fill({ color: 0x9fb4ff, alpha: 0.8 })
    glowTrunk.filters = [new BlurFilter({ strength: 18 })]
    glowTrunk.blendMode = 'add'
    treeC.addChild(glowTrunk)
    // core trunk
    const trunk = new Graphics()
    // roots
    trunk.moveTo(562, 664).bezierCurveTo(540, 672, 506, 678, 470, 675).lineTo(470, 680).lineTo(600, 680).closePath().fill({ color: 0xb9c4f2 })
    trunk.moveTo(646, 664).bezierCurveTo(668, 673, 702, 678, 736, 675).lineTo(736, 680).lineTo(610, 680).closePath().fill({ color: 0xb9c4f2 })
    drawTrunk(trunk)
    trunk.fill({ color: 0xe9efff })
    treeC.addChild(trunk)
    // shade side
    const shade = new Graphics()
    shade.moveTo(560, 666)
    shade.bezierCurveTo(574, 596, 582, 530, 586, 462)
    shade.bezierCurveTo(590, 396, 586, 330, 596, 252)
    shade.bezierCurveTo(590, 330, 588, 420, 592, 500)
    shade.bezierCurveTo(595, 570, 588, 630, 581, 666)
    shade.closePath()
    shade.fill({ color: 0xaab4e8, alpha: 0.6 })
    treeC.addChild(shade)
    // light veins
    for (let i = 0; i < 2; i++) {
      const vein = new Graphics()
      if (i === 0) vein.moveTo(592, 650).bezierCurveTo(596, 560, 592, 470, 599, 300)
      else vein.moveTo(614, 650).bezierCurveTo(610, 560, 614, 470, 604, 320)
      vein.stroke({ width: i === 0 ? 2.2 : 1.5, color: 0xd4ecff, cap: 'round' })
      vein.blendMode = 'add'
      treeC.addChild(vein)
      animated.push((t) => (vein.alpha = 0.3 + 0.6 * (0.5 + 0.5 * Math.sin(t * 0.0008 + i * 1.4))))
    }
    // crown twigs
    const twigs = new Graphics()
    twigs.moveTo(601, 200).bezierCurveTo(592, 178, 576, 166, 552, 158)
    twigs.moveTo(601, 200).bezierCurveTo(610, 176, 628, 164, 654, 158)
    twigs.moveTo(601, 198).bezierCurveTo(600, 182, 602, 170, 606, 156)
    twigs.stroke({ width: 4, color: 0xdde3ff, cap: 'round' })
    treeC.addChild(twigs)
    const bud = mkGlow(0xeef2ff, 30, 1, true)
    bud.x = 601
    bud.y = 196
    treeC.addChild(bud)
    animated.push((t) => (bud.alpha = 0.6 + 0.4 * Math.sin(t * 0.0018)))
  }

  // ---------- year branches + memory orbs ----------
  const byMonth = new Map<string, MemoryEvent[]>()
  for (const ev of data.events) {
    const k = ev.date.slice(0, 7)
    if (!byMonth.has(k)) byMonth.set(k, [])
    byMonth.get(k)!.push(ev)
  }

  data.months.forEach(({ key, label }, i) => {
    const evs = byMonth.get(key) ?? []
    const attach: Pt = { x: 600 + Math.sin(i * 0.95) * 7, y: 600 - i * 33 }
    const side = i % 2 === 0 ? -1 : 1
    const len = evs.length ? 120 + Math.min(evs.length, 14) * 13 : 70
    const lift = len * (0.4 + 0.16 * seed(key))
    const tipPt: Pt = { x: attach.x + side * len, y: attach.y - lift }
    const ctrl: Pt = { x: attach.x + side * len * 0.42, y: attach.y - lift * 0.08 }

    const branch = new Graphics()
    branch.moveTo(attach.x, attach.y).quadraticCurveTo(ctrl.x, ctrl.y, tipPt.x, tipPt.y)
    branch.stroke({ width: evs.length ? 4.5 : 2.5, color: evs.length ? 0xdde3ff : 0x6f76ad, cap: 'round', alpha: evs.length ? 1 : 0.8 })
    Ltree.addChild(branch)

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

  // ---------- particles: spirit dust + fireflies ----------
  for (let i = 0; i < 34; i++) {
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

  // foreground painted layer (optional)
  if (data.assets.foreground) {
    const t = await Assets.load({ src: data.assets.foreground, loadParser: 'loadTextures' })
    const s = new Sprite(t)
    s.width = W
    s.height = H
    Lfx.addChild(s)
  }

  // vignette for depth
  const vig = new Sprite(radialTex(512, [[0, 'rgba(0,0,0,0)'], [0.72, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.42)']]))
  vig.anchor.set(0.5)
  vig.x = W / 2
  vig.y = H / 2
  vig.width = W * 1.16
  vig.height = H * 1.16
  Lfx.addChild(vig)

  // ---------- parallax + ticker ----------
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
    const dt = app.ticker.deltaMS
    for (const fn of animated) fn(elapsed, dt)
    // layered parallax (lerped)
    const lerp = (c: Container, fx: number, fy: number) => {
      c.x += (targetX * fx - c.x) * 0.04
      c.y += (targetY * fy - c.y) * 0.04
    }
    lerp(Lsky, -6, -3)
    lerp(Lfar, -13, -6)
    lerp(Lmid, -22, -9)
    lerp(Ltree, -30, -12)
    lerp(Lfront, -42, -16)
    lerp(Lfx, -50, -20)
  }
  app.ticker.add(tick)

  return () => {
    app.canvas.removeEventListener('pointermove', onMove)
    app.destroy(true, { children: true, texture: true })
  }
}
