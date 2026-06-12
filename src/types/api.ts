import type {
  AppSettings,
  ContinueItem,
  Episode,
  HeatmapDay,
  ImportGroup,
  MemoryEvent,
  Moment,
  MomentTag,
  MonthBar,
  Note,
  StatsSummary,
  SubtitleTrack,
  Title,
  TitleFilters,
  TypeSlice,
  YoutubeSource,
  YoutubeVideo,
} from './models'

export interface EpisodeBundle {
  episode: Episode
  title: Title
  episodes: Episode[]
}

export interface WistApi {
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
    list(filters?: { search?: string; tag?: string }): Promise<Note[]>
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
