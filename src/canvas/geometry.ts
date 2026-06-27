import type { CanvasAnchor, CanvasConnectorType, CanvasNode, CanvasShape } from '../types/models'

export interface Box {
  x: number
  y: number
  w: number
  h: number
}
export interface Pt {
  x: number
  y: number
}

export const ANCHORS: CanvasAnchor[] = ['t', 'r', 'b', 'l', 'tl', 'tr', 'br', 'bl']
// only the four side-midpoints are used for automatic connector routing
export const SIDE_ANCHORS: CanvasAnchor[] = ['t', 'r', 'b', 'l']

export function anchorPoint(n: Box, a: CanvasAnchor): Pt {
  switch (a) {
    case 't':
      return { x: n.x + n.w / 2, y: n.y }
    case 'r':
      return { x: n.x + n.w, y: n.y + n.h / 2 }
    case 'b':
      return { x: n.x + n.w / 2, y: n.y + n.h }
    case 'l':
      return { x: n.x, y: n.y + n.h / 2 }
    case 'tl':
      return { x: n.x, y: n.y }
    case 'tr':
      return { x: n.x + n.w, y: n.y }
    case 'br':
      return { x: n.x + n.w, y: n.y + n.h }
    case 'bl':
      return { x: n.x, y: n.y + n.h }
  }
}

export const center = (n: Box): Pt => ({ x: n.x + n.w / 2, y: n.y + n.h / 2 })

// outward unit normal for a side anchor (used to leave a safe-zone gap on connectors)
export function anchorNormal(a: CanvasAnchor): Pt {
  switch (a) {
    case 't':
      return { x: 0, y: -1 }
    case 'r':
      return { x: 1, y: 0 }
    case 'b':
      return { x: 0, y: 1 }
    case 'l':
      return { x: -1, y: 0 }
    default:
      return { x: 0, y: 0 }
  }
}

// the side (t/r/b/l) of `box` that faces a target point — for adaptive connector routing
export function sideToward(box: Box, target: Pt): CanvasAnchor {
  const c = center(box)
  const dx = target.x - c.x
  const dy = target.y - c.y
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'r' : 'l'
  return dy >= 0 ? 'b' : 't'
}

// axis-aligned bounding box of a (possibly rotated-about-center) node
export function nodeAABB(n: Box & { rotation?: number }): Box {
  if (!n.rotation) return { x: n.x, y: n.y, w: n.w, h: n.h }
  const c = center(n)
  const corners = [
    { x: -n.w / 2, y: -n.h / 2 },
    { x: n.w / 2, y: -n.h / 2 },
    { x: n.w / 2, y: n.h / 2 },
    { x: -n.w / 2, y: n.h / 2 },
  ].map((p) => {
    const r = rotate(p.x, p.y, n.rotation!)
    return { x: c.x + r.x, y: c.y + r.y }
  })
  const xs = corners.map((p) => p.x)
  const ys = corners.map((p) => p.y)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  return { x: minX, y: minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY }
}

export function bbox(boxes: Box[]): Box | null {
  if (!boxes.length) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const b of boxes) {
    minX = Math.min(minX, b.x)
    minY = Math.min(minY, b.y)
    maxX = Math.max(maxX, b.x + b.w)
    maxY = Math.max(maxY, b.y + b.h)
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

export const snap = (v: number, grid: number) => Math.round(v / grid) * grid

// Figma/Miro-style smart snapping: align the moving box's left/centre/right (and
// top/middle/bottom) to any static box's edges/centres within `thresh`. Returns the
// snap delta per axis (+ whether it matched) and world coords for the guide lines.
export interface SnapResult {
  dx: number
  dy: number
  mx: boolean
  my: boolean
  vx: number[]
  hy: number[]
}
export function snapToObjects(box: Box, statics: Box[], thresh: number): SnapResult {
  const mex = [box.x, box.x + box.w / 2, box.x + box.w]
  const mey = [box.y, box.y + box.h / 2, box.y + box.h]
  let bdx = Infinity
  let bdy = Infinity
  for (const s of statics) {
    const sex = [s.x, s.x + s.w / 2, s.x + s.w]
    const sey = [s.y, s.y + s.h / 2, s.y + s.h]
    for (const m of mex) for (const t of sex) { const d = t - m; if (Math.abs(d) <= thresh && Math.abs(d) < Math.abs(bdx)) bdx = d }
    for (const m of mey) for (const t of sey) { const d = t - m; if (Math.abs(d) <= thresh && Math.abs(d) < Math.abs(bdy)) bdy = d }
  }
  const dx = isFinite(bdx) ? bdx : 0
  const dy = isFinite(bdy) ? bdy : 0
  const sx = [box.x + dx, box.x + box.w / 2 + dx, box.x + box.w + dx]
  const sy = [box.y + dy, box.y + box.h / 2 + dy, box.y + box.h + dy]
  const vx = new Set<number>()
  const hy = new Set<number>()
  for (const s of statics) {
    const sex = [s.x, s.x + s.w / 2, s.x + s.w]
    const sey = [s.y, s.y + s.h / 2, s.y + s.h]
    for (const m of sx) for (const t of sex) if (Math.abs(t - m) < 0.5) vx.add(Math.round(t))
    for (const m of sy) for (const t of sey) if (Math.abs(t - m) < 0.5) hy.add(Math.round(t))
  }
  return { dx, dy, mx: isFinite(bdx), my: isFinite(bdy), vx: [...vx], hy: [...hy] }
}

export function pointInBox(p: Pt, b: Box): boolean {
  return p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h
}

export function boxesIntersect(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

// Ray-casting point-in-polygon (for lasso selection)
export function pointInPolygon(pt: Pt, poly: Pt[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y
    if ((yi > pt.y) !== (yj > pt.y) && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

// True if any corner of the box is inside the polygon, or any poly vertex is inside the box.
export function boxIntersectsPolygon(box: Box, poly: Pt[]): boolean {
  const corners: Pt[] = [
    { x: box.x, y: box.y }, { x: box.x + box.w, y: box.y },
    { x: box.x + box.w, y: box.y + box.h }, { x: box.x, y: box.y + box.h },
  ]
  return corners.some((c) => pointInPolygon(c, poly)) || poly.some((p) => pointInBox(p, box))
}

// best pair of side anchors between two boxes (nearest-side routing, Miro-style)
export function bestAnchors(a: Box, b: Box): [CanvasAnchor, CanvasAnchor] {
  const ca = center(a)
  const cb = center(b)
  const dx = cb.x - ca.x
  const dy = cb.y - ca.y
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? ['r', 'l'] : ['l', 'r']
  return dy >= 0 ? ['b', 't'] : ['t', 'b']
}

// nearest of the 8 anchors of `box` to an arbitrary world point
export function nearestAnchor(box: Box, p: Pt): CanvasAnchor {
  let best: CanvasAnchor = 't'
  let bestD = Infinity
  for (const a of ANCHORS) {
    const ap = anchorPoint(box, a)
    const d = (ap.x - p.x) ** 2 + (ap.y - p.y) ** 2
    if (d < bestD) {
      bestD = d
      best = a
    }
  }
  return best
}

// ── shape geometry: a path inside a 0..100 viewBox, stretched to the node box ──
// (rendered with vector-effect:non-scaling-stroke so borders stay crisp)
export function shapePath(shape: CanvasShape): string {
  switch (shape) {
    case 'rect':
      return 'M2,2 L98,2 L98,98 L2,98 Z'
    case 'roundRect':
      return 'M16,2 L84,2 Q98,2 98,16 L98,84 Q98,98 84,98 L16,98 Q2,98 2,84 L2,16 Q2,2 16,2 Z'
    case 'ellipse':
      return 'M2,50 A48,48 0 1,0 98,50 A48,48 0 1,0 2,50 Z'
    case 'diamond':
      return 'M50,2 L98,50 L50,98 L2,50 Z'
    case 'triangle':
      return 'M50,3 L98,97 L2,97 Z'
    case 'parallelogram':
      return 'M26,3 L98,3 L74,97 L2,97 Z'
    case 'cylinder':
      return 'M2,14 C2,6 98,6 98,14 L98,86 C98,94 2,94 2,86 Z M2,14 C2,22 98,22 98,14'
    case 'cloud':
      // cubic-bezier cloud — scales cleanly under non-uniform stretch
      return 'M20,80 C6,80 4,60 17,55 C12,38 34,32 44,44 C50,26 76,27 78,46 C94,44 97,68 81,70 C84,84 62,86 57,76 C50,86 28,86 20,80 Z'
    case 'star':
      return 'M50,3 L61.8,35.8 L97.6,36.5 L69,57.2 L79.4,91.5 L50,71 L20.6,91.5 L31,57.2 L2.4,36.5 L38.2,35.8 Z'
    case 'arrowRight':
      return 'M2,32 L60,32 L60,10 L98,50 L60,90 L60,68 L2,68 Z'
    case 'hexagon':
      return 'M27,4 L73,4 L98,50 L73,96 L27,96 L2,50 Z'
    case 'pentagon':
      return 'M50,3 L97,38 L79,96 L21,96 L3,38 Z'
  }
}

// connector path string (world coords). n1/n2 = outward normals at each endpoint
// (the side the line leaves the block from) → the curve adapts to object positions.
export function connectorPath(type: CanvasConnectorType, p1: Pt, p2: Pt, n1?: Pt, n2?: Pt): string {
  if (type === 'straight') return `M${p1.x},${p1.y} L${p2.x},${p2.y}`
  const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y)
  const d = Math.max(36, dist * 0.4)
  const a1 = n1 ?? { x: p2.x >= p1.x ? 1 : -1, y: 0 }
  const a2 = n2 ?? { x: p1.x >= p2.x ? 1 : -1, y: 0 }
  const c1 = { x: p1.x + a1.x * d, y: p1.y + a1.y * d }
  const c2 = { x: p2.x + a2.x * d, y: p2.y + a2.y * d }
  if (type === 'elbow') {
    return `M${p1.x},${p1.y} L${c1.x},${c1.y} L${c1.x},${(c1.y + c2.y) / 2} L${c2.x},${(c1.y + c2.y) / 2} L${c2.x},${c2.y} L${p2.x},${p2.y}`
  }
  // curve (default): leaves & arrives perpendicular to each block's facing side
  return `M${p1.x},${p1.y} C${c1.x},${c1.y} ${c2.x},${c2.y} ${p2.x},${p2.y}`
}

// rotate a vector by deg degrees (clockwise, screen axes)
export function rotate(dx: number, dy: number, deg: number): Pt {
  if (!deg) return { x: dx, y: dy }
  const r = (deg * Math.PI) / 180
  const c = Math.cos(r)
  const s = Math.sin(r)
  return { x: dx * c - dy * s, y: dx * s + dy * c }
}
// inverse: map a world/screen delta into a node's local (unrotated) frame
export const unrotate = (dx: number, dy: number, deg: number): Pt => rotate(dx, dy, -deg)

// a rough auto font-size for sticky notes (fits the box; overridable)
export function stickyFont(n: { w: number; h: number; text?: string; fontSize?: number }): number {
  if (n.fontSize) return n.fontSize
  const len = Math.max(1, (n.text || '').length)
  const byBox = Math.min(n.w, n.h) / 4.5
  const byLen = Math.sqrt((n.w * n.h) / (len * 1.6))
  return Math.max(11, Math.min(48, Math.round(Math.min(byBox, byLen))))
}

export const isLegacy = (n: CanvasNode) => n.type === 'text' || n.type === 'note' || n.type === 'image'

// ── Smart drawing — freehand shape recognition ────────────────────────────

function ptSegDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y)
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

// Douglas-Peucker: keep only the structurally important points
export function strokeSimplify(pts: Pt[], epsilon: number): Pt[] {
  if (pts.length <= 2) return [...pts]
  let maxD = 0, maxI = 0
  for (let i = 1; i < pts.length - 1; i++) {
    const d = ptSegDist(pts[i], pts[0], pts[pts.length - 1])
    if (d > maxD) { maxD = d; maxI = i }
  }
  if (maxD > epsilon) {
    return [
      ...strokeSimplify(pts.slice(0, maxI + 1), epsilon).slice(0, -1),
      ...strokeSimplify(pts.slice(maxI), epsilon),
    ]
  }
  return [pts[0], pts[pts.length - 1]]
}

function polyArea(pts: Pt[]): number {
  let a = 0
  for (let i = 0, n = pts.length; i < n; i++) {
    const j = (i + 1) % n
    a += pts[i].x * pts[j].y - pts[j].x * pts[i].y
  }
  return Math.abs(a * 0.5)
}

function vertexAngle(a: Pt, b: Pt, c: Pt): number {
  const v1x = a.x - b.x, v1y = a.y - b.y
  const v2x = c.x - b.x, v2y = c.y - b.y
  const mag = Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y)
  if (mag === 0) return 180
  return (Math.acos(Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y) / mag))) * 180) / Math.PI
}

export type SmartResult = { kind: 'shape'; shape: CanvasShape } | { kind: 'line' }

export function recognizeShape(rawPts: Pt[]): SmartResult | null {
  if (rawPts.length < 5) return null

  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const p of rawPts) {
    if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x
    if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y
  }
  const bw = x1 - x0, bh = y1 - y0
  const diag = Math.hypot(bw, bh)
  if (diag < 15) return null

  const simp = strokeSimplify(rawPts, diag * 0.06)
  const n = simp.length

  // Closed: first and last raw points are near each other
  const closeDist = Math.hypot(rawPts[0].x - rawPts[rawPts.length - 1].x, rawPts[0].y - rawPts[rawPts.length - 1].y)
  const isClosed = closeDist < diag * 0.25

  if (!isClosed) {
    // Straight line: all raw points stay close to the chord
    const maxDev = rawPts.slice(1, -1).reduce((mx, p) => Math.max(mx, ptSegDist(p, rawPts[0], rawPts[rawPts.length - 1])), 0)
    return maxDev / diag < 0.08 ? { kind: 'line' } : null
  }

  const fillRatio = bw * bh > 0 ? polyArea(simp) / (bw * bh) : 0

  // Ellipse: DP couldn't reduce to few corners → many points remain, shape is round
  if (n >= 6 && fillRatio > 0.60) return { kind: 'shape', shape: 'ellipse' }

  // Triangle: 3–4 simplified points
  if (n <= 4) return { kind: 'shape', shape: 'triangle' }

  // 4–6 points: rectangle vs diamond
  if (n <= 6) {
    const angles = simp.map((p, i) => vertexAngle(simp[(i - 1 + n) % n], p, simp[(i + 1) % n]))
    const allRight = angles.every((a) => Math.abs(a - 90) < 35)
    return { kind: 'shape', shape: allRight ? 'rect' : 'diamond' }
  }

  return fillRatio > 0.5 ? { kind: 'shape', shape: 'ellipse' } : null
}
