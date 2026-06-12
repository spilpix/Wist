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
  pinned: 0 | 1
  created_at: string
  updated_at: string
  // derived
  linked_title_name?: string | null
}

export type MemoryKind = 'moment' | 'title' | 'book' | 'note'

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
