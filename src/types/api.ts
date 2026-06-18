import type {
  AppSettings,
  Canvas,
  CanvasData,
  Collection,
  CollectionItem,
  ContinueItem,
  LibrarySummary,
  Episode,
  Favorite,
  FavoriteKind,
  FavoriteInput,
  HeatmapDay,
  ImportGroup,
  MemoryEvent,
  MetaCandidate,
  Moment,
  MomentTag,
  MonthBar,
  MusicAlbum,
  MusicArtist,
  MusicPlaylist,
  Note,
  NoteFolder,
  Playlist,
  Track,
  Project,
  ProjectAsset,
  ProjectPatch,
  ProjectSection,
  ProjectSession,
  SessionChanges,
  StatsSummary,
  SubtitleTrack,
  UpdateStatus,
  Task,
  TaskComment,
  TaskAttachment,
  Title,
  TitleFilters,
  TitleType,
  TypeSlice,
  VaultDiskEntry,
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
    onNavigate(cb: (path: string) => void): () => void
  }
  updates: {
    check(): Promise<UpdateStatus>
    status(): Promise<UpdateStatus>
    install(): Promise<void>
    onStatus(cb: (status: UpdateStatus) => void): () => void
  }
  tasks: {
    list(filters?: { done?: boolean; projectId?: number }): Promise<Task[]>
    create(data: Partial<Task>): Promise<Task>
    update(id: number, patch: Partial<Task>): Promise<Task>
    remove(id: number): Promise<void>
    clearCompleted(): Promise<number>
    reorder(ids: number[]): Promise<void>
    comments(taskId: number): Promise<TaskComment[]>
    addComment(taskId: number, body: string): Promise<TaskComment>
    removeComment(id: number): Promise<void>
    attachments(taskId: number): Promise<TaskAttachment[]>
    addAttachment(taskId: number, filePath: string, name: string): Promise<TaskAttachment>
    removeAttachment(id: number): Promise<void>
  }
  clipboard: {
    copy(payload: { text?: string; imagePaths?: string[] }): Promise<boolean>
  }
  projects: {
    list(): Promise<Project[]>
    get(id: number): Promise<Project | null>
    create(data: Partial<Project>): Promise<Project>
    update(id: number, patch: Partial<Project>): Promise<Project>
    remove(id: number): Promise<void>
    reorder(ids: number[]): Promise<void>
    assets(projectId: number): Promise<ProjectAsset[]>
    addFiles(projectId: number, sectionId?: number | null): Promise<number>
    addFolder(projectId: number, sectionId?: number | null): Promise<number>
    addImages(projectId: number, sectionId?: number | null): Promise<number>
    addUrl(projectId: number, url: string, label: string | null, sectionId?: number | null): Promise<number>
    addPaths(projectId: number, paths: string[], sectionId?: number | null): Promise<number>
    removeAsset(id: number): Promise<void>
    reorderAssets(ids: number[]): Promise<void>
    moveAsset(id: number, sectionId: number | null): Promise<void>
    sections(projectId: number): Promise<ProjectSection[]>
    createSection(projectId: number, name: string): Promise<ProjectSection>
    renameSection(id: number, name: string): Promise<void>
    removeSection(id: number): Promise<void>
    reorderSections(ids: number[]): Promise<void>
    dragOut(paths: string[]): void
    sessions(projectId: number): Promise<ProjectSession[]>
    createSession(projectId: number, data: Partial<ProjectSession>): Promise<ProjectSession>
    updateSession(id: number, patch: Partial<ProjectSession>): Promise<ProjectSession>
    removeSession(id: number): Promise<void>
    previewChanges(projectId: number): Promise<SessionChanges>
    snapshot(projectId: number): Promise<void>
    endSession(projectId: number, data: Partial<ProjectSession>): Promise<ProjectSession>
    patches(projectId: number): Promise<ProjectPatch[]>
    createPatch(projectId: number, data: Partial<ProjectPatch>): Promise<ProjectPatch>
    updatePatch(id: number, patch: Partial<ProjectPatch>): Promise<ProjectPatch>
    removePatch(id: number): Promise<void>
  }
  trash: {
    list(): Promise<{ projects: Project[]; notes: Note[]; tasks: Task[] }>
    restore(kind: 'project' | 'note' | 'task', id: number): Promise<void>
    purge(kind: 'project' | 'note' | 'task', id: number): Promise<void>
    empty(): Promise<number>
  }
  favorites: {
    list(): Promise<Favorite[]>
    isFavorite(kind: FavoriteKind, ref: string | number): Promise<boolean>
    toggle(input: FavoriteInput): Promise<boolean>
    remove(kind: FavoriteKind, ref: string | number): Promise<void>
    reorder(ids: number[]): Promise<void>
  }
  collections: {
    list(): Promise<Collection[]>
    get(id: number): Promise<Collection | null>
    items(id: number): Promise<CollectionItem[]>
    create(data: { name?: string; color?: string | null; icon?: string | null }): Promise<Collection>
    update(id: number, patch: { name?: string; color?: string | null; icon?: string | null }): Promise<Collection | null>
    remove(id: number): Promise<void>
    reorder(ids: number[]): Promise<void>
    addItem(id: number, kind: string, ref: string | number): Promise<void>
    removeItem(id: number, kind: string, ref: string | number): Promise<void>
    forItem(kind: string, ref: string | number): Promise<number[]>
  }
  library: {
    summary(): Promise<LibrarySummary>
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
  music: {
    list(): Promise<Track[]>
    albums(): Promise<MusicAlbum[]>
    artists(): Promise<MusicArtist[]>
    folders(): Promise<string[]>
    scan(): Promise<{ added: number; scanned: number }>
    addFolder(): Promise<{ folder: string; added: number; scanned: number } | null>
    removeFolder(folder: string): Promise<number>
    setDuration(id: number, seconds: number): Promise<void>
    setLiked(id: number, liked: boolean): Promise<void>
    recordPlay(id: number): Promise<void>
    remove(id: number): Promise<void>
    playlists(): Promise<MusicPlaylist[]>
    playlistTracks(id: number): Promise<Track[]>
    createPlaylist(name: string): Promise<MusicPlaylist>
    renamePlaylist(id: number, name: string): Promise<void>
    deletePlaylist(id: number): Promise<void>
    addToPlaylist(playlistId: number, trackId: number): Promise<void>
    removeFromPlaylist(playlistId: number, trackId: number): Promise<void>
    reorderPlaylist(playlistId: number, trackIds: number[]): Promise<void>
  }
  vault: {
    list(parentId?: number | null): Promise<VaultFile[]>
    browse(dir: string): Promise<VaultDiskEntry[]>
    addPaths(paths: string[], parentId?: number | null): Promise<number>
    pickAndAdd(parentId?: number | null): Promise<number>
    addFolder(parentId?: number | null): Promise<{ folders: number; tracks: number; titles: number; episodes: number }>
    syncAll(): Promise<{ tracks: number; titles: number; episodes: number }>
    createFolder(name: string, parentId?: number | null): Promise<VaultFile>
    rename(id: number, name: string): Promise<void>
    move(id: number, parentId: number | null): Promise<void>
    remove(id: number): Promise<void>
    open(path: string): Promise<string>
    startDrag(path: string): void
  }
  fs: {
    listDir(dir: string): Promise<Array<{ name: string; path: string; isDir: boolean }>>
  }
  canvas: {
    list(): Promise<Canvas[]>
    get(id: number): Promise<Canvas | null>
    create(name: string): Promise<Canvas>
    update(id: number, patch: { name?: string; data?: CanvasData }): Promise<Canvas>
    remove(id: number): Promise<void>
    capture(
      rect: { x: number; y: number; width: number; height: number },
      format: 'png' | 'jpeg'
    ): Promise<{ bytes: Uint8Array; width: number; height: number } | null>
    saveExport(name: string, bytes: ArrayBuffer | Uint8Array): Promise<string | null>
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
  noteFolders: {
    list(): Promise<NoteFolder[]>
    create(name: string, parentId?: number | null): Promise<NoteFolder>
    rename(id: number, name: string): Promise<NoteFolder | null>
    move(id: number, parentId: number | null): Promise<void>
    remove(id: number): Promise<void>
    reorder(ids: number[]): Promise<void>
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
  p2p: {
    fileMeta(filePath: string): Promise<{ name: string; size: number; sha256: string; path: string } | null>
    readFile(filePath: string): Promise<ArrayBuffer>
    saveIncoming(name: string, bytes: ArrayBuffer): Promise<string | null>
  }
  data: {
    exportAll(): Promise<string | null>
    importAll(): Promise<boolean>
    clearHistory(): Promise<void>
    clearDatabase(): Promise<void>
  }
  brain: {
    folder(): Promise<string>
    stats(): Promise<{
      titles: number
      titlesDone: number
      episodes: number
      episodesWatched: number
      notes: number
      tasks: number
      tasksDone: number
      journal: number
      projects: number
      tracks: number
      moments: number
      canvases: number
    }>
    sync(): Promise<{ dir: string; records: number }>
    restore(): Promise<{ restored: number }>
    open(): Promise<string>
  }
  settings: {
    get(): Promise<AppSettings>
    set(patch: Partial<AppSettings>): Promise<AppSettings>
    pickDirectory(): Promise<string | null>
    regenerateApiToken(): Promise<string>
  }
  window: {
    setTheme(theme: 'dark' | 'light'): Promise<void>
    capturePreview(rect: { x: number; y: number; width: number; height: number }): Promise<string | null>
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
