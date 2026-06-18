export type TitleType = 'anime' | 'movie' | 'series' | 'cartoon' | 'youtube' | 'book'
export type TitleStatus = 'watching' | 'completed' | 'planned' | 'on_hold' | 'dropped'
export type MomentTag = 'epic' | 'funny' | 'sad' | 'important' | 'beautiful'
export type SubtitleLang = 'ru' | 'en' | 'off'

// auto-update lifecycle (electron-updater) surfaced to the renderer
export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available'; version: string }
  | { state: 'none' }
  | { state: 'downloading'; percent: number }
  | { state: 'ready'; version: string }
  | { state: 'error'; message: string }

export interface Title {
  id: number
  title: string
  original_title: string | null
  type: TitleType
  status: TitleStatus
  rating: number | null
  cover_path: string | null
  total_episodes: number
  reading_progress: number
  year: number | null
  genres: string[]
  tags: string[]
  notes: string | null
  intro_end_seconds: number | null
  date_added: string
  date_started: string | null
  date_finished: string | null
  // derived (filled by list queries)
  episode_count?: number
  watched_count?: number
  last_watched?: string | null
}

export interface Episode {
  id: number
  title_id: number
  episode_number: number
  season: number
  name: string | null
  file_path: string | null
  duration_seconds: number | null
  watched: 0 | 1
  watch_date: string | null
  watch_position_seconds: number
}

export interface Moment {
  id: number
  title_id: number
  episode_id: number | null
  timestamp_seconds: number
  screenshot_path: string | null
  note: string | null
  tag: MomentTag | null
  created_at: string
  // derived
  title_name?: string
  episode_number?: number | null
  episode_name?: string | null
}

export interface Note {
  id: number
  title: string
  content: string
  tags: string[]
  linked_title_id: number | null
  project_id: number | null
  folder_id: number | null // Obsidian-style vault folder (NULL = root)
  pinned: 0 | 1
  source: string // 'user' or an agent name
  created_at: string
  updated_at: string
  deleted_at: string | null
  // derived
  linked_title_name?: string | null
  project_name?: string | null
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
export type FavoriteKind = 'note' | 'project' | 'title' | 'track' | 'canvas' | 'task' | 'vault' | 'route'

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

// ---------- Library collections ("folders") ----------
// a user-created folder that gathers ANY library entity into one named tile
export type CollectionItemKind = 'title' | 'vault' | 'playlist' | 'track' | 'note' | 'canvas'

export interface Collection {
  id: number
  name: string
  icon: string | null
  color: string | null
  sort: number
  created_at: string
  item_count: number // computed: live (non-stale) member count
  covers: string[] // computed: up to 4 cover paths for the tile's 2×2 preview
}

export interface CollectionItem {
  id: number // the membership row id (for removal), NOT the entity id
  kind: string
  ref: string // entity id as text
  label: string
  sublabel: string | null
  cover_path: string | null
  route: string | null // where clicking navigates (http URL → opens externally)
}

// ---------- Library hub roll-up ----------
// per-category count + a few cover paths for the "Мои файлы" tiles, read live from
// the source tables so the hub mirrors everything in Bard regardless of where added
export interface LibraryCategorySummary {
  count: number
  covers: string[]
}
export interface LibrarySummary {
  videos: LibraryCategorySummary
  books: LibraryCategorySummary
  music: LibraryCategorySummary
  documents: LibraryCategorySummary
  images: LibraryCategorySummary
  files: LibraryCategorySummary
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
  linked_title_id: number | null // cross-link to a Library title (sources, book, …)
  source: string // 'user' or an agent name
  created_at: string
  completed_at: string | null
  deleted_at: string | null
  // derived
  project_name?: string | null
  linked_title_name?: string | null
  linked_title_type?: TitleType | null
}

// kanban columns, in pipeline order
export const TASK_STATUSES: TaskStatus[] = ['todo', 'doing', 'done']
export const TASK_STATUS_COLORS: Record<TaskStatus, string> = {
  todo: '#8a8278', // text-2 gray
  doing: '#e67d22', // accent — actively in progress
  done: '#6fb06f', // active green
}

export type MusicService = 'spotify' | 'youtube' | 'yandex' | 'soundcloud' | 'apple' | 'other'

export interface Playlist {
  id: number
  title: string
  url: string
  service: MusicService
  cover_path: string | null
  notes: string | null
  created_at: string
}

// ---------- local music library (a "local Spotify") ----------
export interface Track {
  id: number
  path: string
  title: string
  artist: string | null
  album: string | null
  album_artist: string | null
  genre: string | null
  year: number | null
  track_no: number | null
  disc_no: number | null
  duration_seconds: number | null
  cover_path: string | null
  liked: 0 | 1
  play_count: number
  last_played: string | null
  added_at: string
}

// an album view, aggregated from tracks (album + album_artist is the identity)
export interface MusicAlbum {
  key: string // `${album_artist ?? artist} ${album}` — stable id for routing
  album: string
  artist: string // album_artist, falling back to the most common track artist
  cover_path: string | null
  year: number | null
  track_count: number
  duration_seconds: number
}

// an artist view, aggregated from tracks
export interface MusicArtist {
  name: string
  cover_path: string | null // a representative cover
  track_count: number
  album_count: number
}

export interface MusicPlaylist {
  id: number
  name: string
  cover_path: string | null
  created_at: string
  // derived
  track_count?: number
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

export interface Project {
  id: number
  name: string
  client: string | null
  kind: string
  status: ProjectStatus
  color: string | null
  cover_path: string | null
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

export interface MetaCandidate {
  title: string
  original_title: string | null
  year: number | null
  episodes: number | null
  genres: string[]
  description: string
  imageUrl: string | null
  source: string
}

export type MemoryKind = 'moment' | 'title' | 'book' | 'note' | 'project'

export interface MemoryEvent {
  key: string
  kind: MemoryKind
  date: string // YYYY-MM-DD HH:MM:SS
  label: string
  sublabel: string | null
  ref_id: number
}

export interface YoutubeSource {
  id: number
  title_id: number
  channel_url: string | null
  playlist_url: string | null
  last_synced: string | null
  title_name?: string
}

export interface YoutubeVideo {
  id: string
  title: string
  url: string
  duration: number | null
}

export interface ContinueItem extends Episode {
  title_name: string
  title_type: TitleType
  cover_path: string | null
  total_episodes: number
}

export interface TitleFilters {
  search?: string
  type?: TitleType | 'all'
  status?: TitleStatus | 'all'
  genre?: string
  year?: number
  minRating?: number
  sort?: 'date_added' | 'title' | 'rating' | 'progress' | 'last_watched'
  sortDir?: 'asc' | 'desc'
}

export interface StatsSummary {
  titles: number
  episodesWatched: number
  secondsWatched: number
  daysWithActivity: number
  moments: number
  currentStreak: number
  longestStreak: number
}

export interface HeatmapDay {
  day: string // YYYY-MM-DD
  seconds: number
}

export interface TypeSlice {
  type: TitleType
  count: number
  seconds: number
}

export interface MonthBar {
  month: string // YYYY-MM
  seconds: number
}

export interface AppSettings {
  mediaFolders: string[]
  musicFolders: string[] // folders scanned for the local music library
  screenshotsDir: string
  defaultSubtitleLang: SubtitleLang
  autoPlayNext: boolean
  skipIntroEnabled: boolean
  accentColor: string
  ytDlpPath: string
  mpvPath: string
  language: 'en' | 'ru'
  theme: 'dark' | 'light' | 'system'
  apiEnabled: boolean
  apiPort: number
  apiToken: string
  brainFolder: string // Obsidian-style portable mirror folder ('' = Documents/Bard Brain)
  profileName: string // display name shown in the greeting / profile ('' = "Bard")
  profileAvatar: string // saved avatar image path ('' = initial letter on accent)
}

export interface SubtitleTrack {
  label: string
  lang: string
  vtt: string
}

export interface ParsedFile {
  path: string
  fileName: string
  parsedTitle: string
  episode: number | null
  season: number | null
}

export interface ImportGroup {
  titleId?: number
  newTitle?: { title: string; type: TitleType }
  episodes: Array<{ path: string; episode: number | null; season: number | null }>
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

export const TITLE_STATUSES: TitleStatus[] = ['watching', 'completed', 'planned', 'on_hold', 'dropped']

export const STATUS_COLORS: Record<TitleStatus, string> = {
  watching: '#7aa8c4',
  completed: '#6fb06f',
  planned: '#8a8278',
  on_hold: '#c9a96b',
  dropped: '#c47a7a',
}

export const TITLE_TYPES: TitleType[] = ['movie', 'series', 'anime', 'cartoon', 'youtube', 'book']

export const MOMENT_TAGS: MomentTag[] = ['epic', 'funny', 'sad', 'important', 'beautiful']

export const MOMENT_TAG_COLORS: Record<MomentTag, string> = {
  epic: '#a87dc4',
  funny: '#c9a96b',
  sad: '#7aa8c4',
  important: '#c47a7a',
  beautiful: '#6fb06f',
}

export const PROJECT_STATUSES: ProjectStatus[] = ['idea', 'active', 'review', 'done', 'archived']

export const PROJECT_STATUS_COLORS: Record<ProjectStatus, string> = {
  idea: '#8a8278',
  active: '#6fb06f',
  review: '#a87dc4',
  done: '#7aa8c4',
  archived: '#4a4744',
}

// type suggestions only — the project "type" field is free-text (any string allowed)
export const PROJECT_KIND_SUGGESTIONS = ['Видео', 'Моушн', 'Монтаж', '3D', 'Дизайн', 'VFX', 'Анимация']

// tool suggestions only — tools are free tags now
export const PROJECT_TOOL_SUGGESTIONS = ['Blender', 'DaVinci', 'After Effects', 'Photoshop', 'Premiere', 'Cinema 4D', 'Figma']

export const PROJECT_COLORS = ['#e67d22', '#7aa8c4', '#6fb06f', '#c9a96b', '#a87dc4', '#c47a7a', '#3a8a8a', '#8a8278']

// preset cover gradients (id → CSS background) — pickable in the project modal,
// stored as cover_path = "gradient:<id>" and rendered by <ProjectCover/>.
export const COVER_TEMPLATES: Array<{ id: string; css: string }> = [
  { id: 'tangerine', css: 'linear-gradient(135deg, #E67D22, #C15F3C)' },
  { id: 'peach', css: 'linear-gradient(135deg, #FFB38A, #E67D22)' },
  { id: 'espresso', css: 'linear-gradient(135deg, #847A6D, #2C2418)' },
  { id: 'dusk', css: 'linear-gradient(160deg, #2C2418, #E67D22)' },
  { id: 'ocean', css: 'linear-gradient(135deg, #7AA8C4, #3A8A8A)' },
  { id: 'forest', css: 'linear-gradient(135deg, #6FB06F, #3A8A8A)' },
  { id: 'grape', css: 'linear-gradient(135deg, #A87DC4, #C47A7A)' },
  { id: 'sand', css: 'linear-gradient(135deg, #F4F3EE, #B1ADA1)' },
]

/** resolve a cover_path to a CSS gradient, or null if it's a real image / unset */
export function coverGradient(cover: string | null | undefined): string | null {
  if (!cover || !cover.startsWith('gradient:')) return null
  return COVER_TEMPLATES.find((c) => c.id === cover.slice(9))?.css ?? null
}
