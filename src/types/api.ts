import type {
  AppSettings,
  ContinueItem,
  Episode,
  HeatmapDay,
  ImportGroup,
  JournalEntry,
  LeaguePoll,
  MemoryEvent,
  MetaCandidate,
  Moment,
  MomentTag,
  MonthBar,
  Note,
  Playlist,
  Project,
  ProjectAsset,
  StatsSummary,
  SubtitleTrack,
  Task,
  Title,
  TitleFilters,
  TitleType,
  TypeSlice,
  VaultFile,
  YoutubeSource,
  YoutubeVideo,
} from './models'

export interface EpisodeBundle {
  episode: Episode
  title: Title
  episodes: Episode[]
}

export interface WistApi {
  events: {
    onDataChanged(cb: (kind: string) => void): () => void
  }
  journal: {
    list(): Promise<JournalEntry[]>
    get(day: string): Promise<JournalEntry | null>
    upsert(day: string, patch: { mood?: number | null; content?: string }): Promise<JournalEntry>
    remove(day: string): Promise<void>
    streak(): Promise<number>
  }
  tasks: {
    list(filters?: { done?: boolean; projectId?: number }): Promise<Task[]>
    create(data: Partial<Task>): Promise<Task>
    update(id: number, patch: Partial<Task>): Promise<Task>
    remove(id: number): Promise<void>
    clearCompleted(): Promise<number>
  }
  projects: {
    list(): Promise<Project[]>
    get(id: number): Promise<Project | null>
    create(data: Partial<Project>): Promise<Project>
    update(id: number, patch: Partial<Project>): Promise<Project>
    remove(id: number): Promise<void>
    reorder(ids: number[]): Promise<void>
    assets(projectId: number): Promise<ProjectAsset[]>
    addFiles(projectId: number): Promise<number>
    addFolder(projectId: number): Promise<number>
    addImages(projectId: number): Promise<number>
    addUrl(projectId: number, url: string, label: string | null): Promise<number>
    addPaths(projectId: number, paths: string[]): Promise<number>
    removeAsset(id: number): Promise<void>
    reorderAssets(ids: number[]): Promise<void>
  }
  util: {
    pathForFile(file: File): string
  }
  playlists: {
    list(): Promise<Playlist[]>
    create(data: Partial<Playlist>): Promise<Playlist>
    update(id: number, patch: Partial<Playlist>): Promise<void>
    remove(id: number): Promise<void>
  }
  vault: {
    list(): Promise<VaultFile[]>
    addPaths(paths: string[]): Promise<number>
    pickAndAdd(): Promise<number>
    addFolder(): Promise<number>
    remove(id: number): Promise<void>
    open(path: string): Promise<string>
    startDrag(path: string): void
  }
  league: {
    poll(): Promise<LeaguePoll>
  }
  meta: {
    searchTitles(type: TitleType, query: string): Promise<MetaCandidate[]>
    coverFromUrl(url: string): Promise<string>
    oembed(url: string): Promise<{ title: string | null; thumbnail: string | null }>
  }
  titles: {
    list(filters?: TitleFilters): Promise<Title[]>
    get(id: number): Promise<Title | null>
    create(data: Partial<Title>): Promise<Title>
    update(id: number, patch: Partial<Title>): Promise<Title>
    remove(id: number): Promise<void>
    setIntroEnd(id: number, seconds: number | null): Promise<void>
    genres(): Promise<string[]>
    years(): Promise<number[]>
  }
  episodes: {
    listByTitle(titleId: number): Promise<Episode[]>
    get(id: number): Promise<EpisodeBundle | null>
    bulkCreate(
      items: Array<{
        title_id: number
        episode_number: number
        season?: number
        name?: string | null
        file_path?: string | null
      }>
    ): Promise<number>
    update(id: number, patch: Partial<Episode>): Promise<void>
    setProgress(id: number, position: number, duration?: number | null): Promise<void>
    markWatched(id: number, watched: boolean): Promise<void>
    remove(id: number): Promise<void>
    continueWatching(): Promise<ContinueItem[]>
  }
  moments: {
    list(filters?: { tag?: MomentTag; titleId?: number }): Promise<Moment[]>
    create(data: {
      title_id: number
      episode_id: number | null
      timestamp_seconds: number
      note: string | null
      tag: MomentTag | null
      screenshotDataUrl: string | null
      baseName: string
    }): Promise<Moment>
    update(id: number, patch: { note?: string | null; tag?: MomentTag | null }): Promise<void>
    remove(id: number): Promise<void>
    exportAll(): Promise<{ exported: number; dir: string } | null>
  }
  notes: {
    list(filters?: { search?: string; tag?: string; projectId?: number }): Promise<Note[]>
    get(id: number): Promise<Note | null>
    create(data: Partial<Note>): Promise<Note>
    update(id: number, patch: Partial<Note>): Promise<Note>
    remove(id: number): Promise<void>
    tags(): Promise<string[]>
  }
  youtube: {
    sources(titleId?: number): Promise<YoutubeSource[]>
    addSource(titleId: number, url: string): Promise<YoutubeSource>
    removeSource(id: number): Promise<void>
    fetchVideos(url: string): Promise<YoutubeVideo[]>
    syncSource(sourceId: number): Promise<{ added: number; total: number }>
  }
  sessions: {
    start(titleId: number | null, episodeId: number | null): Promise<number>
    end(id: number, durationSeconds: number): Promise<void>
  }
  stats: {
    summary(): Promise<StatsSummary>
    heatmap(): Promise<HeatmapDay[]>
    byType(): Promise<TypeSlice[]>
    monthly(): Promise<MonthBar[]>
    topRated(): Promise<Title[]>
    recentlyAdded(): Promise<Title[]>
    memories(): Promise<MemoryEvent[]>
  }
  files: {
    pickVideos(): Promise<string[]>
    pickFolder(): Promise<string | null>
    listVideosInFolder(folder: string): Promise<string[]>
    scanMediaFolders(): Promise<string[]>
    existingPaths(): Promise<string[]>
    importEpisodes(groups: ImportGroup[]): Promise<{ createdTitles: number; createdEpisodes: number }>
    pickImage(): Promise<string | null>
    saveCoverFromPath(srcPath: string): Promise<string>
    saveCoverFromBytes(name: string, bytes: ArrayBuffer): Promise<string>
    worldAssets(): Promise<Record<string, string>>
  }
  media: {
    fileUrl(path: string): string
    subtitles(filePath: string): Promise<SubtitleTrack[]>
  }
  screenshots: {
    saveDataUrl(dataUrl: string, baseName: string): Promise<string>
  }
  data: {
    exportAll(): Promise<string | null>
    importAll(): Promise<boolean>
    clearHistory(): Promise<void>
  }
  settings: {
    get(): Promise<AppSettings>
    set(patch: Partial<AppSettings>): Promise<AppSettings>
    pickDirectory(): Promise<string | null>
    regenerateApiToken(): Promise<string>
  }
  window: {
    setTheme(theme: 'dark' | 'light'): Promise<void>
  }
  shell: {
    openExternal(url: string): Promise<void>
    showItemInFolder(path: string): Promise<void>
    openInMpv(filePath: string): Promise<{ ok: boolean; error?: string }>
  }
}

declare global {
  interface Window {
    wist: WistApi
  }
}
