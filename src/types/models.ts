export type TitleType = 'anime' | 'movie' | 'series' | 'cartoon' | 'youtube' | 'book'
export type TitleStatus = 'watching' | 'completed' | 'planned' | 'on_hold' | 'dropped'
export type MomentTag = 'epic' | 'funny' | 'sad' | 'important' | 'beautiful'
export type SubtitleLang = 'ru' | 'en' | 'off'

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
  pinned: 0 | 1
  source: string // 'user' or an agent name
  created_at: string
  updated_at: string
  // derived
  linked_title_name?: string | null
  project_name?: string | null
}

export interface JournalEntry {
  id: number
  day: string // YYYY-MM-DD
  mood: number | null // 1..5
  content: string
  created_at: string
  updated_at: string
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
  tags: string[]
  project_id: number | null
  source: string // 'user' or an agent name
  created_at: string
  completed_at: string | null
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
  // derived
  asset_count?: number
  note_count?: number
  open_task_count?: number
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
  created_at: string
}

export interface Game {
  id: number
  name: string
  exe_path: string
  exe_name: string // basename, lowercased — what the process scan matches
  cover_path: string | null
  total_seconds: number
  last_played: string | null
  created_at: string
  // derived
  running?: boolean
}

export interface GameSession {
  id: number
  game_id: number
  started_at: string
  ended_at: string | null
  seconds: number
}

export type CanvasNodeType = 'text' | 'note' | 'image'

export interface CanvasNode {
  id: string
  type: CanvasNodeType
  x: number
  y: number
  w: number
  h: number
  text?: string // text card
  noteId?: number // note card → links to a note
  path?: string // image card → local image path
  color?: string | null
}

export interface CanvasEdge {
  id: string
  from: string // node id
  to: string // node id
  label?: string
}

export interface CanvasData {
  nodes: CanvasNode[]
  edges: CanvasEdge[]
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

export type MemoryKind = 'moment' | 'title' | 'book' | 'note' | 'journal' | 'project'

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

export const TITLE_STATUSES: TitleStatus[] = ['watching', 'completed', 'planned', 'on_hold', 'dropped']

export const STATUS_COLORS: Record<TitleStatus, string> = {
  watching: '#7aa8c4',
  completed: '#6fb06f',
  planned: '#8a8278',
  on_hold: '#c9a96b',
  dropped: '#c47a7a',
}

export const TITLE_TYPES: TitleType[] = ['anime', 'movie', 'series', 'cartoon', 'youtube', 'book']

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
