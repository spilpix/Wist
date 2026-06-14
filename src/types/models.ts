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

export interface Task {
  id: number
  title: string
  note: string | null
  done: 0 | 1
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

export interface VaultFile {
  id: number
  name: string
  path: string
  size: number
  kind: VaultKind
  tags: string[]
  created_at: string
}

export type ProjectKind = 'video' | 'motion' | 'edit' | '3d' | 'design' | 'other'
export type ProjectStatus = 'idea' | 'active' | 'review' | 'done' | 'archived'
export type ProjectAssetKind = 'folder' | 'file' | 'url' | 'image'

export interface Project {
  id: number
  name: string
  client: string | null
  kind: ProjectKind
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

export interface LeagueRank {
  tier: string
  division: string
  lp: number
  wins: number
  losses: number
}

export interface LeagueAbility {
  slot: 'P' | 'Q' | 'W' | 'E' | 'R'
  name: string
  iconUrl: string
}

export interface LeagueBuild {
  role: string
  coreItems: Array<{ name: string; iconUrl: string }>
  runes: string
  keystone: string
  skill: string
  tips: string[]
}

export interface LeagueChampion {
  id: string
  name: string
  title: string
  tags: string[]
  squareUrl: string
  abilities: LeagueAbility[]
  build: LeagueBuild
}

export interface LeagueLivePlayer {
  name: string
  champion: string
  championSquareUrl: string
  kills: number
  deaths: number
  assists: number
  cs: number
  level: number
  items: string[]
  isSelf: boolean
}

export interface LeaguePoll {
  connected: boolean
  phase: string // None | Lobby | ChampSelect | InProgress | …
  summoner?: { name: string; tag: string; level: number; iconUrl: string }
  ranked?: { solo?: LeagueRank; flex?: LeagueRank }
  champion?: LeagueChampion
  live?: { activePlayer: string; order: LeagueLivePlayer[]; chaos: LeagueLivePlayer[] }
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
  riotApiKey: string
  riotPlatform: string // euw1, na1, kr, ru, …
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
  watching: '#a888f0',
  completed: '#4ade80',
  planned: '#8b8b9e',
  on_hold: '#f59e0b',
  dropped: '#ef4444',
}

export const TITLE_TYPES: TitleType[] = ['anime', 'movie', 'series', 'cartoon', 'youtube', 'book']

export const MOMENT_TAGS: MomentTag[] = ['epic', 'funny', 'sad', 'important', 'beautiful']

export const MOMENT_TAG_COLORS: Record<MomentTag, string> = {
  epic: '#a888f0',
  funny: '#facc15',
  sad: '#60a5fa',
  important: '#ef4444',
  beautiful: '#4ade80',
}

export const PROJECT_KINDS: ProjectKind[] = ['video', 'motion', 'edit', '3d', 'design', 'other']

export const PROJECT_STATUSES: ProjectStatus[] = ['idea', 'active', 'review', 'done', 'archived']

export const PROJECT_STATUS_COLORS: Record<ProjectStatus, string> = {
  idea: '#8b8b9e',
  active: '#a888f0',
  review: '#f59e0b',
  done: '#4ade80',
  archived: '#52525b',
}

// preset creative tools — labels live in i18n under project.tool.*
export const PROJECT_TOOLS = [
  'blender',
  'davinci',
  'aftereffects',
  'photoshop',
  'premiere',
  'cinema4d',
  'figma',
  'other',
] as const

export const PROJECT_COLORS = ['#a888f0', '#60a5fa', '#4ade80', '#facc15', '#f59e0b', '#ef4444', '#ec4899', '#14b8a6']
