import type {
  AppSettings,
  Canvas,
  CanvasData,
  Favorite,
  FavoriteKind,
  FavoriteInput,
  NodeType,
  NodeRef,
  EdgeKind,
  RawEdge,
  RelatedEdge,
  ResolvedNode,
  Note,
  NoteFolder,
  NoteSearchHit,
  ObjectType,
  JournalEntry,
  Project,
  ProjectAsset,
  ProjectPatch,
  ProjectSection,
  ProjectSession,
  SessionChanges,
  Task,
  TaskComment,
  TaskAttachment,
  UpdateStatus,
  VaultDiskEntry,
  VaultFile,
} from './models'

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
  edges: {
    related(type: NodeType, id: string | number, kinds?: EdgeKind[]): Promise<RelatedEdge[]>
    search(query: string, exclude?: NodeRef): Promise<ResolvedNode[]>
    link(src: NodeRef, kind: EdgeKind, dst: NodeRef): Promise<void>
    unlink(edgeId: number): Promise<void>
    listAll(): Promise<RawEdge[]>
  }
  vault: {
    list(parentId?: number | null): Promise<VaultFile[]>
    browse(dir: string): Promise<VaultDiskEntry[]>
    addPaths(paths: string[], parentId?: number | null): Promise<number>
    pickAndAdd(parentId?: number | null): Promise<number>
    addFolder(parentId?: number | null): Promise<{ folders: number }>
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
  objectTypes: {
    list(): Promise<ObjectType[]>
    create(data: Partial<ObjectType>): Promise<ObjectType>
    update(id: number, patch: Partial<ObjectType>): Promise<ObjectType>
    remove(id: number): Promise<void>
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
  notes: {
    list(filters?: { search?: string; tag?: string; projectId?: number }): Promise<Note[]>
    get(id: number): Promise<Note | null>
    create(data: Partial<Note>): Promise<Note>
    update(id: number, patch: Partial<Note>): Promise<Note>
    remove(id: number): Promise<void>
    tags(): Promise<string[]>
    searchFts(query: string): Promise<NoteSearchHit[]>
  }
  journal: {
    get(day: string): Promise<JournalEntry | null>
    range(from: string, to: string): Promise<JournalEntry[]>
    save(day: string, patch: { content?: string; mood?: number | null }): Promise<JournalEntry>
  }
  noteFolders: {
    list(): Promise<NoteFolder[]>
    create(name: string, parentId?: number | null): Promise<NoteFolder>
    rename(id: number, name: string): Promise<NoteFolder | null>
    move(id: number, parentId: number | null): Promise<void>
    remove(id: number): Promise<void>
    reorder(ids: number[]): Promise<void>
  }
  files: {
    pickFolder(): Promise<string | null>
    pickImage(): Promise<string | null>
    saveCoverFromPath(srcPath: string): Promise<string>
    saveCoverFromBytes(name: string, bytes: ArrayBuffer): Promise<string>
  }
  media: {
    fileUrl(path: string): string
  }
  p2p: {
    fileMeta(filePath: string): Promise<{ name: string; size: number; sha256: string; path: string } | null>
    readFile(filePath: string): Promise<ArrayBuffer>
    saveIncoming(name: string, bytes: ArrayBuffer): Promise<string | null>
  }
  data: {
    exportAll(): Promise<string | null>
    importAll(): Promise<boolean>
    clearDatabase(): Promise<void>
  }
  brain: {
    folder(): Promise<string>
    stats(): Promise<{
      notes: number
      tasks: number
      tasksDone: number
      journal: number
      projects: number
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
  }
  util: {
    pathForFile(file: File): string
  }
}

declare global {
  interface Window {
    wist: WistApi
  }
}
