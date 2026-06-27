// Text → Canvas: turn a note's markdown into a tidy top-down mind-map (no AI).
// Note title = root, headings = branches (by # level), list items / paragraphs =
// leaves, all wired with parent→child connectors. The root is emitted as a live
// `note` card (when the note is saved) so the board auto-links back to the note
// in the knowledge graph via syncCanvasCards.
import type { CanvasNode, CanvasEdge, CanvasAlign } from '../types/models'
import { ACTIVE, MIN_ZOOM } from '../canvas/constants'

const uid = () => Math.random().toString(36).slice(2, 10)

// ── parse ────────────────────────────────────────────────────────────────────
interface TreeNode {
  text: string
  depth: number // hierarchy depth (root = 0)
  kind: 'root' | 'heading' | 'item'
  checked?: boolean
  children: TreeNode[]
  // assigned during layout:
  _w?: number
  _h?: number
  _cx?: number // subtree centre (world x)
  _font?: number
}

// strip inline markdown so the card shows clean text
function stripInline(s: string): string {
  return s
    .replace(/!\[\[([^\]]+)\]\]/g, '$1') // ![[embed]]
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, a, b) => b || a) // [[wiki|alias]]
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '') // ![img](src)
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // [link](url)
    .replace(/`([^`]+)`/g, '$1') // `code`
    .replace(/(\*\*|__)(.+?)\1/g, '$2') // **bold**
    .replace(/(\*|_)(.+?)\1/g, '$2') // *italic*
    .replace(/~~(.+?)~~/g, '$2') // ~~strike~~
    .replace(/\s+/g, ' ')
    .trim()
}

function parseTree(title: string, content: string): TreeNode {
  const root: TreeNode = { text: stripInline(title) || 'Заметка', depth: 0, kind: 'root', children: [] }
  const stack: TreeNode[] = [root]
  let lastHeadingDepth = 0
  let inFence = false
  let para: string[] = []

  // attach a node under the deepest open ancestor shallower than it
  const attach = (node: TreeNode) => {
    while (stack.length > 1 && stack[stack.length - 1].depth >= node.depth) stack.pop()
    stack[stack.length - 1].children.push(node)
    stack.push(node)
  }
  const flushPara = () => {
    if (!para.length) return
    const depth = lastHeadingDepth + 1
    const text = stripInline(para.join(' '))
    para = []
    if (text) attach({ text, depth, kind: 'item', children: [] })
  }

  for (const raw of (content || '').split('\n')) {
    const line = raw.replace(/\t/g, '  ')
    const trimmed = line.trim()
    if (/^```/.test(trimmed)) {
      flushPara()
      inFence = !inFence
      continue
    }
    if (inFence) continue
    if (!trimmed) {
      flushPara()
      continue
    }
    // table rows / horizontal rules → skip (not structural for a map)
    if (/^\|.*\|$/.test(trimmed) || /^([-*_])\1{2,}$/.test(trimmed)) {
      flushPara()
      continue
    }

    const h = trimmed.match(/^(#{1,6})\s+(.+)$/)
    if (h) {
      flushPara()
      const depth = h[1].length
      attach({ text: stripInline(h[2]), depth, kind: 'heading', children: [] })
      lastHeadingDepth = depth
      continue
    }

    const li = trimmed.match(/^(?:[-*+]|\d+[.)])\s+(.+)$/)
    if (li) {
      flushPara()
      let txt = li[1]
      let checked: boolean | undefined
      const cb = txt.match(/^\[([ xX])\]\s+(.*)$/)
      if (cb) {
        checked = cb[1].toLowerCase() === 'x'
        txt = cb[2]
      }
      const indent = line.match(/^ */)?.[0].length ?? 0
      const depth = lastHeadingDepth + 1 + Math.floor(indent / 2)
      const text = stripInline(txt)
      if (text || checked != null) attach({ text: text || '…', depth, kind: 'item', checked, children: [] })
      continue
    }

    // plain prose → buffered into a single paragraph card
    para.push(trimmed)
  }
  flushPara()
  return root
}

// ── layout (tidy top-down tree) ──────────────────────────────────────────────
const ROOT_W = 240
const ROOT_H = 130
const NODE_W = 190
const H_GAP = 34 // gap between sibling subtrees
const V_GAP = 64 // gap between depth levels
const SLOT = NODE_W + H_GAP

// branch palette — vivid + readable on both dark and light board
const PALETTE = ['#3A8BE0', '#46A758', '#E0609F', '#EC7E22', '#8453E8', '#1FAD9F', '#E5484D', '#F2C037']
const contrast = (hex: string): string => {
  const m = hex.replace('#', '')
  const r = parseInt(m.slice(0, 2), 16)
  const g = parseInt(m.slice(2, 4), 16)
  const b = parseInt(m.slice(4, 6), 16)
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#2a2018' : '#ffffff'
}

const headingFont = (depth: number) => Math.max(14, 20 - (depth - 1) * 2)

function estimateH(text: string, fontSize: number, minH: number): number {
  const padX = 12
  const padY = 10
  const avail = NODE_W - padX * 2
  const perLine = Math.max(6, Math.floor(avail / (fontSize * 0.55)))
  const lines = text.split('\n').reduce((a, l) => a + Math.max(1, Math.ceil(l.length / perLine)), 0)
  return Math.max(minH, Math.min(220, Math.round(lines * fontSize * 1.3) + padY * 2))
}

// pass 1: measure + place each node horizontally (centre over its children)
function measure(node: TreeNode, cursor: { x: number }) {
  if (node.kind === 'root') {
    node._w = ROOT_W
    node._h = ROOT_H
  } else if (node.kind === 'heading') {
    node._font = headingFont(node.depth)
    node._w = NODE_W
    node._h = estimateH(node.text, node._font, 40)
  } else {
    node._font = 14
    node._w = NODE_W
    node._h = estimateH(node.text, 14, 36)
  }
  if (!node.children.length) {
    node._cx = cursor.x + SLOT / 2
    cursor.x += SLOT
    return
  }
  for (const c of node.children) measure(c, cursor)
  node._cx = (node.children[0]._cx! + node.children[node.children.length - 1]._cx!) / 2
}

export interface MindMap {
  nodes: CanvasNode[]
  edges: CanvasEdge[]
  viewport: { x: number; y: number; k: number }
}

/** Build a mind-map (nodes + connectors + a fitted viewport) from a note. */
export function buildMindMap(note: { id: number | null; title: string; content: string }): MindMap {
  const root = parseTree(note.title, note.content)
  measure(root, { x: 0 })

  // depth → world Y (compact: skipped levels don't leave gaps)
  const all: TreeNode[] = []
  ;(function collect(n: TreeNode) {
    all.push(n)
    n.children.forEach(collect)
  })(root)
  const depthY = new Map<number, number>()
  let y = 0
  for (const d of [...new Set(all.map((n) => n.depth))].sort((a, b) => a - b)) {
    depthY.set(d, y)
    y += Math.max(...all.filter((n) => n.depth === d).map((n) => n._h!)) + V_GAP
  }

  const nodes: CanvasNode[] = []
  const edges: CanvasEdge[] = []

  const emit = (node: TreeNode, parentId: string | null, branch: string | null) => {
    const id = uid()
    const x = node._cx! - node._w! / 2
    const ny = depthY.get(node.depth)!
    if (node.kind === 'root') {
      if (note.id != null) {
        nodes.push({ id, type: 'note', x, y: ny, w: node._w!, h: node._h!, noteId: note.id, color: ACTIVE })
      } else {
        nodes.push({ id, type: 'text', x, y: ny, w: node._w!, h: node._h!, text: node.text, fontSize: 20, bold: true, align: 'center', autoWidth: false, fill: ACTIVE, textColor: '#ffffff', radius: 12 })
      }
    } else if (node.kind === 'heading') {
      const col = branch || ACTIVE
      nodes.push({ id, type: 'text', x, y: ny, w: node._w!, h: node._h!, text: node.text, fontSize: node._font, bold: true, align: 'center' as CanvasAlign, autoWidth: false, fill: col, textColor: contrast(col), radius: 10 })
    } else {
      const col = branch || ACTIVE
      nodes.push({ id, type: 'text', x, y: ny, w: node._w!, h: node._h!, text: node.text, fontSize: 14, align: 'left' as CanvasAlign, autoWidth: false, stroke: col, strokeWidth: 1.5, radius: 8, strike: node.checked || undefined, textColor: node.checked ? 'rgb(var(--ink-500))' : undefined })
    }
    if (parentId) {
      edges.push({ id: uid(), from: parentId, to: id, fromAnchor: 'b', toAnchor: 't', type: 'curve', arrow: 'none', color: branch || ACTIVE, width: 2 })
    }
    node.children.forEach((c, i) => emit(c, id, node.kind === 'root' ? PALETTE[i % PALETTE.length] : branch))
  }
  emit(root, null, null)

  // fit the whole tree into a nominal viewport (screen = world*k + cam)
  const minX = Math.min(...nodes.map((n) => n.x))
  const maxX = Math.max(...nodes.map((n) => n.x + n.w))
  const minY = Math.min(...nodes.map((n) => n.y))
  const maxY = Math.max(...nodes.map((n) => n.y + n.h))
  const bw = Math.max(1, maxX - minX)
  const bh = Math.max(1, maxY - minY)
  const VW = 1180
  const VH = 720
  const PAD = 90
  const k = Math.max(MIN_ZOOM, Math.min(1, (VW - 2 * PAD) / bw, (VH - 2 * PAD) / bh))
  const viewport = { k, x: (VW - bw * k) / 2 - minX * k, y: (VH - bh * k) / 2 - minY * k }

  return { nodes, edges, viewport }
}
