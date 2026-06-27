// auto-update lifecycle (electron-updater) surfaced to the renderer
export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available'; version: string }
  | { state: 'none' }
  | { state: 'downloading'; percent: number }
  | { state: 'ready'; version: string }
  | { state: 'error'; message: string }

// A typed user property (Capacities-style), stored in an object's `props` JSON bag.
export type PropType = 'text' | 'number' | 'date' | 'checkbox' | 'url' | 'select'
export interface PropField {
  id: string // stable id for React keys / reorder
  name: string // display name
  type: PropType
  value: string | number | boolean | null
  options?: string[] // choices when type === 'select'
}
// Free-form per-object JSON bag. User properties live under `fields`; more keys
// (object type, cover, …) can be added later without a schema change.
export interface ObjectProps {
  fields?: PropField[]
  type?: number // object type id (Capacities-style) → object_types row
  category?: string // 'plan' for hub plan documents
}

// A user-defined object type (Capacities): icon + colour + preset properties that
// seed an object's props.fields when the type is assigned.
export interface ObjectType {
  id: number
  name: string
  icon: string // lucide icon key (see TYPE_ICONS)
  hue: string // colour key from the --obj-* palette (see objectColors)
  fields: PropField[] // preset property templates
  created_at: string
}

export interface Note {
  id: number
  title: string
  content: string
  tags: string[]
  project_id: number | null
  folder_id: number | null // Obsidian-style vault folder (NULL = root)
  pinned: 0 | 1
  source: string // 'user' or an agent name
  created_at: string
  updated_at: string
  deleted_at: string | null
  props?: ObjectProps // typed user properties (Capacities-style)
  // derived
  project_name?: string | null
}

// a daily note (Capacities-style): one row per calendar day, keyed by `day` = 'YYYY-MM-DD'.
// Powers the Calendar page; stored in the `journal_entries` table (migration 003).
export interface JournalEntry {
  id: number
  day: string // 'YYYY-MM-DD'
  mood: number | null // 1..5, optional
  content: string
  created_at: string
  updated_at: string
}

// a folder in the Notes vault — nests via parent_id (NULL = root)
export interface NoteFolder {
  id: number
  name: string
  parent_id: number | null
  sort: number
  created_at: string
}

// ---------- universal Favorites ("pin anything") ----------
// any entity across every module can be pinned to one quick-access list
export type FavoriteKind = 'note' | 'project' | 'canvas' | 'task' | 'vault' | 'route'

export interface Favorite {
  id: number
  kind: FavoriteKind
  ref: string // entity identity: numeric id as text, or a path/route string
  label: string // display label (re-resolved live from the source row on list)
  sublabel: string | null
  cover_path: string | null
  route: string | null // where clicking navigates ('' / null = derive from kind+ref)
  sort: number
  created_at: string
}

// payload for pinning — ref + a display snapshot (label/cover re-resolved live later)
export interface FavoriteInput {
  kind: FavoriteKind
  ref: string | number
  label?: string
  sublabel?: string | null
  cover_path?: string | null
  route?: string | null
}

// ---------- edges: the universal relations layer ----------
// every object is a NODE (type, id); every relationship is a directed EDGE
// `src --kind--> dst`. One table powers containment, references and (later) tags.
export type NodeType = 'task' | 'note' | 'project' | 'canvas' | 'vault' | 'tag'
export type EdgeKind = 'contains' | 'refers' | 'tagged'

export interface NodeRef {
  type: NodeType
  id: string | number
}

export interface RawEdge {
  id: number
  src_type: NodeType
  src_id: string
  kind: EdgeKind
  dst_type: NodeType
  dst_id: string
}

// a node resolved against its live source row, ready to render
export interface ResolvedNode {
  type: NodeType
  id: string
  label: string
  route: string | null
  cover: string | null
  missing?: boolean // source row was deleted — render a tombstone, still unlinkable
}

// one neighbour of a focus node + the edge connecting them
export interface RelatedEdge {
  edgeId: number
  kind: EdgeKind
  direction: 'in' | 'out' // out = focus → node; in = node → focus
  node: ResolvedNode
}

// a full-text search hit (FTS5) — title + a content snippet around the match
export interface NoteSearchHit {
  id: number
  title: string
  snippet: string
}

export type TaskPriority = 'none' | 'low' | 'high'
export type TaskStatus = 'todo' | 'doing' | 'done'

export interface Task {
  id: number
  title: string
  note: string | null
  done: 0 | 1
  status: TaskStatus
  priority: TaskPriority
  due_date: string | null
  remind_at: string | null // 'YYYY-MM-DD HH:MM:00' — fires an OS notification
  reminded: 0 | 1 // set once the scheduler has shown the notification
  tags: string[]
  project_id: number | null
  source: string // 'user' or an agent name
  created_at: string
  completed_at: string | null
  deleted_at: string | null
  props?: ObjectProps // typed user properties (Capacities-style)
  // derived
  project_name?: string | null
}

// kanban columns, in pipeline order
export const TASK_STATUSES: TaskStatus[] = ['todo', 'doing', 'done']
export const TASK_STATUS_COLORS: Record<TaskStatus, string> = {
  todo: '#8a8278', // text-2 gray
  doing: '#e67d22', // accent — actively in progress
  done: '#6fb06f', // active green
}

export type VaultKind = 'image' | 'video' | 'audio' | 'doc' | 'archive' | 'other'
// folder = a virtual folder you create; diskfolder = a live link to an OS directory
export type VaultEntryKind = VaultKind | 'folder' | 'diskfolder'

export interface VaultFile {
  id: number
  name: string
  path: string
  size: number
  kind: VaultEntryKind
  tags: string[]
  parent_id: number | null
  created_at: string
}

// a live entry read straight from a real OS directory (browsing inside a diskfolder)
export interface VaultDiskEntry {
  name: string
  path: string
  isDir: boolean
  size: number
  kind: VaultKind
}

export type ProjectKind = string // free-text type (suggestions in PROJECT_KIND_SUGGESTIONS)
export type ProjectStatus = 'idea' | 'active' | 'review' | 'done' | 'archived'
export type ProjectAssetKind = 'folder' | 'file' | 'url' | 'image'

// one recent item inside a hub — the "pulse" preview on the hub card. Notes carry
// updated_at; tasks have no updated_at, so their created_at stands in.
export interface HubRecentItem {
  kind: 'note' | 'task'
  id: number
  title: string
  at: string // timestamp the row was last touched (note.updated_at / task.created_at)
  done: 0 | 1 // tasks only — strike through completed ones
}

export interface Project {
  id: number
  name: string
  client: string | null
  kind: string
  status: ProjectStatus
  color: string | null
  cover_path: string | null
  icon: string | null // emoji avatar for the hub header
  deadline: string | null // YYYY-MM-DD
  tools: string[]
  description: string | null
  pinned: 0 | 1
  sort: number
  created_at: string
  updated_at: string
  deleted_at: string | null
  // derived
  asset_count?: number
  note_count?: number
  open_task_count?: number
  task_count?: number // total non-deleted tasks — for the progress ring
  recent?: HubRecentItem[] // 3 freshest notes/tasks — the card "pulse" (list query only)
  last_activity?: string // newest of (updated_at, freshest item) — "last edited" sort/label
}

export interface ProjectAsset {
  id: number
  project_id: number
  kind: ProjectAssetKind
  path: string | null
  url: string | null
  label: string | null
  thumb_path: string | null
  sort: number
  section_id: number | null // user-created section ("folder") it belongs to, NULL = ungrouped
  created_at: string
}

export interface ProjectSection {
  id: number
  project_id: number
  name: string
  sort: number
  created_at: string
}

// a logged work stint inside a hub
export interface ProjectSession {
  id: number
  project_id: number
  started_at: string | null
  ended_at: string | null
  duration_seconds: number
  title: string | null
  report: string | null // pasted markdown report
  changes_json: string | null // JSON of SessionChanges
  created_at: string
}

// a hub's changelog / version entry (patch)
export type PatchStatus = 'planned' | 'in_progress' | 'released'

export interface ProjectPatch {
  id: number
  project_id: number
  version: string | null
  title: string | null
  body: string | null // markdown notes
  status: PatchStatus
  tags: string[]
  released_at: string | null // YYYY-MM-DD
  sort: number
  created_at: string
}

export const PATCH_STATUSES: PatchStatus[] = ['planned', 'in_progress', 'released']

export const PATCH_STATUS_COLORS: Record<PatchStatus, string> = {
  planned: '#8a8278',
  in_progress: '#e67d22',
  released: '#6fb06f',
}

// what changed in the hub's linked folders between two sessions
export interface SessionChanges {
  added: string[] // capped to 1000 for display; see *Count for the true totals
  removed: string[]
  modified: string[]
  addedCount?: number
  removedCount?: number
  modifiedCount?: number
  scanned: number // total files seen this scan (0 = nothing linked to scan)
}

// 'text' | 'note' | 'image' are the legacy v0.18 types (kept for back-compat);
// 'sticky' | 'shape' | 'frame' arrive with the Miro-board rework (v0.26);
// 'pen' | 'comment' arrive with Phase 2 (v0.27).
export type CanvasNodeType = 'text' | 'note' | 'task' | 'image' | 'sticky' | 'shape' | 'frame' | 'pen' | 'comment'

// ≥12 shapes — drawn as a stretched SVG path in a 0..100 box (non-scaling stroke).
export type CanvasShape =
  | 'rect'
  | 'roundRect'
  | 'ellipse'
  | 'diamond'
  | 'triangle'
  | 'parallelogram'
  | 'cylinder'
  | 'cloud'
  | 'star'
  | 'arrowRight'
  | 'hexagon'
  | 'pentagon'

export type CanvasStrokeStyle = 'solid' | 'dashed' | 'dotted'
export type CanvasAlign = 'left' | 'center' | 'right'

export interface CanvasNode {
  id: string
  type: CanvasNodeType
  x: number
  y: number
  w: number
  h: number
  rotation?: number // degrees, clockwise
  // content
  text?: string // text / sticky / shape label
  noteId?: number // note card → links to a note
  taskId?: number // task card → links to a live task (checkbox toggles it)
  path?: string // image card → local image path
  crop?: { x: number; y: number; w: number; h: number } // image crop: normalized source rect (0..1)
  shape?: CanvasShape // when type === 'shape'
  // fill / border
  color?: string | null // legacy accent (top border on text/note/image) — kept for back-compat
  fill?: string | null
  stroke?: string | null
  strokeWidth?: number
  strokeStyle?: CanvasStrokeStyle
  radius?: number // corner radius (px) for rect shapes / images / sticky / text-with-fill
  opacity?: number // 0..1
  // text styling
  fontSize?: number
  fontFamily?: string // CSS font stack key (see FONTS in canvas/constants)
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strike?: boolean
  align?: CanvasAlign
  textColor?: string | null
  // text resize mode: undefined/true = auto-WIDTH (box hugs the text both ways, no
  // wrap); false = fixed width (set by dragging a side handle → wraps + auto-height)
  autoWidth?: boolean
  // behaviour
  locked?: boolean
  href?: string // link-to-URL
  frameId?: string | null // membership in a frame
  // pen (freehand): points in local coords relative to x,y
  points?: { x: number; y: number }[]
  // comment pin: a thread of messages + resolved flag
  thread?: { text: string }[]
  resolved?: boolean
  // sticky (FigJam-style): the note's author + creation time shown in the footer
  author?: string
  createdAt?: number // epoch ms — when the node was created
  // frame auto-layout (Figma-style): stack children + hug their content
  autoLayout?: { dir: 'v' | 'h'; gap: number; pad: number }
}

// A ruler guide: an infinite straight line. axis 'h' = horizontal line at world
// y === pos; axis 'v' = vertical line at world x === pos.
export interface CanvasGuide {
  axis: 'h' | 'v'
  pos: number
}

export type CanvasConnectorType = 'straight' | 'elbow' | 'curve'
export type CanvasArrowEnds = 'none' | 'start' | 'end' | 'both'
export type CanvasAnchor = 't' | 'r' | 'b' | 'l' | 'tl' | 'tr' | 'br' | 'bl'

export interface CanvasEdge {
  id: string
  from: string // node id, or '' when the endpoint is a free world point
  to: string
  fromAnchor?: CanvasAnchor
  toAnchor?: CanvasAnchor
  fromPoint?: { x: number; y: number } // world coords (free endpoint)
  toPoint?: { x: number; y: number }
  type?: CanvasConnectorType
  arrow?: CanvasArrowEnds
  dash?: boolean
  color?: string | null
  width?: number
  label?: string
}

export interface CanvasViewport {
  x: number
  y: number
  k: number
}

export interface CanvasData {
  nodes: CanvasNode[]
  edges: CanvasEdge[]
  viewport?: CanvasViewport // last camera — restored on open
  guides?: CanvasGuide[] // ruler guides (infinite lines)
}

export interface Canvas {
  id: number
  name: string
  data: CanvasData
  created_at: string
  updated_at: string
}

export interface AppSettings {
  accentColor: string
  language: 'en' | 'ru'
  theme: 'dark' | 'light' | 'system'
  apiEnabled: boolean
  apiPort: number
  apiToken: string
  brainFolder: string // Obsidian-style portable mirror folder ('' = Documents/Bard Brain)
  profileName: string // display name shown in the greeting / profile ('' = "Bard")
  profileAvatar: string // saved avatar image path ('' = initial letter on accent)
}

export interface TaskComment {
  id: number
  task_id: number
  body: string
  created_at: string
}

// an image/file attached to a task, shown in the detail peek. Lives in a lazily-created
// table (CREATE TABLE IF NOT EXISTS) so it never collides with numbered migrations.
export interface TaskAttachment {
  id: number
  task_id: number
  path: string
  name: string
  created_at: string
}

export const PROJECT_STATUSES: ProjectStatus[] = ['idea', 'active', 'review', 'done', 'archived']

export const PROJECT_STATUS_COLORS: Record<ProjectStatus, string> = {
  idea: '#8a8278',
  active: '#6fb06f',
  review: '#a87dc4',
  done: '#7aa8c4',
  archived: '#4a4744',
}

// type suggestions only — the hub "type" field is free-text (any string allowed).
// PKM-flavoured now: a hub is a place/area of knowledge, not a video deliverable.
export const PROJECT_KIND_SUGGESTIONS = ['Область жизни', 'Проект', 'Ресурс', 'Заметки', 'Дневник', 'Архив']

// tool suggestions only — tools are free tags now
export const PROJECT_TOOL_SUGGESTIONS = ['Blender', 'DaVinci', 'After Effects', 'Photoshop', 'Premiere', 'Cinema 4D', 'Figma']

export const PROJECT_COLORS = ['#c4622d', '#c89a3c', '#8a9a5b', '#5f8a82', '#6f8bb0', '#9a7aa0', '#c07d6a', '#a98c6b']

// warm identity palette — when a hub has no explicit colour, it still gets a stable
// one (by id) so its icon tile + pulse dots feel intentional, not grey. Hues sit in
// the terracotta family so they harmonise with the Hubs skin.
export const HUB_PALETTE = ['#c4622d', '#c89a3c', '#8a9a5b', '#5f8a82', '#6f8bb0', '#9a7aa0', '#c07d6a', '#b08a4a']

/** Stable accent for a hub: explicit colour, else a warm one derived from its id. */
export function hubColor(p: Pick<Project, 'id' | 'color'>): string {
  return p.color || HUB_PALETTE[Math.abs(p.id) % HUB_PALETTE.length]
}

// preset cover gradients (id → CSS background) — pickable in the project modal,
// stored as cover_path = "gradient:<id>" and rendered by <ProjectCover/>.
export const COVER_TEMPLATES: Array<{ id: string; css: string }> = [
  { id: 'tangerine', css: 'linear-gradient(135deg, #FF9F45, #F2682C)' },
  { id: 'peach', css: 'linear-gradient(135deg, #FFC59E, #FF8A5B)' },
  { id: 'espresso', css: 'linear-gradient(135deg, #A38B72, #4A3B28)' },
  { id: 'dusk', css: 'linear-gradient(160deg, #6D5DF0, #C86DD7)' },
  { id: 'ocean', css: 'linear-gradient(135deg, #4F9DF0, #38C6C9)' },
  { id: 'forest', css: 'linear-gradient(135deg, #56C271, #2BA39B)' },
  { id: 'grape', css: 'linear-gradient(135deg, #A66CE6, #E06AA0)' },
  { id: 'sand', css: 'linear-gradient(135deg, #F4F2EC, #CFC9BB)' },
]

/** resolve a cover_path to a CSS gradient, or null if it's a real image / unset */
export function coverGradient(cover: string | null | undefined): string | null {
  if (!cover || !cover.startsWith('gradient:')) return null
  return COVER_TEMPLATES.find((c) => c.id === cover.slice(9))?.css ?? null
}
