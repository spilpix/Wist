import type { CanvasEdge, CanvasNode, CanvasShape } from '../types/models'
import type { TKey } from '../i18n'
import { SHAPE_DEFAULT_FILL, STICKY_COLORS } from './constants'

export interface CanvasTemplate {
  id: string
  nameKey: TKey
  descKey: TKey
  icon: string // lucide icon name resolved by the picker (keeps this module JSX-free)
  build: (uid: () => string) => { nodes: CanvasNode[]; edges: CanvasEdge[] }
}

// ── tiny builders ────────────────────────────────────────────────────────────
const C = STICKY_COLORS
const sticky = (id: string, x: number, y: number, text: string, fill: string, w = 200, h = 200): CanvasNode => ({ id, type: 'sticky', x, y, w, h, fill, text })
const heading = (id: string, x: number, y: number, text: string, fontSize = 28): CanvasNode => ({ id, type: 'text', x, y, w: 360, h: 44, text, fontSize, bold: true, autoWidth: false })
const frame = (id: string, x: number, y: number, w: number, h: number, title: string): CanvasNode => ({ id, type: 'frame', x, y, w, h, text: title })
const shape = (id: string, x: number, y: number, w: number, h: number, s: CanvasShape, text: string): CanvasNode => ({
  id,
  type: 'shape',
  x,
  y,
  w,
  h,
  shape: s,
  fill: SHAPE_DEFAULT_FILL,
  stroke: null,
  strokeWidth: 0,
  radius: s === 'roundRect' ? 16 : 0,
  text,
})
const link = (id: string, from: string, to: string, type: CanvasEdge['type'] = 'curve'): CanvasEdge => ({ id, from, to, type, arrow: 'end' })

export const CANVAS_TEMPLATES: CanvasTemplate[] = [
  // ── intelligence map: a centre node with connected branches ──────────────────
  {
    id: 'mindmap',
    nameKey: 'canvas.tpl.mindmap',
    descKey: 'canvas.tpl.mindmapDesc',
    icon: 'Share2',
    build: (uid) => {
      const c = uid()
      const branches = [
        { x: 250, y: 110, t: 'Ветка 1', f: C[2] },
        { x: 660, y: 130, t: 'Ветка 2', f: C[5] },
        { x: 730, y: 340, t: 'Ветка 3', f: C[8] },
        { x: 560, y: 540, t: 'Ветка 4', f: C[4] },
        { x: 210, y: 460, t: 'Ветка 5', f: C[1] },
      ]
      const nodes: CanvasNode[] = [sticky(c, 430, 300, 'Центральная идея', C[0], 210, 150)]
      const edges: CanvasEdge[] = []
      for (const b of branches) {
        const id = uid()
        nodes.push(sticky(id, b.x, b.y, b.t, b.f, 170, 110))
        edges.push(link(uid(), c, id))
      }
      return { nodes, edges }
    },
  },

  // ── brainstorm: a prompt + a loose grid of blank idea notes ───────────────────
  {
    id: 'brainstorm',
    nameKey: 'canvas.tpl.brainstorm',
    descKey: 'canvas.tpl.brainstormDesc',
    icon: 'Lightbulb',
    build: (uid) => {
      const f = uid()
      const nodes: CanvasNode[] = [frame(f, 60, 90, 880, 460, 'Мозговой штурм'), sticky(uid(), 100, 140, '❓ О чём думаем?', C[0], 220, 130)]
      const slots = [
        [360, 140],
        [600, 140],
        [780, 140],
        [100, 320],
        [360, 320],
        [600, 320],
        [780, 320],
      ]
      slots.forEach(([x, y], i) => nodes.push(sticky(uid(), x, y, '', C[(i + 2) % C.length], 150, 150)))
      return { nodes, edges: [] }
    },
  },

  // ── kanban: three columns ─────────────────────────────────────────────────────
  {
    id: 'kanban',
    nameKey: 'canvas.tpl.kanban',
    descKey: 'canvas.tpl.kanbanDesc',
    icon: 'Columns3',
    build: (uid) => {
      const cols = [
        { x: 80, title: 'Сделать', fill: C[2], notes: ['Задача A', 'Задача B'] },
        { x: 410, title: 'В работе', fill: C[1], notes: ['Задача C'] },
        { x: 740, title: 'Готово', fill: C[8], notes: ['Задача D'] },
      ]
      const nodes: CanvasNode[] = []
      for (const col of cols) {
        nodes.push(frame(uid(), col.x, 100, 290, 520, col.title))
        col.notes.forEach((nt, i) => nodes.push(sticky(uid(), col.x + 25, 150 + i * 120, nt, col.fill, 240, 100)))
      }
      return { nodes, edges: [] }
    },
  },

  // ── flowchart: start → step → decision → two outcomes ─────────────────────────
  {
    id: 'flow',
    nameKey: 'canvas.tpl.flow',
    descKey: 'canvas.tpl.flowDesc',
    icon: 'GitBranch',
    build: (uid) => {
      const start = uid()
      const step = uid()
      const dec = uid()
      const a = uid()
      const b = uid()
      const nodes: CanvasNode[] = [
        shape(start, 400, 60, 180, 80, 'ellipse', 'Старт'),
        shape(step, 400, 210, 180, 90, 'roundRect', 'Шаг 1'),
        shape(dec, 400, 360, 180, 120, 'diamond', 'Решение?'),
        shape(a, 180, 560, 180, 90, 'roundRect', 'Вариант А'),
        shape(b, 600, 560, 180, 90, 'roundRect', 'Вариант Б'),
      ]
      const edges: CanvasEdge[] = [link(uid(), start, step, 'elbow'), link(uid(), step, dec, 'elbow'), link(uid(), dec, a, 'elbow'), link(uid(), dec, b, 'elbow')]
      return { nodes, edges }
    },
  },

  // ── weekly plan: seven day columns ────────────────────────────────────────────
  {
    id: 'week',
    nameKey: 'canvas.tpl.week',
    descKey: 'canvas.tpl.weekDesc',
    icon: 'CalendarDays',
    build: (uid) => {
      const days = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
      const nodes: CanvasNode[] = [heading(uid(), 60, 36, 'План недели')]
      days.forEach((d, i) => nodes.push(frame(uid(), 60 + i * 165, 100, 150, 470, d)))
      nodes.push(sticky(uid(), 78, 150, '', C[0], 116, 90))
      return { nodes, edges: [] }
    },
  },

  // ── retro: keep / improve / actions ───────────────────────────────────────────
  {
    id: 'retro',
    nameKey: 'canvas.tpl.retro',
    descKey: 'canvas.tpl.retroDesc',
    icon: 'ListChecks',
    build: (uid) => {
      const cols = [
        { x: 60, title: '👍 Что хорошо', fill: C[8] },
        { x: 420, title: '👎 Что улучшить', fill: C[2] },
        { x: 780, title: '✅ Действия', fill: C[5] },
      ]
      const nodes: CanvasNode[] = [heading(uid(), 60, 36, 'Ретроспектива')]
      for (const col of cols) {
        nodes.push(frame(uid(), col.x, 100, 320, 460, col.title))
        nodes.push(sticky(uid(), col.x + 25, 150, '', col.fill, 270, 110))
      }
      return { nodes, edges: [] }
    },
  },
]
