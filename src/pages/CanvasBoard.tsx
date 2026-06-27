import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Download,
  Eye,
  EyeOff,
  FileText,
  Frame as FrameIcon,
  Grid3x3,
  Image as ImageIcon,
  ListTree,
  Magnet,
  Map as MapIcon,
  Maximize2,
  Minus,
  Plus,
  Ruler as RulerIcon,
  Search,
  Square,
  StickyNote,
  Type as TypeIcon,
  Sparkles,
  Share2,
  Lightbulb,
  Columns3,
  GitBranch,
  CalendarDays,
  ListChecks,
  Timer as TimerIcon,
  X,
} from 'lucide-react'
import Spinner from '../components/ui/Spinner'
import Modal from '../components/ui/Modal'
import { physKey } from '../lib/keyboard'
import { useElementSize } from '../lib/useElementSize'
import Button from '../components/ui/Button'
import { toast } from '../store/toastStore'
import type { CanvasAnchor, CanvasConnectorType, CanvasData, CanvasEdge, CanvasGuide, CanvasNode, Note, Task } from '../types/models'
import { useTabTitle } from '../store/tabStore'
import { useI18n } from '../i18n'
import {
  ACTIVE,
  ACTIVE_RGB,
  CONN_GAP,
  DEFAULTS,
  GRID,
  MAX_ZOOM,
  MIN_ZOOM,
  GUIDE_COLOR,
  getCanvasAuthor,
  ROUND_RECT_RADIUS,
  RULER_SIZE,
  SHAPE_DEFAULT_FILL,
  STICKY_COLORS,
  maxRadius,
  supportsRadius,
  type ToolKey,
} from '../canvas/constants'
import {
  anchorNormal,
  anchorPoint,
  bbox,
  type Box,
  boxesIntersect,
  boxIntersectsPolygon,
  center,
  connectorPath,
  nearestAnchor,
  nodeAABB,
  pointInBox,
  type Pt,
  recognizeShape,
  rotate,
  sideToward,
  snap as snapTo,
  snapToObjects,
  unrotate,
} from '../canvas/geometry'
import { useHistory } from '../canvas/history'
import NodeView from '../canvas/NodeView'
import ConnectorView from '../canvas/ConnectorView'
import BottomToolbar, { type PenStyle } from '../canvas/BottomToolbar'
import ContextToolbar from '../canvas/ContextToolbar'
import Minimap from '../canvas/Minimap'
import FramesPanel from '../canvas/FramesPanel'
import CommentThread from '../canvas/CommentThread'
import GridCanvas from '../canvas/GridCanvas'
import Rulers from '../canvas/Rulers'
import AutoWidthInput from '../canvas/AutoWidthInput'
import { buildPdf } from '../canvas/pdf'
import FocusTimer from '../canvas/FocusTimer'
import Relations from '../components/Relations'
import { useUiStore } from '../store/uiStore'
import { baseName, dragHasDroppable, isImagePath, readMediaDrag } from '../lib/mediaDrag'
import { CANVAS_TEMPLATES, type CanvasTemplate } from '../canvas/templates'
import { HANDLES, SIDE_HANDLES, SIDE_ANCHORS, type Sign } from '../canvas/boardGeometry'
import { TopBtn, MenuItem, SelectionFrame, LinkModal } from '../canvas/BoardParts'
import { sigOf, useCanvasPersistence } from '../canvas/persistence'
import { useCanvasExport } from '../canvas/useCanvasExport'
import { useViewport } from '../canvas/useViewport'
import { useSelection } from '../canvas/useSelection'
import { getCanvas, captureCanvas, saveCanvasExport } from '../data/canvas'
import { listNotes } from '../data/notes'
import { listTasks, updateTask } from '../data/tasks'
import { useCanvasDrag, type Drag, type ConnectFrom } from '../canvas/useCanvasDrag'

const uid = () => Math.random().toString(36).slice(2, 10)

// lucide icons referenced by template definitions (keeps templates.ts JSX-free)
const TPL_ICONS: Record<string, typeof Sparkles> = { Share2, Lightbulb, Columns3, GitBranch, CalendarDays, ListChecks }

// sigOf + the autosave lifecycle live in ../canvas/persistence

// Sign / HANDLES / SIDE_HANDLES / SIDE_ANCHORS now live in ../canvas/boardGeometry

// Drag + ConnectFrom types live in ../canvas/useCanvasDrag (the drag state machine)


export default function CanvasBoard() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const { id } = useParams()
  const canvasId = Number(id)

  const [name, setName] = useState('')
  useTabTitle(name)
  const hist = useHistory({ nodes: [], edges: [] })
  const data = hist.data
  const [tool, setTool] = useState<ToolKey>('select')
  const [shape, setShape] = useState<CanvasNode['shape']>('rect')
  const [connType, setConnType] = useState<CanvasConnectorType>('curve') // style for new connectors
  const [penStyle, setPenStyle] = useState<PenStyle>({ kind: 'pen', size: 3, color: '' })
  const [stickyFill, setStickyFill] = useState(STICKY_COLORS[0])
  // selection model (selected nodes + ref · selected edge · editing · hover) → ../canvas/useSelection
  const { sel, setSel, selRef, selEdge, setSelEdge, editing, setEditing, hover, setHover } = useSelection()
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [connectCur, setConnectCur] = useState<Pt | null>(null)
  // a connector dropped on empty canvas → a small menu offering to create & wire a node
  const [connectMenu, setConnectMenu] = useState<{ sx: number; sy: number; from: ConnectFrom; at: Pt } | null>(null)
  // a connector waiting on the note picker (chose "add note from vault")
  const [pendingConnect, setPendingConnect] = useState<{ from: ConnectFrom; at: Pt } | null>(null)
  const [penDraft, setPenDraft] = useState<Pt[] | null>(null)
  const [lassoDraft, setLassoDraft] = useState<Pt[] | null>(null)
  const [space, setSpace] = useState(false)
  const [grid, setGrid] = useState<'dots' | 'lines' | 'none'>('dots')
  const [snap, setSnap] = useState(false) // grid-snap off by default — smooth drag; objects still snap to each other
  const [menu, setMenu] = useState<{ x: number; y: number; world: Pt; onNode: boolean } | null>(null)
  const [linkOpen, setLinkOpen] = useState(false)
  const [ready, setReady] = useState(false)
  const [present, setPresent] = useState<number | null>(null)
  const [openComment, setOpenComment] = useState<string | null>(null)
  const [showResolved, setShowResolved] = useState(false)
  const [cropping, setCropping] = useState<string | null>(null)
  const [cropRect, setCropRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [minimapOpen, setMinimapOpen] = useState(false)
  const [guides, setGuides] = useState<{ vx: number[]; hy: number[] } | null>(null)
  const [dropFrame, setDropFrame] = useState<string | null>(null) // frame highlighted as the drop target mid-drag
  const [dndOver, setDndOver] = useState(false) // a media/file drag from another section is hovering the board
  const [showRulers, setShowRulers] = useState(true)
  const [search, setSearch] = useState<string | null>(null) // find-on-board (Ctrl+F); null = closed
  const [searchIdx, setSearchIdx] = useState(-1) // match the camera is parked on (-1 = none yet)
  const [templatesDismissed, setTemplatesDismissed] = useState(false) // hide the empty-board starter
  const [outlineOpen, setOutlineOpen] = useState(false) // table-of-contents panel
  const [timerOpen, setTimerOpen] = useState(false) // focus/pomodoro timer
  const [relationsOpen, setRelationsOpen] = useState(false) // edge-backed relations panel
  const [guideDraft, setGuideDraft] = useState<CanvasGuide | null>(null) // live ruler-guide being dragged
  const [ctxSize, setCtxSize] = useState({ w: 0, h: 0 }) // measured floating-toolbar size → used to clamp it on-screen

  const [notes, setNotes] = useState<Note[]>([])
  const [notePicker, setNotePicker] = useState(false)
  const [tasks, setTasks] = useState<Task[]>([])
  const [taskPicker, setTaskPicker] = useState(false)

  const boardRef = useRef<HTMLDivElement>(null)
  const ctxRef = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag>(null)
  // camera/viewport (cam + camRef + zoom/fit/pan) lives in ../canvas/useViewport
  const getNodes = useCallback(() => hist.get().nodes, [hist])
  const { cam, setCam, camRef, toWorld, toScreen, cancelCamAnim, animateCamTo, zoomAt, zoomCenter, fitBox, animateToBox, fit } =
    useViewport({ boardRef, getNodes })
  const toolRef = useRef(tool)
  toolRef.current = tool
  const clip = useRef<{ nodes: CanvasNode[]; edges: CanvasEdge[] }>({ nodes: [], edges: [] })
  const readyRef = useRef(false)
  const baseline = useRef('')
  const camBeforePresent = useRef(cam)
  const lastTap = useRef<{ id: string; t: number }>({ id: '', t: 0 })
  const editStart = useRef(0)
  const latest = useRef<{ id: number; data: CanvasData; name: string; cam: typeof cam }>({ id: canvasId, data, name, cam })
  // board element size (drives the infinite grid canvas) — measured once the board is ready
  const boardSize = useElementSize(boardRef, ready)
  latest.current = { id: canvasId, data, name, cam }

  // autosave lifecycle (persist + debounced save + flush-on-leave + 30s net) → ../canvas/persistence
  useCanvasPersistence({ canvasId, name, data, cam, present, latest, readyRef, baseline })

  // ── load ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true
    readyRef.current = false
    setReady(false)
    setSel(new Set())
    setSelEdge(null)
    setEditing(null)
    setPresent(null)
    setOpenComment(null)
    setConnectMenu(null)
    setPendingConnect(null)
    setTemplatesDismissed(false)
    setSearch(null)
    getCanvas(canvasId)
      .then((c) => {
        if (!alive) return
        if (c) {
          const d = { nodes: c.data.nodes, edges: c.data.edges, guides: c.data.guides ?? [] }
          const vp = c.data.viewport
          const cm = vp ? { x: vp.x, y: vp.y, k: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, vp.k)) } : { x: 200, y: 140, k: 1 }
          setName(c.name)
          hist.reset(d)
          setCam(cm)
          baseline.current = sigOf(canvasId, c.name, d, cm)
        }
        readyRef.current = true
        setReady(true)
      })
      .catch(() => {
        if (!alive) return
        readyRef.current = true
        setReady(true)
      })
    listNotes({})
      .then((n) => alive && setNotes(n))
      .catch(() => {})
    listTasks({})
      .then((tk) => alive && setTasks(tk))
      .catch(() => {})
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasId])


  // measure the floating context toolbar so it can be clamped on-screen (guarded → no loop)
  useLayoutEffect(() => {
    const el = ctxRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    if (Math.abs(r.width - ctxSize.w) > 1 || Math.abs(r.height - ctxSize.h) > 1) setCtxSize({ w: r.width, h: r.height })
  })

  // ── frame auto-layout: stack children + hug their content ───────────────────────
  // Opt-in per frame (n.autoLayout). Runs after any node change, EXCEPT mid-drag, and
  // only writes when something actually differs → reaches a fixed point (no loop, no
  // history spam). Text auto-height feeds straight in, so the frame adapts as you type.
  useEffect(() => {
    if (drag.current) return
    const d = hist.get()
    if (!d.nodes.some((n) => n.type === 'frame' && n.autoLayout)) return
    let changed = false
    const next = d.nodes.map((n) => ({ ...n }))
    for (const f of next) {
      if (f.type !== 'frame' || !f.autoLayout) continue
      const { dir, gap, pad } = f.autoLayout
      // members: stored frameId OR geometrically inside (so it "just works" without a drag)
      const kids = next.filter((c) => c.id !== f.id && c.type !== 'frame' && (c.frameId === f.id || pointInBox(center(c), f)))
      if (!kids.length) continue
      kids.sort((a, b) => (dir === 'v' ? a.y - b.y : a.x - b.x))
      let cursor = pad
      let cross = 0
      for (const c of kids) {
        const tx = dir === 'v' ? f.x + pad : f.x + cursor
        const ty = dir === 'v' ? f.y + cursor : f.y + pad
        if (Math.abs(c.x - tx) > 0.5 || Math.abs(c.y - ty) > 0.5) {
          c.x = tx
          c.y = ty
          changed = true
        }
        cursor += (dir === 'v' ? c.h : c.w) + gap
        cross = Math.max(cross, dir === 'v' ? c.w : c.h)
      }
      cursor -= gap // drop the trailing gap
      const fw = Math.round(dir === 'v' ? cross + pad * 2 : cursor + pad * 2)
      const fh = Math.round(dir === 'v' ? cursor + pad * 2 : cross + pad * 2)
      if (Math.abs(f.w - fw) > 0.5 || Math.abs(f.h - fh) > 0.5) {
        f.w = fw
        f.h = fh
        changed = true
      }
    }
    if (changed) hist.live(() => ({ ...d, nodes: next }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.nodes])

  // a board is a focused workspace — collapse the sidebar while here, restore on leave
  useEffect(() => {
    const prev = useUiStore.getState().sidebarCollapsed
    useUiStore.setState({ sidebarCollapsed: true })
    return () => useUiStore.setState({ sidebarCollapsed: prev })
  }, [])

  const noteById = useMemo(() => new Map(notes.map((n) => [n.id, n])), [notes])
  const taskById = useMemo(() => new Map(tasks.map((tk) => [tk.id, tk])), [tasks])
  const nodesById = useMemo(() => new Map(data.nodes.map((n) => [n.id, n])), [data.nodes])
  const selNodes = useMemo(() => data.nodes.filter((n) => sel.has(n.id)), [data.nodes, sel])
  const frames = useMemo(() => data.nodes.filter((n) => n.type === 'frame'), [data.nodes])
  const frameLabelOf = (fid: string) => frames.findIndex((f) => f.id === fid) + 1

  // nodes to render: in present mode only the current frame + its children; hide resolved comments
  const visible = useMemo(() => {
    let ns = data.nodes
    if (present != null && frames[present]) {
      const f = frames[present]
      // membership by stored frameId OR geometric containment (robust to undragged nodes)
      ns = data.nodes.filter((n) => n.id === f.id || n.frameId === f.id || (n.type !== 'frame' && pointInBox(center(n), f)))
    }
    return ns.filter((n) => !(n.type === 'comment' && n.resolved && !showResolved))
  }, [data.nodes, present, frames, showResolved])

  // topmost node under a world point — non-frames win over frames
  const nodeAt = useCallback((w: Pt): CanvasNode | undefined => {
    const ns = hist.get().nodes
    for (let i = ns.length - 1; i >= 0; i--) if (ns[i].type !== 'frame' && pointInBox(w, ns[i])) return ns[i]
    for (let i = ns.length - 1; i >= 0; i--) if (ns[i].type === 'frame' && pointInBox(w, ns[i])) return ns[i]
    return undefined
  }, [hist])

  // innermost (smallest-area) frame whose box contains a node's centre
  const frameContaining = (node: CanvasNode, nodes: CanvasNode[]): string | null => {
    const c = center(node)
    let best: CanvasNode | null = null
    for (const f of nodes)
      if (f.type === 'frame' && f.id !== node.id && pointInBox(c, f) && (!best || f.w * f.h < best.w * best.h)) best = f
    return best ? best.id : null
  }

  // ── presentation ───────────────────────────────────────────────────────────────
  const enterPresent = () => {
    if (!frames.length) return
    camBeforePresent.current = camRef.current
    setSel(new Set())
    setSelEdge(null)
    setOpenComment(null)
    setMenu(null)
    setPresent(0)
    fitBox(frames[0], 24)
  }
  const presentGo = (i: number) => {
    if (!frames.length) return
    const n = Math.max(0, Math.min(frames.length - 1, i))
    setPresent(n)
    fitBox(frames[n], 24)
  }
  const exitPresent = () => {
    setCam(camBeforePresent.current)
    setPresent(null)
  }

  // board export (PNG of board/frame · multi-frame PDF) → ../canvas/useCanvasExport
  const { exportMenu, setExportMenu, exporting, exportPng, exportPdf } = useCanvasExport({
    boardRef, name, frames, selRef, setSel, setSelEdge, setOpenComment, fit, fitBox, t,
  })

  // ── mutators ──────────────────────────────────────────────────────────────────
  const patchSelected = (patch: Partial<CanvasNode>) =>
    hist.commit((d) => ({ ...d, nodes: d.nodes.map((n) => (sel.has(n.id) ? { ...n, ...patch } : n)) }))

  // text auto-height: layout consequence, not a user action — update live (no undo entry)
  const autoHeight = useCallback(
    (id: string, h: number) => hist.live((d) => ({ ...d, nodes: d.nodes.map((n) => (n.id === id ? { ...n, h } : n)) })),
    [hist]
  )
  // auto-width text: the box hugs the content on both axes (layout consequence — live)
  const autoSize = useCallback(
    (id: string, w: number, h: number) => hist.live((d) => ({ ...d, nodes: d.nodes.map((n) => (n.id === id ? { ...n, w, h } : n)) })),
    [hist]
  )

  // enter text-edit on a node; editStart guards against the immediate spurious
  // blur (focus race) that would otherwise close the editor the instant it opens
  const startEdit = (id: string) => {
    editStart.current = Date.now()
    hist.begin()
    setEditing(id)
  }

  const addNode = (partial: Omit<CanvasNode, 'id'>): string => {
    const nid = uid()
    // auto-assign frame membership at creation so nodes drawn inside a frame
    // belong to it (move together, appear in presentation) without a drag
    let frameId = partial.frameId
    if (frameId === undefined && partial.type !== 'frame') frameId = frameContaining({ ...partial, id: nid } as CanvasNode, hist.get().nodes)
    hist.commit((d) => ({ ...d, nodes: [...d.nodes, { ...partial, id: nid, frameId }] }))
    return nid
  }

  // insert several nodes in a SINGLE history step (one undo removes them all) — used by
  // paste-from-clipboard and templates so a bulk add isn't N separate undo entries
  const batchAdd = (partials: Omit<CanvasNode, 'id'>[]): string[] => {
    const cur = hist.get().nodes
    const made = partials.map((p) => {
      const nid = uid()
      const frameId = p.frameId === undefined && p.type !== 'frame' ? frameContaining({ ...p, id: nid } as CanvasNode, cur) : p.frameId
      return { ...p, id: nid, frameId } as CanvasNode
    })
    hist.commit((d) => ({ ...d, nodes: [...d.nodes, ...made] }))
    return made.map((m) => m.id)
  }

  const deleteSelected = () => {
    if (selEdge) {
      hist.commit((d) => ({ ...d, edges: d.edges.filter((e) => e.id !== selEdge) }))
      setSelEdge(null)
      return
    }
    if (!sel.size) return
    hist.commit((d) => {
      const removed = sel
      const deletedFrames = new Set(d.nodes.filter((n) => removed.has(n.id) && n.type === 'frame').map((n) => n.id))
      return {
        nodes: d.nodes
          .filter((n) => !removed.has(n.id))
          .map((n) => (n.frameId && deletedFrames.has(n.frameId) ? { ...n, frameId: null } : n)),
        edges: d.edges.filter((e) => !removed.has(e.from) && !removed.has(e.to)),
        viewport: d.viewport,
      }
    })
    setSel(new Set())
    setEditing(null)
    setOpenComment(null)
  }

  const duplicateSelected = () => {
    const s = selRef.current
    if (!s.size) return
    const cur = hist.get()
    const map = new Map<string, string>()
    const clones = cur.nodes
      .filter((n) => s.has(n.id))
      .map((n) => {
        const nid = uid()
        map.set(n.id, nid)
        return { ...n, id: nid, x: n.x + 24, y: n.y + 24 }
      })
    // re-map frame membership among the cloned set; drop links to non-cloned frames
    for (const c of clones) c.frameId = c.frameId && map.has(c.frameId) ? map.get(c.frameId)! : null
    const newEdges = cur.edges
      .filter((e) => map.has(e.from) && map.has(e.to))
      .map((e) => ({ ...e, id: uid(), from: map.get(e.from)!, to: map.get(e.to)! }))
    hist.commit((d) => ({ ...d, nodes: [...d.nodes, ...clones], edges: [...d.edges, ...newEdges] }))
    setSel(new Set(clones.map((c) => c.id)))
    setSelEdge(null)
  }

  const copySelected = () => {
    const s = selRef.current
    const cur = hist.get()
    const nodes = cur.nodes.filter((n) => s.has(n.id))
    const ids = new Set(nodes.map((n) => n.id))
    const edges = cur.edges.filter((e) => ids.has(e.from) && ids.has(e.to))
    clip.current = { nodes: nodes.map((n) => ({ ...n })), edges: edges.map((e) => ({ ...e })) }
  }
  const paste = (at?: Pt) => {
    const { nodes, edges } = clip.current
    if (!nodes.length) return
    const b = bbox(nodes)!
    const target = at ?? { x: b.x + 32, y: b.y + 32 }
    const dx = target.x - b.x
    const dy = target.y - b.y
    const map = new Map<string, string>()
    const clones = nodes.map((n) => {
      const nid = uid()
      map.set(n.id, nid)
      return { ...n, id: nid, x: n.x + dx, y: n.y + dy }
    })
    for (const c of clones) c.frameId = c.frameId && map.has(c.frameId) ? map.get(c.frameId)! : null
    const newEdges = edges.map((e) => ({ ...e, id: uid(), from: map.get(e.from)!, to: map.get(e.to)! }))
    hist.commit((d) => ({ ...d, nodes: [...d.nodes, ...clones], edges: [...d.edges, ...newEdges] }))
    setSel(new Set(clones.map((c) => c.id)))
    setSelEdge(null)
  }

  // Figma "wrap in auto-layout" (Shift+A): build a frame around the selection, make
  // its members, and turn on auto-layout — the reflow effect then stacks + hugs them.
  const wrapAutoLayout = () => {
    const s = selRef.current
    const items = hist.get().nodes.filter((n) => s.has(n.id) && n.type !== 'frame')
    if (!items.length) return
    const b = bbox(items.map(nodeAABB))
    if (!b) return
    const pad = 24
    const fid = uid()
    const frame: CanvasNode = { id: fid, type: 'frame', x: b.x - pad, y: b.y - pad, w: b.w + pad * 2, h: b.h + pad * 2, text: '', autoLayout: { dir: 'v', gap: 16, pad } }
    hist.commit((d) => ({
      ...d,
      nodes: [frame, ...d.nodes.map((n) => (s.has(n.id) && n.type !== 'frame' ? { ...n, frameId: fid } : n))],
    }))
    setSel(new Set([fid]))
    setSelEdge(null)
  }

  // Mind-map quick-grow (Tab): spawn a connected child to the right of the selected node,
  // nudging it down past anything already sitting there, then drop straight into editing.
  const addChildOf = (parentId: string, dir: 'right' | 'down') => {
    const cur = hist.get().nodes
    const parent = cur.find((n) => n.id === parentId)
    if (!parent || parent.type === 'frame' || parent.type === 'comment' || parent.type === 'pen' || parent.type === 'image') return
    const mirror = parent.type === 'sticky' || parent.type === 'text' || parent.type === 'shape'
    const w = mirror ? parent.w : DEFAULTS.sticky.w
    const h = mirror ? parent.h : DEFAULTS.sticky.h
    let x = dir === 'right' ? parent.x + parent.w + 80 : parent.x
    let y = dir === 'right' ? parent.y + (parent.h - h) / 2 : parent.y + parent.h + 56
    const others = cur.filter((n) => n.id !== parentId).map(nodeAABB)
    let guard = 0
    while (others.some((o) => boxesIntersect({ x, y, w, h }, o)) && guard++ < 240) y += h + 24
    let child: Omit<CanvasNode, 'id'>
    if (parent.type === 'text') child = { type: 'text', x, y, w, h, text: '', autoWidth: parent.autoWidth }
    else if (parent.type === 'shape')
      child = { type: 'shape', x, y, w, h, shape: parent.shape, fill: parent.fill ?? SHAPE_DEFAULT_FILL, stroke: parent.stroke ?? null, strokeWidth: parent.strokeWidth ?? 0, radius: parent.radius, text: '' }
    else child = { type: 'sticky', x, y, w, h, fill: parent.fill || stickyFill, text: '', author: getCanvasAuthor() || undefined, createdAt: Date.now() }
    const nid = uid()
    const frameId = frameContaining({ ...child, id: nid } as CanvasNode, cur)
    const edge: CanvasEdge = { id: uid(), from: parentId, to: nid, type: connType, arrow: 'end' }
    hist.commit((d) => ({ ...d, nodes: [...d.nodes, { ...child, id: nid, frameId }], edges: [...d.edges, edge] }))
    setSel(new Set([nid]))
    setSelEdge(null)
    startEdit(nid)
  }

  const layer = (op: 'front' | 'back' | 'forward' | 'backward') =>
    hist.commit((d) => {
      const ns = [...d.nodes]
      const picked = ns.filter((n) => sel.has(n.id))
      const rest = ns.filter((n) => !sel.has(n.id))
      if (op === 'front') return { ...d, nodes: [...rest, ...picked] }
      if (op === 'back') return { ...d, nodes: [...picked, ...rest] }
      const idxs = ns.map((n, i) => ({ n, i })).filter((x) => sel.has(x.n.id))
      const dir = op === 'forward' ? 1 : -1
      const order = dir === 1 ? [...idxs].reverse() : idxs
      const arr = [...ns]
      for (const { i } of order) {
        const j = i + dir
        if (j < 0 || j >= arr.length || sel.has(arr[j].id)) continue
        ;[arr[i], arr[j]] = [arr[j], arr[i]]
      }
      return { ...d, nodes: arr }
    })

  const toggleLock = () => {
    const allLocked = selNodes.every((n) => n.locked)
    patchSelected({ locked: !allLocked })
  }

  const align = (dir: 'l' | 'cx' | 'r' | 't' | 'cy' | 'b') => {
    const b = bbox(selNodes.filter((n) => !n.locked))
    if (!b) return
    hist.commit((d) => ({
      ...d,
      nodes: d.nodes.map((n) => {
        if (!sel.has(n.id) || n.locked) return n
        switch (dir) {
          case 'l':
            return { ...n, x: b.x }
          case 'cx':
            return { ...n, x: b.x + b.w / 2 - n.w / 2 }
          case 'r':
            return { ...n, x: b.x + b.w - n.w }
          case 't':
            return { ...n, y: b.y }
          case 'cy':
            return { ...n, y: b.y + b.h / 2 - n.h / 2 }
          case 'b':
            return { ...n, y: b.y + b.h - n.h }
        }
      }),
    }))
  }
  const distribute = (axis: 'h' | 'v') => {
    const items = selNodes.filter((n) => !n.locked)
    if (items.length < 3) return
    items.sort((a, b) => (axis === 'h' ? center(a).x - center(b).x : center(a).y - center(b).y))
    const first = center(items[0])
    const last = center(items[items.length - 1])
    const step = (axis === 'h' ? last.x - first.x : last.y - first.y) / (items.length - 1)
    const pos = new Map<string, number>()
    items.forEach((n, i) => pos.set(n.id, (axis === 'h' ? first.x : first.y) + step * i))
    hist.commit((d) => ({
      ...d,
      nodes: d.nodes.map((n) =>
        pos.has(n.id) ? (axis === 'h' ? { ...n, x: pos.get(n.id)! - n.w / 2 } : { ...n, y: pos.get(n.id)! - n.h / 2 }) : n
      ),
    }))
  }

  // FigJam "Tidy up" — snap the selected objects into a clean, evenly-spaced grid,
  // anchored at the selection's current top-left (ordered by their current reading flow).
  const tidyUp = () => {
    const s = selRef.current
    const items = hist.get().nodes.filter((n) => s.has(n.id) && n.type !== 'frame' && n.type !== 'comment' && !n.locked)
    if (items.length < 2) return
    const anchor = bbox(items)
    if (!anchor) return
    // reading order: group into rows (similar y), then left-to-right within a row
    const rowTol = Math.max(24, Math.min(...items.map((n) => n.h)) * 0.6)
    const sorted = [...items].sort((a, b) => (Math.abs(a.y - b.y) > rowTol ? a.y - b.y : a.x - b.x))
    const gap = 24
    const cols = Math.max(1, Math.round(Math.sqrt(sorted.length)))
    const colW = Math.max(...sorted.map((n) => n.w))
    const rowH = Math.max(...sorted.map((n) => n.h))
    const pos = new Map<string, Pt>()
    sorted.forEach((n, i) => {
      const c = i % cols
      const r = Math.floor(i / cols)
      // centre each object within its cell so mixed sizes stay tidy
      pos.set(n.id, { x: anchor.x + c * (colW + gap) + (colW - n.w) / 2, y: anchor.y + r * (rowH + gap) + (rowH - n.h) / 2 })
    })
    hist.commit((d) => ({
      ...d,
      nodes: d.nodes.map((n) => (pos.has(n.id) ? { ...n, x: Math.round(pos.get(n.id)!.x), y: Math.round(pos.get(n.id)!.y) } : n)),
    }))
  }

  const patchEdge = (patch: Partial<CanvasEdge>) =>
    selEdge && hist.commit((d) => ({ ...d, edges: d.edges.map((e) => (e.id === selEdge ? { ...e, ...patch } : e)) }))

  // comment thread ops
  const commentAdd = (cid: string, text: string) =>
    hist.commit((d) => ({ ...d, nodes: d.nodes.map((n) => (n.id === cid ? { ...n, thread: [...(n.thread ?? []), { text }] } : n)) }))
  const commentResolve = (cid: string) => {
    hist.commit((d) => ({ ...d, nodes: d.nodes.map((n) => (n.id === cid ? { ...n, resolved: !n.resolved } : n)) }))
    setOpenComment(null)
  }
  const commentDelete = (cid: string) => {
    hist.commit((d) => ({ nodes: d.nodes.filter((n) => n.id !== cid), edges: d.edges, viewport: d.viewport }))
    setOpenComment(null)
    setSel(new Set())
  }

  // ── image crop ───────────────────────────────────────────────────────────────
  const enterCrop = (node: CanvasNode) => {
    setSel(new Set([node.id]))
    setEditing(null)
    setOpenComment(null)
    setCropping(node.id)
    setCropRect({ x: 0, y: 0, w: node.w, h: node.h })
  }
  const cancelCrop = () => {
    setCropping(null)
    setCropRect(null)
  }
  const applyCrop = () => {
    const cid = cropping
    const r = cropRect
    if (!cid || !r) return
    const node = hist.get().nodes.find((n) => n.id === cid)
    if (node) {
      const cur = node.crop ?? { x: 0, y: 0, w: 1, h: 1 }
      // compose the new crop within the currently-displayed source region
      const ncrop = {
        x: cur.x + (r.x / node.w) * cur.w,
        y: cur.y + (r.y / node.h) * cur.h,
        w: (r.w / node.w) * cur.w,
        h: (r.h / node.h) * cur.h,
      }
      hist.commit((d) => ({
        ...d,
        nodes: d.nodes.map((n) => (n.id === cid ? { ...n, x: n.x + r.x, y: n.y + r.y, w: r.w, h: r.h, crop: ncrop } : n)),
      }))
    }
    setCropping(null)
    setCropRect(null)
  }

  // ── creation ──────────────────────────────────────────────────────────────────
  const createObject = (tk: ToolKey, down: Pt, up: Pt) => {
    const dragged = Math.abs(up.x - down.x) * cam.k > 6 || Math.abs(up.y - down.y) * cam.k > 6
    const def = DEFAULTS[tk as keyof typeof DEFAULTS] ?? DEFAULTS.shape
    let x: number
    let y: number
    let w: number
    let h: number
    if (dragged) {
      x = Math.min(down.x, up.x)
      y = Math.min(down.y, up.y)
      w = Math.max(24, Math.abs(up.x - down.x))
      h = Math.max(24, Math.abs(up.y - down.y))
    } else {
      w = def.w
      h = def.h
      x = down.x - w / 2
      y = down.y - h / 2
    }
    if (snap) {
      x = snapTo(x, GRID)
      y = snapTo(y, GRID)
    }
    let node: Omit<CanvasNode, 'id'>
    if (tk === 'sticky') node = { type: 'sticky', x, y, w, h, fill: stickyFill, text: '', author: getCanvasAuthor() || undefined, createdAt: Date.now() }
    // click = auto-width text (hugs content); drag-out = fixed-width box (wraps)
    else if (tk === 'text') node = { type: 'text', x, y, w, h, text: '', autoWidth: dragged ? false : true }
    else if (tk === 'frame') node = { type: 'frame', x, y, w, h, text: '' }
    else {
      const sh = shape ?? 'rect'
      // a clean Figma-style default: solid neutral fill (reads on both themes), no border
      node = { type: 'shape', x, y, w, h, shape: sh, fill: SHAPE_DEFAULT_FILL, stroke: null, strokeWidth: 0, radius: sh === 'roundRect' ? ROUND_RECT_RADIUS : 0, text: '' }
    }
    const nid = addNode(node)
    setSel(new Set([nid]))
    setSelEdge(null)
    setTool('select')
    if (tk === 'sticky' || tk === 'text') startEdit(nid)
  }

  const finalizePen = (pts: Pt[]) => {
    if (pts.length < 2) return
    const xs = pts.map((p) => p.x)
    const ys = pts.map((p) => p.y)
    const bx = Math.min(...xs)
    const by = Math.min(...ys)
    const bw = Math.max(1, Math.max(...xs) - bx)
    const bh = Math.max(1, Math.max(...ys) - by)

    // Smart drawing: try to recognise the stroke as a geometric shape
    if (penStyle.smart && (penStyle.kind === 'pen' || penStyle.kind === 'marker')) {
      const hit = recognizeShape(pts)
      if (hit) {
        if (hit.kind === 'shape') {
          const nid = addNode({
            type: 'shape',
            shape: hit.shape,
            x: bx, y: by, w: bw, h: bh,
            fill: SHAPE_DEFAULT_FILL,
            stroke: null,
            strokeWidth: 0,
            radius: hit.shape === 'roundRect' ? ROUND_RECT_RADIUS : 0,
          })
          setSel(new Set([nid]))
          setTool('select')
          return
        }
        if (hit.kind === 'line') {
          const eid = uid()
          hist.commit((d) => ({
            ...d,
            edges: [...d.edges, {
              id: eid,
              from: '', to: '',
              fromPoint: pts[0],
              toPoint: pts[pts.length - 1],
              type: 'straight' as const,
              arrow: 'end' as const,
            }],
          }))
          setSelEdge(eid)
          setSel(new Set())
          setTool('select')
          return
        }
      }
    }

    const local = pts.map((p) => ({ x: p.x - bx, y: p.y - by }))
    const nid = addNode({
      type: 'pen',
      x: bx,
      y: by,
      w: bw,
      h: bh,
      points: local,
      strokeWidth: penStyle.size,
      stroke: penStyle.color || undefined,
      opacity: penStyle.kind === 'highlighter' ? 0.4 : undefined,
    })
    setSel(new Set([nid]))
    setTool('select')
  }

  const addComment = (w: Pt) => {
    const nid = addNode({ type: 'comment', x: w.x - 16, y: w.y - 16, w: DEFAULTS.comment.w, h: DEFAULTS.comment.h, thread: [] })
    setSel(new Set([nid]))
    setOpenComment(nid)
    setTool('select')
  }

  // ── drag/pointer state machine — extracted verbatim to ../canvas/useCanvasDrag ──
  const {
    startGuide, startMoveGuide, startConnect, onNodePointerDown, onBoardPointerDown, onBoardDoubleClick,
    onPointerMove, onPointerUp, cancelGesture, onWheel, startResize, startGroupResize, startRotate, startRadius, startCropDrag,
  } = useCanvasDrag({
    drag, boardRef, camRef, selRef, toolRef, lastTap,
    cam, sel, editing, present, cropping, cropRect, penDraft, guideDraft, penStyle, connType, snap, space, selNodes, nodesById,
    setCam, setSel, setSelEdge, setMenu, setGuides, setGuideDraft, setDropFrame, setMarquee, setConnectCur, setConnectMenu, setHover, setPenDraft, setLassoDraft, setCropRect, setOpenComment,
    hist, toWorld, zoomAt, cancelCamAnim,
    nodeAt, frameContaining, startEdit, addNode, addComment, createObject, finalizePen, uid,
  })




  // drag handlers (onNodePointerDown / onBoardPointerDown / onPointerMove / onPointerUp /
  // cancelGesture / onWheel / startResize / startRotate / …) live in ../canvas/useCanvasDrag

  // ── keyboard ──────────────────────────────────────────────────────────────────
  // grab focus on mount so shortcuts work right away (before any board click)
  useEffect(() => {
    boardRef.current?.focus({ preventScroll: true })
  }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (present != null) {
        if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') {
          e.preventDefault()
          presentGo(present + 1)
        } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
          e.preventDefault()
          presentGo(present - 1)
        } else if (e.key === 'Escape') {
          exitPresent()
        }
        return
      }
      if (cropping) {
        if (e.key === 'Escape') cancelCrop()
        else if (e.key === 'Enter') applyCrop()
        return
      }
      const el = e.target as HTMLElement
      const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
      const mod = e.ctrlKey || e.metaKey
      if (typing) return
      if (mod) {
        const k = physKey(e)
        if (k === 'z') {
          e.preventDefault()
          e.shiftKey ? hist.redo() : hist.undo()
        } else if (k === 'y') {
          e.preventDefault()
          hist.redo()
        } else if (k === 'd') {
          e.preventDefault()
          duplicateSelected()
        } else if (k === 'a') {
          e.preventDefault()
          setSel(new Set(hist.get().nodes.map((n) => n.id)))
          setSelEdge(null)
        } else if (k === 'c') {
          copySelected()
        } else if (k === 'v') {
          if (clip.current.nodes.length) paste() // else the OS-paste listener creates sticky notes
        } else if (k === 'f') {
          e.preventDefault()
          setSearch((s) => (s == null ? '' : s))
          setSearchIdx(-1)
        }
        return
      }
      if (e.key === ' ') {
        setSpace(true)
        return
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        deleteSelected()
        return
      }
      if (e.key === 'Escape') {
        setSel(new Set())
        setSelEdge(null)
        setMenu(null)
        setConnectMenu(null)
        setOpenComment(null)
        setTool('select')
        return
      }
      // Tab on a single selection → grow a connected child to the right (mind-map)
      if (e.key === 'Tab') {
        e.preventDefault()
        const s = selRef.current
        if (s.size === 1) addChildOf([...s][0], 'right')
        return
      }
      // Enter → edit the selected node (Figma/Miro convention; nothing else owns Enter here)
      if (e.key === 'Enter') {
        const s = selRef.current
        if (s.size === 1) {
          const node = hist.get().nodes.find((n) => n.id === [...s][0])
          if (node && !node.locked && (node.type === 'sticky' || node.type === 'text' || node.type === 'shape' || node.type === 'frame')) {
            e.preventDefault()
            setSelEdge(null)
            startEdit(node.id)
          }
        }
        return
      }
      const pk = physKey(e)
      if (e.shiftKey && pk === 'a') {
        e.preventDefault()
        wrapAutoLayout()
        return
      }
      if (e.shiftKey && pk === 't') {
        e.preventDefault()
        tidyUp()
        return
      }
      const map: Record<string, ToolKey> = { v: 'select', o: 'lasso', h: 'hand', f: 'frame', n: 'sticky', t: 'text', s: 'shape', l: 'connector', p: 'pen', c: 'comment' }
      const tk = map[pk]
      if (tk) {
        setTool(tk)
      } else if (pk === 'i') {
        addImage()
      } else if (pk === '0') {
        fit(true)
      } else if (pk === '=') {
        zoomCenter(1.2)
      } else if (pk === '-') {
        zoomCenter(1 / 1.2)
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ') setSpace(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKeyUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, selEdge, snap, shape, present, frames, cropping, cropRect])

  // ── add helpers ────────────────────────────────────────────────────────────────
  const centerWorld = (): Pt => {
    const r = boardRef.current
    const cx = r ? r.clientWidth / 2 : 400
    const cy = r ? r.clientHeight / 2 : 300
    const c = camRef.current
    return { x: (cx - c.x) / c.k, y: (cy - c.y) / c.k }
  }
  // seed an empty board from a starter template, then frame the result
  const applyTemplate = (tpl: CanvasTemplate) => {
    const built = tpl.build(uid)
    hist.commit((d) => ({ ...d, nodes: [...d.nodes, ...built.nodes], edges: [...d.edges, ...built.edges] }))
    setTemplatesDismissed(true)
    setSel(new Set())
    setSelEdge(null)
    setTool('select')
    requestAnimationFrame(() => requestAnimationFrame(() => fit(true)))
  }

  const addImage = async () => {
    const p = await window.wist.files.pickImage().catch(() => null)
    if (!p) return
    // size the box to the image's natural aspect so it never distorts and crop maths line up
    const dims = await new Promise<{ w: number; h: number }>((res) => {
      const im = new Image()
      im.onload = () => res({ w: im.naturalWidth || DEFAULTS.image.w, h: im.naturalHeight || DEFAULTS.image.h })
      im.onerror = () => res({ w: DEFAULTS.image.w, h: DEFAULTS.image.h })
      im.src = window.wist.media.fileUrl(p)
    })
    const scale = Math.min(1, 320 / Math.max(dims.w, dims.h))
    const w = Math.max(40, Math.round(dims.w * scale))
    const h = Math.max(40, Math.round(dims.h * scale))
    const c = centerWorld()
    const id2 = addNode({ type: 'image', x: c.x - w / 2, y: c.y - h / 2, w, h, path: p })
    setSel(new Set([id2]))
    setTool('select')
  }
  // create a node at the connector's drop point and wire the in-progress connector to it,
  // as a single history step (one undo removes both the node and the edge)
  const connectToNewNode = (node: Omit<CanvasNode, 'id'>, from: ConnectFrom): string => {
    const nid = uid()
    const frameId = frameContaining({ ...node, id: nid } as CanvasNode, hist.get().nodes)
    const edge: CanvasEdge = {
      id: uid(),
      from: 'id' in from ? from.id : '',
      to: nid,
      fromAnchor: 'anchor' in from ? from.anchor : undefined,
      fromPoint: 'point' in from ? from.point : undefined,
      type: connType,
      arrow: 'end',
    }
    hist.commit((d) => ({ ...d, nodes: [...d.nodes, { ...node, id: nid, frameId }], edges: [...d.edges, edge] }))
    return nid
  }

  const addNoteCard = (nt: Note) => {
    // came from a connector drop → place at the drop point and wire the connector to it
    if (pendingConnect) {
      const { from, at } = pendingConnect
      const w = DEFAULTS.note.w
      const h = DEFAULTS.note.h
      connectToNewNode({ type: 'note', x: at.x - w / 2, y: at.y - h / 2, w, h, noteId: nt.id, color: null }, from)
      setPendingConnect(null)
      setNotePicker(false)
      return
    }
    const c = centerWorld()
    addNode({ type: 'note', x: c.x - 120, y: c.y - 65, w: DEFAULTS.note.w, h: DEFAULTS.note.h, noteId: nt.id, color: null })
    setNotePicker(false)
  }

  // drop a live task card; from a connector → wire it up at the drop point, else centre it
  const addTaskCard = (tk: Task) => {
    const w = DEFAULTS.task.w
    const h = DEFAULTS.task.h
    if (pendingConnect) {
      const { from, at } = pendingConnect
      connectToNewNode({ type: 'task', x: at.x - w / 2, y: at.y - h / 2, w, h, taskId: tk.id, color: null }, from)
      setPendingConnect(null)
      setTaskPicker(false)
      return
    }
    const c = centerWorld()
    addNode({ type: 'task', x: c.x - w / 2, y: c.y - h / 2, w, h, taskId: tk.id, color: null })
    setTaskPicker(false)
  }

  // the task card's checkbox toggles the real task (optimistic local update + persist)
  const toggleTask = (taskId: number) => {
    const tk = taskById.get(taskId)
    if (!tk) return
    const done: 0 | 1 = tk.done ? 0 : 1
    setTasks((ts) => ts.map((x) => (x.id === taskId ? { ...x, done, status: done ? 'done' : 'todo' } : x)))
    updateTask(taskId, { done }).catch(() => {})
  }
  const openTask = (taskId: number) => navigate(`/tasks?open=${taskId}`)

  // "Add task from list" — stash the pending connector, open the task picker
  const openTaskPickerForConnector = () => {
    if (!connectMenu) return
    setPendingConnect({ from: connectMenu.from, at: connectMenu.at })
    setConnectMenu(null)
    setTaskPicker(true)
  }

  // "Add card" from the connector drop menu — a blank sticky, wired up and ready to type
  const addCardFromConnector = () => {
    if (!connectMenu) return
    const { from, at } = connectMenu
    const w = 200
    const h = 132
    const nid = connectToNewNode(
      { type: 'sticky', x: at.x - w / 2, y: at.y - h / 2, w, h, fill: stickyFill, text: '', author: getCanvasAuthor() || undefined, createdAt: Date.now() },
      from
    )
    setConnectMenu(null)
    setSel(new Set([nid]))
    setSelEdge(null)
    startEdit(nid)
  }

  // "Add note from vault" — stash the pending connector, open the note picker
  const openNotePickerForConnector = () => {
    if (!connectMenu) return
    setPendingConnect({ from: connectMenu.from, at: connectMenu.at })
    setConnectMenu(null)
    setNotePicker(true)
  }

  // ── drop from another section (Library / Music / Vault / a Hub) or the OS ────────
  // measure an image's natural size so its node keeps the right aspect (crop maths line up)
  const measureImage = (src: string) =>
    new Promise<{ w: number; h: number }>((res) => {
      const im = new Image()
      im.onload = () => res({ w: im.naturalWidth || DEFAULTS.image.w, h: im.naturalHeight || DEFAULTS.image.h })
      im.onerror = () => res({ w: DEFAULTS.image.w, h: DEFAULTS.image.h })
      im.src = window.wist.media.fileUrl(src)
    })

  // materialize whatever was dropped, dropping each item at the cursor (cascaded a bit so
  // a multi-drop doesn't land in one stack). Images → image nodes; everything without a
  // preview → a labelled sticky card (keeps the reference visible + clickable via its link).
  const dropMedia = async (e: React.DragEvent) => {
    const at = toWorld(e.clientX, e.clientY)
    const items = readMediaDrag(e)
    const files = Array.from(e.dataTransfer.files)
      .map((f) => window.wist.util.pathForFile(f))
      .filter(Boolean)
    const specs: { image?: string; label: string; href?: string }[] = []
    for (const p of files) specs.push({ image: isImagePath(p) ? p : undefined, label: baseName(p) })
    for (const it of items ?? []) {
      const img = it.kind === 'image' && it.path ? it.path : it.cover || (it.path && isImagePath(it.path) ? it.path : undefined)
      specs.push({ image: img ?? undefined, label: it.title || baseName(it.path || it.url || '') || '—', href: it.url || undefined })
    }
    if (!specs.length) return
    const created: string[] = []
    let i = 0
    for (const s of specs) {
      const cx = at.x + i * 26
      const cy = at.y + i * 26
      if (s.image) {
        const dims = await measureImage(s.image)
        const scale = Math.min(1, 320 / Math.max(dims.w, dims.h))
        const w = Math.max(40, Math.round(dims.w * scale))
        const h = Math.max(40, Math.round(dims.h * scale))
        created.push(addNode({ type: 'image', x: cx - w / 2, y: cy - h / 2, w, h, path: s.image, href: s.href }))
      } else {
        const w = 200
        const h = 132
        created.push(addNode({ type: 'sticky', x: cx - w / 2, y: cy - h / 2, w, h, fill: stickyFill, text: s.label, href: s.href, createdAt: Date.now() }))
      }
      i++
    }
    if (created.length) {
      setSel(new Set(created))
      setSelEdge(null)
      setTool('select')
    }
  }

  // a missed drop / cancelled drag never fires our onDrop — clear the hover overlay on any
  // window-level drop or dragend so it can't get stuck lit
  useEffect(() => {
    const clear = () => setDndOver(false)
    window.addEventListener('drop', clear)
    window.addEventListener('dragend', clear)
    return () => {
      window.removeEventListener('drop', clear)
      window.removeEventListener('dragend', clear)
    }
  }, [])

  // paste plain text from the OS clipboard onto the board → sticky note(s), one per line
  // (the internal node clipboard, when present, is handled by Ctrl+V in the key handler)
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (present != null || cropping || editing) return
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
      if (clip.current.nodes.length) return // an internal copy takes precedence
      const text = (e.clipboardData?.getData('text/plain') ?? '').replace(/\s+$/, '')
      if (!text.trim()) return
      e.preventDefault()
      const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
      const c = centerWorld()
      const author = getCanvasAuthor() || undefined
      if (lines.length <= 1) {
        const w = 200
        const h = 132
        const [nid] = batchAdd([{ type: 'sticky', x: c.x - w / 2, y: c.y - h / 2, w, h, fill: stickyFill, text: lines[0] ?? text.trim(), author, createdAt: Date.now() }])
        setSel(new Set([nid]))
      } else {
        const w = 180
        const h = 180
        const gap = 20
        const cols = Math.max(1, Math.round(Math.sqrt(lines.length)))
        const x0 = c.x - (cols * (w + gap) - gap) / 2
        const ids = batchAdd(
          lines.map((ln, i) => ({
            type: 'sticky' as const,
            x: x0 + (i % cols) * (w + gap),
            y: c.y + Math.floor(i / cols) * (h + gap),
            w,
            h,
            fill: stickyFill,
            text: ln,
            author,
            createdAt: Date.now(),
          }))
        )
        setSel(new Set(ids))
      }
      setSelEdge(null)
      setTool('select')
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [present, cropping, editing, stickyFill])

  // ── edge endpoints for render ───────────────────────────────────────────────────
  // adaptive endpoint: the side of `node` that faces the other end, offset outward
  // by CONN_GAP so the line never jams into the block (Miro-style safe zone).
  const resolveEnd = (node: CanvasNode, otherCenter: Pt): { p: Pt; n: Pt } => {
    const a = sideToward(node, otherCenter)
    const p = anchorPoint(node, a)
    const nrm = anchorNormal(a)
    return { p: { x: p.x + nrm.x * CONN_GAP, y: p.y + nrm.y * CONN_GAP }, n: nrm }
  }

  const edgeGeo = useMemo(() => {
    return data.edges
      .map((edge) => {
        const a = edge.from ? nodesById.get(edge.from) : undefined
        const b = edge.to ? nodesById.get(edge.to) : undefined
        if ((edge.from && !a) || (edge.to && !b)) return null
        const aC = a ? center(a) : edge.fromPoint
        const bC = b ? center(b) : edge.toPoint
        if (!aC || !bC) return null
        const e1 = a ? resolveEnd(a, bC) : { p: edge.fromPoint, n: undefined }
        const e2 = b ? resolveEnd(b, aC) : { p: edge.toPoint, n: undefined }
        if (!e1.p || !e2.p) return null
        return { edge, p1: e1.p, p2: e2.p, n1: e1.n, n2: e2.n }
      })
      .filter(Boolean) as { edge: CanvasEdge; p1: Pt; p2: Pt; n1?: Pt; n2?: Pt }[]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.edges, nodesById])

  // ── find on board (Ctrl+F) ──────────────────────────────────────────────────────
  const searchMatches = useMemo(() => {
    const q = (search ?? '').trim().toLowerCase()
    if (!q) return [] as string[]
    return data.nodes
      .filter((n) => {
        let hay = n.text ?? ''
        if (n.noteId != null) {
          const nt = noteById.get(n.noteId)
          if (nt) hay += ` ${nt.title ?? ''} ${nt.content ?? ''}`
        }
        return hay.toLowerCase().includes(q)
      })
      .map((n) => n.id)
  }, [search, data.nodes, noteById])
  const searchSet = useMemo(() => new Set(searchMatches), [searchMatches])

  // park the camera on a given match (keeps the current zoom — just pans + selects it)
  const gotoMatch = (i: number) => {
    if (!searchMatches.length) return
    const idx = ((i % searchMatches.length) + searchMatches.length) % searchMatches.length
    setSearchIdx(idx)
    const node = nodesById.get(searchMatches[idx])
    const r = boardRef.current?.getBoundingClientRect()
    if (!node || !r) return
    const c = center(node)
    const cm = camRef.current
    animateCamTo({ k: cm.k, x: r.width / 2 - c.x * cm.k, y: r.height / 2 - c.y * cm.k }, 220)
    setSel(new Set([node.id]))
    setSelEdge(null)
  }

  // ── outline / table of contents ─────────────────────────────────────────────────
  const outline = useMemo(() => {
    const items: { id: string; type: string; label: string }[] = []
    let fi = 0
    for (const n of data.nodes) {
      let label = ''
      if (n.type === 'frame') {
        fi++
        label = (n.text || '').trim() || `${t('canvas.frame')} ${fi}`
      } else if (n.type === 'sticky' || n.type === 'text' || n.type === 'shape') {
        label = (n.text || '').trim()
        if (!label) continue // skip blank scaffolding
      } else if (n.type === 'note') {
        const nt = n.noteId != null ? noteById.get(n.noteId) : undefined
        label = nt ? nt.title || nt.content.slice(0, 40) : t('canvas.missingNote')
      } else if (n.type === 'task') {
        const tk = n.taskId != null ? taskById.get(n.taskId) : undefined
        label = tk ? tk.title || t('canvas.taskUntitled') : t('canvas.missingTask')
      } else if (n.type === 'image') {
        label = baseName(n.path || '') || t('canvas.tool.image')
      } else continue // pen / comment
      items.push({ id: n.id, type: n.type, label: label || '—' })
    }
    return items
  }, [data.nodes, noteById, taskById, t])

  // fly to a node from the outline: fit a frame, else centre it (keeping a readable zoom)
  const goToNode = (nid: string) => {
    const n = nodesById.get(nid)
    if (!n) return
    setSel(new Set([nid]))
    setSelEdge(null)
    const r = boardRef.current?.getBoundingClientRect()
    if (!r) return
    if (n.type === 'frame') {
      animateToBox(n, 60)
    } else {
      const c = center(n)
      const k = Math.max(camRef.current.k, 0.8)
      animateCamTo({ k, x: r.width / 2 - c.x * k, y: r.height / 2 - c.y * k }, 240)
    }
  }

  if (!ready) return <Spinner />

  const chrome = present == null && !exporting
  const rOff = showRulers ? RULER_SIZE : 0 // keep floating chrome inside the working area, clear of the rulers
  const single = selNodes.length === 1 && !selEdge ? selNodes[0] : null
  const groupBox = selNodes.length > 1 ? bbox(selNodes.map(nodeAABB)) : null
  const groupRotated = selNodes.some((n) => n.rotation)
  const selEdgeObj = selEdge ? data.edges.find((e) => e.id === selEdge) ?? null : null
  const rulerSel: Box | null = single ? nodeAABB(single) : groupBox // selection extent shown on the rulers
  const cursor =
    space || tool === 'hand' ? 'grab'
    : tool === 'select' ? 'default'
    : tool === 'pen' && penStyle.kind === 'eraser' ? 'cell'
    : 'crosshair'
  const commentNode = openComment ? nodesById.get(openComment) : null

  let ctxPos: Pt | null = null
  let ctxBottomY = 0 // where to flip the toolbar to when it would clip the top edge
  if (single) {
    const s = toScreen(single.x, single.y)
    ctxPos = { x: s.x + (single.w * cam.k) / 2, y: s.y - 22 }
    ctxBottomY = s.y + single.h * cam.k + 22
  } else if (groupBox) {
    const s = toScreen(groupBox.x, groupBox.y)
    ctxPos = { x: s.x + (groupBox.w * cam.k) / 2, y: s.y - 22 }
    ctxBottomY = s.y + groupBox.h * cam.k + 22
  } else if (selEdgeObj) {
    const g = edgeGeo.find((gg) => gg.edge.id === selEdge)
    if (g) {
      const s = toScreen((g.p1.x + g.p2.x) / 2, (g.p1.y + g.p2.y) / 2)
      ctxPos = { x: s.x, y: s.y - 22 }
      ctxBottomY = s.y + 34
    }
  }

  // keep the floating toolbar fully on-screen: clamp horizontally, flip below when it
  // would clip the top edge (it floats above the selection by default)
  let ctxStyle: React.CSSProperties | null = null
  if (ctxPos) {
    const half = ctxSize.w / 2
    const left = ctxSize.w && boardSize.w ? Math.max(8 + half, Math.min(boardSize.w - 8 - half, ctxPos.x)) : ctxPos.x
    const flip = ctxSize.h > 0 && ctxPos.y - ctxSize.h < 8
    ctxStyle = { left, top: flip ? ctxBottomY : ctxPos.y, transform: flip ? 'translate(-50%, 0)' : 'translate(-50%, -100%)' }
  }

  const showGrid: 'dots' | 'lines' | 'none' = chrome ? grid : 'none'

  const renderFrames = visible.filter((n) => n.type === 'frame')
  const renderOthers = visible.filter((n) => n.type !== 'frame')

  const renderNode = (n: CanvasNode) => {
    // Figma-style hover highlight: a thin accent outline (kept ~1px on screen at any
    // zoom) so pointing at an object reads as "this is what you'd select".
    const hovered =
      chrome && (tool === 'select' || tool === 'connector') && hover === n.id && !sel.has(n.id) && editing !== n.id && n.type !== 'comment' && !drag.current
    // find-on-board: ring every match in amber (the current one is also selected → blue)
    const searchHit = search != null && searchSet.has(n.id) && !sel.has(n.id)
    return (
      <div
        key={n.id}
        data-node-id={n.id}
        className="absolute"
        style={{
          left: n.x,
          top: n.y,
          width: n.w,
          height: n.h,
          transform: n.rotation ? `rotate(${n.rotation}deg)` : undefined,
          opacity: n.opacity ?? 1,
          outline: sel.has(n.id)
            ? `1.5px solid ${ACTIVE}`
            : searchHit
              ? `${2.5 / cam.k}px solid #F5C518`
              : hovered
                ? `${1.5 / cam.k}px solid ${ACTIVE}`
                : undefined,
          outlineOffset: sel.has(n.id) ? 1 : 0,
          cursor: !chrome ? 'default' : n.locked ? 'default' : tool === 'select' ? 'move' : undefined,
        }}
        onPointerDown={(e) => onNodePointerDown(e, n)}
        onPointerEnter={() => chrome && !drag.current && setHover(n.id)}
        onPointerLeave={() => !drag.current && setHover((h) => (h === n.id ? null : h))}
        onDoubleClick={(e) => {
          e.stopPropagation()
          if (tool !== 'select' || n.locked || !chrome || cropping) return
          if (n.type === 'sticky' || n.type === 'text' || n.type === 'shape' || n.type === 'frame') {
            setSel(new Set([n.id]))
            startEdit(n.id)
          }
        }}
      >
        <NodeView
          node={n}
          note={n.noteId != null ? noteById.get(n.noteId) : undefined}
          task={n.taskId != null ? taskById.get(n.taskId) : undefined}
          selected={sel.has(n.id)}
          editing={editing === n.id}
          fileUrl={window.wist.media.fileUrl}
          missingNoteLabel={t('canvas.missingNote')}
          missingTaskLabel={t('canvas.missingTask')}
          placeholder={t('canvas.textPlaceholder')}
          stickyPlaceholder={t('canvas.stickyPh')}
          frameLabel={n.type === 'frame' ? `${t('canvas.frame')} ${frameLabelOf(n.id)}` : undefined}
          dropActive={n.type === 'frame' && dropFrame === n.id}
          onAutoHeight={n.type === 'text' ? (h) => autoHeight(n.id, h) : undefined}
          onAutoSize={n.type === 'text' ? (w, h) => autoSize(n.id, w, h) : undefined}
          onText={(text) => hist.live((d) => ({ ...d, nodes: d.nodes.map((m) => (m.id === n.id ? { ...m, text } : m)) }))}
          onEndEdit={() => {
            if (Date.now() - editStart.current < 200) return // ignore the focus-race blur on open
            setEditing(null)
            hist.end()
          }}
          onOpenNote={() => n.noteId != null && navigate(`/notes?open=${n.noteId}`)}
          onToggleTask={() => n.taskId != null && toggleTask(n.taskId)}
          onOpenTask={() => n.taskId != null && openTask(n.taskId)}
        />
        {chrome &&
          (tool === 'select' || tool === 'connector') &&
          hover === n.id &&
          editing !== n.id &&
          n.type !== 'comment' &&
          !drag.current &&
          SIDE_ANCHORS.map((a) => {
            const local =
              a === 't' ? { x: n.w / 2, y: 0 } : a === 'r' ? { x: n.w, y: n.h / 2 } : a === 'b' ? { x: n.w / 2, y: n.h } : { x: 0, y: n.h / 2 }
            return (
              <button
                key={a}
                data-anchor={a}
                onPointerDown={(e) => startConnect({ id: n.id, anchor: a }, e)}
                className="absolute z-10 rounded-full border border-[#fff]"
                style={{ left: local.x, top: local.y, width: 11 / cam.k, height: 11 / cam.k, transform: 'translate(-50%, -50%)', background: ACTIVE }}
                title={t('canvas.tool.connector')}
              />
            )
          })}
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* board fills the whole area; chrome floats over it (Miro / FigJam style) */}
      <div
        ref={boardRef}
        // focusable so the board owns keyboard focus: without this, focus stays on
        // whatever input was last touched (a panel field, a node textarea) and the
        // keydown handler's typing-guard swallows EVERY shortcut. -1 keeps it out of
        // the tab order; the global focus ring is :focus-visible so no ring on click.
        tabIndex={-1}
        onPointerDownCapture={() => boardRef.current?.focus({ preventScroll: true })}
        className="relative min-h-0 flex-1 touch-none select-none overflow-hidden bg-bg focus:outline-none"
        style={{ cursor }}
        onPointerDown={onBoardPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={cancelGesture}
        onDoubleClick={onBoardDoubleClick}
        onWheel={onWheel}
        onContextMenu={(e) => e.preventDefault()}
        onDragOver={(e) => {
          if (present != null || cropping || !dragHasDroppable(e)) return
          e.preventDefault()
          e.dataTransfer.dropEffect = 'copy'
          if (!dndOver) setDndOver(true)
        }}
        onDragLeave={(e) => {
          if (e.currentTarget === e.target) setDndOver(false)
        }}
        onDrop={(e) => {
          if (present != null || cropping || !dragHasDroppable(e)) return
          e.preventDefault()
          setDndOver(false)
          dropMedia(e)
        }}
      >
        <GridCanvas cam={cam} width={boardSize.w} height={boardSize.h} mode={showGrid} />

        {/* drop hint — a media/file drag from another section is hovering the board */}
        {chrome && dndOver && (
          <div className="pointer-events-none absolute inset-3 z-40 flex items-center justify-center rounded-2xl border-2 border-dashed border-accent bg-accent/5 backdrop-blur-[1px] animate-scale-in">
            <span className="rounded-xl border border-edge bg-card px-4 py-2 text-sm font-medium text-accent-bright shadow-[var(--float-shadow)]">
              {t('dnd.dropOnBoard')}
            </span>
          </div>
        )}

        {/* ruler guides — infinite lines in screen space; the one being dragged is hidden in favour of the live draft */}
        {chrome &&
          (data.guides ?? []).map((g, i) => {
            if (drag.current?.mode === 'guide' && drag.current.index === i) return null
            const isH = g.axis === 'h'
            const sp = isH ? cam.y + g.pos * cam.k : cam.x + g.pos * cam.k
            if (isH ? sp < -1 || sp > boardSize.h : sp < -1 || sp > boardSize.w) return null
            return (
              <div key={`guide-${i}`}>
                <div
                  className="pointer-events-none absolute z-[19]"
                  style={isH ? { left: 0, top: sp, width: boardSize.w, height: 1, background: GUIDE_COLOR } : { top: 0, left: sp, height: boardSize.h, width: 1, background: GUIDE_COLOR }}
                />
                <div
                  className="absolute z-[19]"
                  style={isH ? { left: 0, top: sp - 4, width: boardSize.w, height: 9, cursor: 'row-resize' } : { top: 0, left: sp - 4, height: boardSize.h, width: 9, cursor: 'col-resize' }}
                  onPointerDown={(e) => startMoveGuide(e, i)}
                  title={t('canvas.guide')}
                />
              </div>
            )
          })}

        {/* live guide preview + coordinate readout */}
        {chrome && guideDraft && (() => {
          const isH = guideDraft.axis === 'h'
          const sp = isH ? cam.y + guideDraft.pos * cam.k : cam.x + guideDraft.pos * cam.k
          return (
            <>
              <div
                className="pointer-events-none absolute z-[21]"
                style={isH ? { left: 0, top: sp, width: boardSize.w, height: 1, background: GUIDE_COLOR } : { top: 0, left: sp, height: boardSize.h, width: 1, background: GUIDE_COLOR }}
              />
              <div
                className="pointer-events-none absolute z-[21] rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white shadow"
                style={{ background: GUIDE_COLOR, left: isH ? RULER_SIZE + 5 : sp + 5, top: isH ? sp + 5 : RULER_SIZE + 5 }}
              >
                {Math.round(guideDraft.pos)}
              </div>
            </>
          )
        })()}

        {/* rulers (top + left) with world-coordinate ticks; the bands double as guide drag-out zones */}
        {showRulers && chrome && (
          <>
            <Rulers cam={cam} width={boardSize.w} height={boardSize.h} selBox={rulerSel} />
            <div data-ruler="h" className="absolute left-0 top-0 z-20" style={{ width: boardSize.w, height: RULER_SIZE, cursor: 'ns-resize' }} onPointerDown={(e) => startGuide(e, 'h')} title={t('canvas.guideHint')} />
            <div data-ruler="v" className="absolute left-0 top-0 z-20" style={{ width: RULER_SIZE, height: boardSize.h, cursor: 'ew-resize' }} onPointerDown={(e) => startGuide(e, 'v')} title={t('canvas.guideHint')} />
          </>
        )}

        {/* floating top-left: back button + board name — two separate pills, with air */}
        {chrome && (
          <div className="pointer-events-auto absolute z-30 flex items-center gap-2" style={{ left: rOff + 12, top: rOff + 12 }} onPointerDown={(e) => e.stopPropagation()}>
            <div className="flex h-11 items-center justify-center rounded-2xl border border-edge bg-card px-1 ring-1 ring-black/5 shadow-[var(--float-shadow)]">
              <TopBtn title={t('app.back')} onClick={() => navigate('/canvas')}>
                <ArrowLeft size={17} />
              </TopBtn>
            </div>
            <div className="flex h-11 items-center gap-1.5 rounded-2xl border border-edge bg-card px-2.5 ring-1 ring-black/5 shadow-[var(--float-shadow)]">
              <FrameIcon size={16} className="shrink-0 text-accent-bright" />
              <AutoWidthInput
                value={name}
                onChange={setName}
                placeholder={t('canvas.untitled')}
                className="bg-transparent px-0.5 text-sm font-semibold text-[rgb(var(--ink-0))] outline-none"
                min={44}
                max={340}
              />
            </div>
          </div>
        )}

        {/* outline / table of contents — flies the camera to any frame or object */}
        {chrome && outlineOpen && (
          <div
            className="pointer-events-auto absolute z-30 flex max-h-[62vh] w-60 flex-col rounded-xl border border-edge bg-card ring-1 ring-black/5 shadow-[var(--float-shadow)]"
            style={{ left: rOff + 12, top: rOff + 64 }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-edge px-3 py-2">
              <span className="text-xs font-semibold text-[rgb(var(--ink-0))]">{t('canvas.outline')}</span>
              <button className="rounded-md p-0.5 text-zinc-400 hover:bg-highlight hover:text-zinc-100" onClick={() => setOutlineOpen(false)}>
                <X size={14} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-1">
              {outline.length === 0 ? (
                <div className="px-2 py-6 text-center text-xs text-zinc-500">{t('canvas.outlineEmpty')}</div>
              ) : (
                outline.map((it) => {
                  const Icon =
                    it.type === 'frame' ? FrameIcon : it.type === 'sticky' ? StickyNote : it.type === 'text' ? TypeIcon : it.type === 'shape' ? Square : it.type === 'note' ? FileText : it.type === 'task' ? CheckCircle2 : ImageIcon
                  return (
                    <button
                      key={it.id}
                      onClick={() => goToNode(it.id)}
                      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-highlight ${
                        sel.has(it.id) ? 'bg-highlight text-[rgb(var(--ink-0))]' : 'text-zinc-300'
                      } ${it.type === 'frame' ? 'font-semibold' : ''}`}
                    >
                      <Icon size={14} className="shrink-0 text-zinc-500" />
                      <span className="truncate">{it.label}</span>
                    </button>
                  )
                })
              )}
            </div>
          </div>
        )}

        {/* relations — edge-backed backlinks for this canvas (board ↔ knowledge graph) */}
        {chrome && relationsOpen && (
          <div
            className="pointer-events-auto absolute z-30 flex max-h-[62vh] w-72 flex-col rounded-xl border border-edge bg-card ring-1 ring-black/5 shadow-[var(--float-shadow)]"
            style={{ right: rOff + 12, top: rOff + 64 }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-edge px-3 py-2">
              <span className="text-xs font-semibold text-[rgb(var(--ink-0))]">{t('canvas.relations')}</span>
              <button className="rounded-md p-0.5 text-zinc-400 hover:bg-highlight hover:text-zinc-100" onClick={() => setRelationsOpen(false)}>
                <X size={14} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              <Relations focus={{ type: 'canvas' as const, id: canvasId }} />
            </div>
          </div>
        )}

        {/* floating top-right: two clean grouped pills — view tools | zoom + export (Miro-style separation) */}
        {chrome && (
          <div className="pointer-events-auto absolute right-3 z-30 flex items-center gap-2" style={{ top: rOff + 12 }} onPointerDown={(e) => e.stopPropagation()}>
            <div className="flex h-11 items-center gap-0.5 rounded-2xl border border-edge bg-card px-1.5 ring-1 ring-black/5 shadow-[var(--float-shadow)]">
              <TopBtn active={showResolved} title={t('canvas.showResolved')} onClick={() => setShowResolved((v) => !v)}>
                {showResolved ? <Eye size={17} /> : <EyeOff size={17} />}
              </TopBtn>
              <TopBtn active={grid !== 'none'} title={t('canvas.grid')} onClick={() => setGrid((g) => (g === 'dots' ? 'lines' : g === 'lines' ? 'none' : 'dots'))}>
                <Grid3x3 size={17} />
              </TopBtn>
              <TopBtn active={snap} title={t('canvas.snap')} onClick={() => setSnap((s) => !s)}>
                <Magnet size={17} />
              </TopBtn>
              <TopBtn active={showRulers} title={t('canvas.rulers')} onClick={() => setShowRulers((v) => !v)}>
                <RulerIcon size={17} />
              </TopBtn>
              <TopBtn active={outlineOpen} title={t('canvas.outline')} onClick={() => setOutlineOpen((v) => !v)}>
                <ListTree size={17} />
              </TopBtn>
              <div className="relative">
                <TopBtn active={timerOpen} title="Таймер фокуса" onClick={() => setTimerOpen((v) => !v)}>
                  <TimerIcon size={17} />
                </TopBtn>
                {timerOpen && (
                  <div className="absolute right-0 z-50" style={{ top: 'calc(100% + 8px)' }}>
                    <FocusTimer onClose={() => setTimerOpen(false)} />
                  </div>
                )}
              </div>
              <TopBtn active={relationsOpen} title={t('canvas.relations')} onClick={() => setRelationsOpen((v) => !v)}>
                <GitBranch size={17} />
              </TopBtn>
            </div>

            <div className="flex h-11 items-center gap-0.5 rounded-2xl border border-edge bg-card px-1.5 ring-1 ring-black/5 shadow-[var(--float-shadow)]">
              <TopBtn title={t('canvas.zoomOut')} onClick={() => zoomCenter(1 / 1.2)}>
                <Minus size={17} />
              </TopBtn>
              <button
                className="min-w-[44px] rounded-lg px-1 text-center text-xs font-medium tabular-nums text-[rgb(var(--ink-200))] transition-colors hover:text-[rgb(var(--ink-0))]"
                title="100%"
                onClick={() => zoomCenter(1 / cam.k)}
              >
                {Math.round(cam.k * 100)}%
              </button>
              <TopBtn title={t('canvas.zoomIn')} onClick={() => zoomCenter(1.2)}>
                <Plus size={17} />
              </TopBtn>
              <TopBtn title={`${t('canvas.fit')} · 0`} onClick={() => fit(true)}>
                <Maximize2 size={16} />
              </TopBtn>
              <div className="mx-1 h-5 w-px bg-edge" />
              <div className="relative">
                <TopBtn title={t('canvas.export')} onClick={() => setExportMenu((v) => !v)}>
                  <Download size={17} />
                </TopBtn>
                {exportMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setExportMenu(false)} />
                    <div className="absolute right-0 top-12 z-50 w-52 rounded-2xl border border-edge bg-card p-1 text-sm shadow-[var(--float-shadow)]">
                      <button className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-[rgb(var(--ink-200))] hover:bg-highlight hover:text-[rgb(var(--ink-0))]" onClick={() => exportPng('board')}>
                        <ImageIcon size={14} /> {t('canvas.exportPngBoard')}
                      </button>
                      <button className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-[rgb(var(--ink-200))] hover:bg-highlight hover:text-[rgb(var(--ink-0))]" onClick={() => exportPng('frame')}>
                        <ImageIcon size={14} /> {t('canvas.exportPngFrame')}
                      </button>
                      <button className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-[rgb(var(--ink-200))] hover:bg-highlight hover:text-[rgb(var(--ink-0))]" onClick={exportPdf}>
                        <FileText size={14} /> {t('canvas.exportPdf')}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* find on board (Ctrl+F) — centred pill under the top chrome */}
        {chrome && search != null && (
          <div
            className="pointer-events-auto absolute left-1/2 z-30 flex h-11 -translate-x-1/2 items-center gap-0.5 rounded-2xl border border-edge bg-card px-2 ring-1 ring-black/5 shadow-[var(--float-shadow)]"
            style={{ top: rOff + 12 }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <Search size={15} className="ml-1 mr-0.5 shrink-0 text-zinc-500" />
            <input
              autoFocus
              value={search}
              placeholder={t('canvas.searchPh')}
              onChange={(e) => {
                setSearch(e.target.value)
                setSearchIdx(-1)
              }}
              onKeyDown={(e) => {
                e.stopPropagation()
                if (e.key === 'Enter') {
                  e.preventDefault()
                  gotoMatch(e.shiftKey ? searchIdx - 1 : searchIdx + 1)
                } else if (e.key === 'Escape') {
                  e.preventDefault()
                  setSearch(null)
                }
              }}
              className="w-44 bg-transparent px-1 text-sm text-[rgb(var(--ink-0))] outline-none placeholder:text-zinc-500"
            />
            <span className="min-w-[44px] shrink-0 px-1 text-center text-[11px] tabular-nums text-zinc-500">
              {searchMatches.length
                ? searchIdx >= 0
                  ? `${(searchIdx % searchMatches.length) + 1}/${searchMatches.length}`
                  : `${searchMatches.length}`
                : search.trim()
                  ? t('canvas.noMatches')
                  : ''}
            </span>
            <button
              className="rounded-lg p-1 text-zinc-400 transition-colors hover:bg-highlight hover:text-zinc-100 disabled:opacity-30"
              disabled={!searchMatches.length}
              onClick={() => gotoMatch(searchIdx - 1)}
              title={t('canvas.prevMatch')}
            >
              <ChevronLeft size={15} />
            </button>
            <button
              className="rounded-lg p-1 text-zinc-400 transition-colors hover:bg-highlight hover:text-zinc-100 disabled:opacity-30"
              disabled={!searchMatches.length}
              onClick={() => gotoMatch(searchIdx + 1)}
              title={t('canvas.nextMatch')}
            >
              <ChevronRight size={15} />
            </button>
            <button className="rounded-lg p-1 text-zinc-400 transition-colors hover:bg-highlight hover:text-zinc-100" onClick={() => setSearch(null)} title={t('common.close')}>
              <X size={15} />
            </button>
          </div>
        )}

        {/* world layer */}
        <div className="absolute left-0 top-0 origin-top-left" style={{ transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.k})` }}>
          {/* connectors + pen draft */}
          <svg className="pointer-events-none absolute" style={{ overflow: 'visible', left: 0, top: 0, width: 1, height: 1 }}>
            <defs>
              <marker id="cv-arrow-end" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" fill="context-stroke" />
              </marker>
              <marker id="cv-arrow-start" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto">
                <path d="M0,0 L10,5 L0,10 z" fill="context-stroke" />
              </marker>
            </defs>
            <g className="pointer-events-auto">
              {edgeGeo.map(({ edge, p1, p2, n1, n2 }) => (
                <ConnectorView
                  key={edge.id}
                  edge={edge}
                  p1={p1}
                  p2={p2}
                  n1={n1}
                  n2={n2}
                  selected={selEdge === edge.id}
                  onSelect={(e) => {
                    if (!chrome) return
                    e.stopPropagation()
                    setSelEdge(edge.id)
                    setSel(new Set())
                  }}
                />
              ))}
              {/* live connector preview — a smooth curve that leaves the source's facing
                  side and follows the pointer (Obsidian-style), matching the committed edge */}
              {connectCur &&
                drag.current?.mode === 'connect' &&
                (() => {
                  const f = drag.current.from
                  const src = 'id' in f ? nodesById.get(f.id) : null
                  const e1 = src ? resolveEnd(src, connectCur) : { p: 'point' in f ? f.point : null, n: undefined }
                  if (!e1.p) return null
                  return (
                    <path
                      d={connectorPath(connType, e1.p, connectCur, e1.n, undefined)}
                      fill="none"
                      stroke={ACTIVE}
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      markerEnd="url(#cv-arrow-end)"
                    />
                  )
                })()}
              {/* same curve held dimmed while the drop-to-create menu is open */}
              {connectMenu &&
                (() => {
                  const f = connectMenu.from
                  const src = 'id' in f ? nodesById.get(f.id) : null
                  const e1 = src ? resolveEnd(src, connectMenu.at) : { p: 'point' in f ? f.point : null, n: undefined }
                  if (!e1.p) return null
                  return (
                    <path
                      d={connectorPath(connType, e1.p, connectMenu.at, e1.n, undefined)}
                      fill="none"
                      stroke={ACTIVE}
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      markerEnd="url(#cv-arrow-end)"
                      opacity={0.55}
                    />
                  )
                })()}
              {penDraft && penDraft.length > 1 && (
                <polyline
                  points={penDraft.map((p) => `${p.x},${p.y}`).join(' ')}
                  fill="none"
                  stroke={penStyle.color || 'rgb(var(--ink-0))'}
                  strokeWidth={penStyle.size}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={penStyle.kind === 'highlighter' ? 0.4 : 1}
                />
              )}
              {lassoDraft && lassoDraft.length > 1 && (
                <polygon
                  points={lassoDraft.map((p) => `${p.x},${p.y}`).join(' ')}
                  fill={`rgb(${ACTIVE_RGB} / 0.08)`}
                  stroke={ACTIVE}
                  strokeWidth={1.5 / cam.k}
                  strokeDasharray={`${5 / cam.k} ${3 / cam.k}`}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
            </g>
          </svg>

          {/* nodes — frames behind, everything else in front */}
          {renderFrames.map(renderNode)}
          {renderOthers.map(renderNode)}
        </div>

        {/* selection overlay (screen space) — comments use their thread popover, not a box */}
        {chrome && single && single.type !== 'comment' && !cropping && (
          <SelectionFrame
            n={single}
            cam={cam}
            resizable={single.type !== 'pen'}
            rotatable
            roundable={supportsRadius(single)}
            onResize={startResize}
            onRotate={startRotate}
            onRadius={startRadius}
          />
        )}
        {chrome && groupBox && (
          <div
            className="pointer-events-none absolute border"
            style={{ borderColor: ACTIVE, left: toScreen(groupBox.x, groupBox.y).x, top: toScreen(groupBox.x, groupBox.y).y, width: groupBox.w * cam.k, height: groupBox.h * cam.k }}
          >
            {!groupRotated &&
              HANDLES.map((h) => {
                const px = h.sign[0] < 0 ? 0 : groupBox.w * cam.k
                const py = h.sign[1] < 0 ? 0 : groupBox.h * cam.k
                return (
                  <div
                    key={h.key}
                    className="pointer-events-auto absolute h-2.5 w-2.5 rounded-sm border bg-[#fff]"
                    style={{ borderColor: ACTIVE, left: px, top: py, transform: 'translate(-50%, -50%)', cursor: h.cursor }}
                    onPointerDown={(e) => startGroupResize(e, h.sign, groupBox)}
                  />
                )
              })}
          </div>
        )}

        {/* smart-alignment guides */}
        {chrome && guides && (
          <>
            {guides.vx.map((x, i) => (
              <div key={`gv${i}`} className="pointer-events-none absolute top-0 z-30" style={{ left: toScreen(x, 0).x, width: 1, height: boardSize.h, background: '#FF3B6B' }} />
            ))}
            {guides.hy.map((y, i) => (
              <div key={`gh${i}`} className="pointer-events-none absolute left-0 z-30" style={{ top: toScreen(0, y).y, height: 1, width: boardSize.w, background: '#FF3B6B' }} />
            ))}
          </>
        )}

        {/* marquee */}
        {chrome && marquee && (
          <div
            className="pointer-events-none absolute border"
            style={{
              borderColor: ACTIVE,
              background: `rgb(${ACTIVE_RGB} / 0.1)`,
              left: marquee.x - boardRef.current!.getBoundingClientRect().left,
              top: marquee.y - boardRef.current!.getBoundingClientRect().top,
              width: marquee.w,
              height: marquee.h,
            }}
          />
        )}

        {/* image crop overlay */}
        {cropping &&
          cropRect &&
          (() => {
            const node = nodesById.get(cropping)
            if (!node) return null
            const bx = cam.x + node.x * cam.k
            const by = cam.y + node.y * cam.k
            const bw = node.w * cam.k
            const bh = node.h * cam.k
            const rx = cropRect.x * cam.k
            const ry = cropRect.y * cam.k
            const rw = cropRect.w * cam.k
            const rh = cropRect.h * cam.k
            return (
              <div className="absolute z-40" style={{ left: bx, top: by, width: bw, height: bh }}>
                <div className="pointer-events-none absolute bg-black/55" style={{ left: 0, top: 0, width: bw, height: ry }} />
                <div className="pointer-events-none absolute bg-black/55" style={{ left: 0, top: ry + rh, width: bw, height: Math.max(0, bh - ry - rh) }} />
                <div className="pointer-events-none absolute bg-black/55" style={{ left: 0, top: ry, width: rx, height: rh }} />
                <div className="pointer-events-none absolute bg-black/55" style={{ left: rx + rw, top: ry, width: Math.max(0, bw - rx - rw), height: rh }} />
                <div
                  className="absolute border-2 border-[#fff]/90"
                  style={{ left: rx, top: ry, width: rw, height: rh, cursor: 'move' }}
                  onPointerDown={(e) => startCropDrag(e, 'move')}
                />
                {HANDLES.map((hd) => {
                  const px = rx + (hd.sign[0] < 0 ? 0 : rw)
                  const py = ry + (hd.sign[1] < 0 ? 0 : rh)
                  return (
                    <div
                      key={hd.key}
                      className="absolute h-3 w-3 rounded-sm border border-black/40 bg-[#fff]"
                      style={{ left: px, top: py, transform: 'translate(-50%, -50%)', cursor: hd.cursor }}
                      onPointerDown={(e) => startCropDrag(e, hd.sign)}
                    />
                  )
                })}
                <div className="absolute flex gap-1.5" style={{ left: bw / 2, top: bh + 10, transform: 'translateX(-50%)' }}>
                  <button className="rounded-lg bg-accent px-3 py-1 text-xs font-medium text-[#fff] hover:bg-accent-hover" onClick={applyCrop}>
                    {t('common.save')}
                  </button>
                  <button className="rounded-lg border border-edge bg-surface px-3 py-1 text-xs text-zinc-300 hover:bg-raised" onClick={cancelCrop}>
                    {t('common.cancel')}
                  </button>
                </div>
              </div>
            )
          })()}

        {/* context toolbar — never for a lone comment (its thread popover is its UI) */}
        {chrome && !cropping && ctxStyle && ((single && single.type !== 'comment') || groupBox || selEdgeObj) && (
          <div ref={ctxRef} className="absolute z-30" style={ctxStyle}>
            <ContextToolbar
              nodes={selNodes}
              edge={selEdgeObj}
              t={t}
              onPatch={patchSelected}
              onPatchEdge={patchEdge}
              onLayer={layer}
              onDuplicate={duplicateSelected}
              onLock={toggleLock}
              onDelete={deleteSelected}
              onLink={() => setLinkOpen(true)}
              onCrop={() => selNodes[0] && enterCrop(selNodes[0])}
              onAlign={align}
              onDistribute={distribute}
              onWrapAutoLayout={wrapAutoLayout}
              onTidy={tidyUp}
            />
          </div>
        )}

        {/* comment thread — opens beside the pin, flips left near the right edge */}
        {chrome &&
          commentNode &&
          commentNode.type === 'comment' &&
          (() => {
            const W = 256
            const rightX = toScreen(commentNode.x + commentNode.w, commentNode.y).x + 8
            const flip = rightX + W > boardSize.w - 8
            const x = flip ? Math.max(8, toScreen(commentNode.x, commentNode.y).x - 8 - W) : rightX
            const y = Math.min(Math.max(8, toScreen(commentNode.x, commentNode.y).y), Math.max(8, boardSize.h - 240))
            return (
              <CommentThread
                node={commentNode}
                x={x}
                y={y}
                t={t}
                onAdd={(text) => commentAdd(commentNode.id, text)}
                onResolve={() => commentResolve(commentNode.id)}
                onDelete={() => commentDelete(commentNode.id)}
                onClose={() => setOpenComment(null)}
              />
            )
          })()}

        {/* empty-board starter — template gallery (Miro/FigJam: never start on a blank page) */}
        {chrome && !templatesDismissed && data.nodes.length === 0 && data.edges.length === 0 && (
          <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center p-4">
            <div
              className="animate-scale-in pointer-events-auto w-full max-w-2xl rounded-2xl border border-edge bg-card p-5 ring-1 ring-black/5 shadow-[var(--float-shadow)]"
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles size={18} className="text-zinc-300" />
                  <h2 className="text-sm font-semibold text-[rgb(var(--ink-0))]">{t('canvas.templatesTitle')}</h2>
                </div>
                <button
                  className="rounded-lg px-2.5 py-1 text-xs font-medium text-zinc-400 transition-colors hover:bg-highlight hover:text-zinc-100"
                  onClick={() => setTemplatesDismissed(true)}
                >
                  {t('canvas.startBlank')}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {CANVAS_TEMPLATES.map((tpl) => {
                  const Icon = TPL_ICONS[tpl.icon] ?? Sparkles
                  return (
                    <button
                      key={tpl.id}
                      onClick={() => applyTemplate(tpl)}
                      className="group flex flex-col items-start gap-1 rounded-xl border border-edge bg-bg p-3 text-left transition-all hover:-translate-y-0.5 hover:border-accent hover:shadow-[var(--card-shadow-hover)]"
                    >
                      <Icon size={20} className="text-zinc-400" />
                      <div className="mt-1 text-[13px] font-semibold text-[rgb(var(--ink-0))]">{t(tpl.nameKey)}</div>
                      <div className="text-[11px] leading-snug text-zinc-500">{t(tpl.descKey)}</div>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* bottom creation toolbar */}
        {chrome && !cropping && (
          <div className="pointer-events-none absolute bottom-4 left-1/2 z-30 -translate-x-1/2">
            <BottomToolbar
              tool={tool}
              setTool={setTool}
              shape={shape ?? 'rect'}
              setShape={(s) => setShape(s)}
              connType={connType}
              setConnType={setConnType}
              penStyle={penStyle}
              setPenStyle={setPenStyle}
              stickyFill={stickyFill}
              setStickyFill={setStickyFill}
              onAddImage={addImage}
              onUndo={hist.undo}
              onRedo={hist.redo}
              canUndo={hist.canUndo}
              canRedo={hist.canRedo}
              t={t}
            />
          </div>
        )}

        {/* frames panel */}
        {chrome && frames.length > 0 && (
          <div className="absolute bottom-4 z-20" style={{ left: rOff + 16 }} onPointerDown={(e) => e.stopPropagation()}>
            <FramesPanel frames={frames} nodes={data.nodes} onNavigate={(f) => animateToBox(f, 60)} onPresent={enterPresent} t={t} />
          </div>
        )}

        {/* minimap (collapsed by default — unobtrusive) */}
        {chrome && (
          <div className="absolute bottom-4 right-4 z-20" onPointerDown={(e) => e.stopPropagation()}>
            {minimapOpen ? (
              <div className="relative">
                <Minimap
                  nodes={data.nodes}
                  cam={cam}
                  boardW={boardRef.current?.clientWidth ?? 800}
                  boardH={boardRef.current?.clientHeight ?? 600}
                  onPanTo={(wx, wy) => {
                    const r = boardRef.current!.getBoundingClientRect()
                    setCam((c) => ({ ...c, x: r.width / 2 - wx * c.k, y: r.height / 2 - wy * c.k }))
                  }}
                />
                <button
                  className="absolute right-1.5 top-1.5 rounded-lg bg-surface p-1 text-zinc-400 transition-colors hover:text-zinc-100"
                  onClick={() => setMinimapOpen(false)}
                  title={t('canvas.minimap')}
                >
                  <X size={12} />
                </button>
              </div>
            ) : (
              <button
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-edge bg-card text-[rgb(var(--ink-200))] ring-1 ring-black/5 shadow-[var(--float-shadow)] backdrop-blur transition-colors hover:bg-highlight hover:text-[rgb(var(--ink-0))]"
                onClick={() => setMinimapOpen(true)}
                title={t('canvas.minimap')}
              >
                <MapIcon size={16} />
              </button>
            )}
          </div>
        )}

        {/* presentation controls */}
        {present != null && frames[present] && (
          <div className="absolute bottom-6 left-1/2 z-50 -translate-x-1/2">
            <div className="flex items-center gap-2 rounded-full border border-edge bg-surface px-3 py-2 shadow-[var(--float-shadow)] backdrop-blur">
              <button className="rounded-lg p-1.5 text-zinc-300 hover:bg-raised disabled:opacity-30" disabled={present === 0} onClick={() => presentGo(present - 1)}>
                <ChevronLeft size={18} />
              </button>
              <span className="min-w-[52px] text-center text-xs tabular-nums text-zinc-300">
                {present + 1} / {frames.length}
              </span>
              <button
                className="rounded-lg p-1.5 text-zinc-300 hover:bg-raised disabled:opacity-30"
                disabled={present === frames.length - 1}
                onClick={() => presentGo(present + 1)}
              >
                <ChevronRight size={18} />
              </button>
              <div className="mx-1 h-5 w-px bg-edge" />
              <button className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-zinc-300 hover:bg-raised" onClick={exitPresent}>
                <X size={15} /> {t('canvas.exit')}
              </button>
            </div>
          </div>
        )}

        {/* right-click menu */}
        {chrome && menu && (
          <>
            <div className="fixed inset-0 z-40" onPointerDown={(e) => { e.stopPropagation(); setMenu(null) }} />
            <div
              className="absolute z-50 min-w-[160px] rounded-2xl border border-edge bg-surface p-1 text-sm shadow-[var(--float-shadow)]"
              style={{ left: menu.x - boardRef.current!.getBoundingClientRect().left, top: menu.y - boardRef.current!.getBoundingClientRect().top }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              {menu.onNode ? (
                <>
                  <MenuItem label={t('canvas.duplicate')} onClick={() => { duplicateSelected(); setMenu(null) }} />
                  <MenuItem label={t('canvas.toFront')} onClick={() => { layer('front'); setMenu(null) }} />
                  <MenuItem label={t('canvas.toBack')} onClick={() => { layer('back'); setMenu(null) }} />
                  <MenuItem label={t('canvas.lock')} onClick={() => { toggleLock(); setMenu(null) }} />
                  <div className="my-1 h-px bg-edge" />
                  <MenuItem label={t('common.delete')} danger onClick={() => { deleteSelected(); setMenu(null) }} />
                </>
              ) : (
                <>
                  <MenuItem label={t('canvas.addNote')} onClick={() => { setNotePicker(true); setMenu(null) }} />
                  <MenuItem label={t('canvas.addTask')} onClick={() => { setTaskPicker(true); setMenu(null) }} />
                  <div className="my-1 h-px bg-edge" />
                  <MenuItem label={t('canvas.paste')} disabled={!clip.current.nodes.length} onClick={() => { paste(menu.world); setMenu(null) }} />
                  <MenuItem label={t('canvas.selectAll')} onClick={() => { setSel(new Set(data.nodes.map((n) => n.id))); setMenu(null) }} />
                  <MenuItem label={t('canvas.fit')} onClick={() => { fit(true); setMenu(null) }} />
                </>
              )}
            </div>
          </>
        )}

        {/* connector drop menu — create & wire a card or a vault note at the drop point */}
        {chrome && connectMenu && (
          <>
            <div className="fixed inset-0 z-40" onPointerDown={(e) => { e.stopPropagation(); setConnectMenu(null) }} />
            <div
              className="absolute z-50 min-w-[200px] rounded-2xl border border-edge bg-surface p-1 text-sm shadow-[var(--float-shadow)] animate-scale-in"
              style={{
                left: connectMenu.sx - boardRef.current!.getBoundingClientRect().left,
                top: connectMenu.sy - boardRef.current!.getBoundingClientRect().top,
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <MenuItem label={t('canvas.connectAddCard')} onClick={addCardFromConnector} />
              <MenuItem label={t('canvas.connectAddNote')} onClick={openNotePickerForConnector} />
              <MenuItem label={t('canvas.connectAddTask')} onClick={openTaskPickerForConnector} />
            </div>
          </>
        )}
      </div>

      {/* note picker */}
      {notePicker && (
        <Modal title={t('canvas.pickNote')} onClose={() => { setNotePicker(false); setPendingConnect(null) }} width="max-w-md">
          <div className="max-h-80 space-y-0.5 overflow-y-auto">
            {notes.length === 0 && <div className="py-6 text-center text-sm text-zinc-500">{t('notes.emptyTitle')}</div>}
            {notes.map((nt) => (
              <button
                key={nt.id}
                onClick={() => addNoteCard(nt)}
                className="block w-full truncate rounded-lg px-3 py-2 text-left text-sm text-zinc-300 transition-colors hover:bg-raised hover:text-white"
              >
                {nt.title || nt.content.slice(0, 40) || t('notes.untitled')}
              </button>
            ))}
          </div>
        </Modal>
      )}

      {/* task picker — live task cards */}
      {taskPicker && (
        <Modal title={t('canvas.pickTask')} onClose={() => { setTaskPicker(false); setPendingConnect(null) }} width="max-w-md">
          <div className="max-h-80 space-y-0.5 overflow-y-auto">
            {tasks.length === 0 && <div className="py-6 text-center text-sm text-zinc-500">{t('canvas.noTasks')}</div>}
            {tasks.map((tk) => (
              <button
                key={tk.id}
                onClick={() => addTaskCard(tk)}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-zinc-300 transition-colors hover:bg-raised hover:text-white"
              >
                {tk.done ? <CheckCircle2 size={14} className="shrink-0 text-[#46A758]" /> : <Circle size={14} className="shrink-0 text-zinc-500" />}
                <span className={`truncate ${tk.done ? 'text-zinc-500 line-through' : ''}`}>{tk.title || t('canvas.taskUntitled')}</span>
              </button>
            ))}
          </div>
        </Modal>
      )}

      {/* link modal */}
      {linkOpen && (
        <LinkModal
          initial={single?.href ?? ''}
          onClose={() => setLinkOpen(false)}
          onSave={(href) => {
            patchSelected({ href: href || undefined })
            setLinkOpen(false)
          }}
        />
      )}
    </div>
  )
}

// TopBtn / MenuItem / SelectionFrame / LinkModal now live in ../canvas/BoardParts
