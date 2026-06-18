import { contextBridge, ipcRenderer, webUtils } from 'electron'

const invoke = (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args)

const api = {
  events: {
    onDataChanged: (cb: (kind: string) => void) => {
      const listener = (_e: unknown, kind: string) => cb(kind)
      ipcRenderer.on('wist:data-changed', listener)
      return () => ipcRenderer.removeListener('wist:data-changed', listener)
    },
    // main asks the renderer to navigate (e.g. clicking a reminder notification)
    onNavigate: (cb: (path: string) => void) => {
      const listener = (_e: unknown, path: string) => cb(path)
      ipcRenderer.on('wist:navigate', listener)
      return () => ipcRenderer.removeListener('wist:navigate', listener)
    },
  },
  updates: {
    check: () => invoke('updater:check'),
    status: () => invoke('updater:status'),
    install: () => invoke('updater:install'),
    onStatus: (cb: (status: unknown) => void) => {
      const listener = (_e: unknown, status: unknown) => cb(status)
      ipcRenderer.on('wist:update-status', listener)
      return () => ipcRenderer.removeListener('wist:update-status', listener)
    },
  },
  tasks: {
    list: (filters?: unknown) => invoke('tasks:list', filters),
    create: (data: unknown) => invoke('tasks:create', data),
    update: (id: number, patch: unknown) => invoke('tasks:update', id, patch),
    remove: (id: number) => invoke('tasks:remove', id),
    clearCompleted: () => invoke('tasks:clearCompleted'),
    reorder: (ids: number[]) => invoke('tasks:reorder', ids),
    comments: (taskId: number) => invoke('tasks:comments', taskId),
    addComment: (taskId: number, body: string) => invoke('tasks:addComment', taskId, body),
    removeComment: (id: number) => invoke('tasks:removeComment', id),
    attachments: (taskId: number) => invoke('tasks:attachments', taskId),
    addAttachment: (taskId: number, filePath: string, name: string) => invoke('tasks:addAttachment', taskId, filePath, name),
    removeAttachment: (id: number) => invoke('tasks:removeAttachment', id),
  },
  projects: {
    list: () => invoke('projects:list'),
    get: (id: number) => invoke('projects:get', id),
    create: (data: unknown) => invoke('projects:create', data),
    update: (id: number, patch: unknown) => invoke('projects:update', id, patch),
    remove: (id: number) => invoke('projects:remove', id),
    reorder: (ids: number[]) => invoke('projects:reorder', ids),
    assets: (projectId: number) => invoke('projects:assets', projectId),
    addFiles: (projectId: number, sectionId?: number | null) => invoke('projects:addFiles', projectId, sectionId ?? null),
    addFolder: (projectId: number, sectionId?: number | null) => invoke('projects:addFolder', projectId, sectionId ?? null),
    addImages: (projectId: number, sectionId?: number | null) => invoke('projects:addImages', projectId, sectionId ?? null),
    addUrl: (projectId: number, url: string, label: string | null, sectionId?: number | null) =>
      invoke('projects:addUrl', projectId, url, label, sectionId ?? null),
    addPaths: (projectId: number, paths: string[], sectionId?: number | null) => invoke('projects:addPaths', projectId, paths, sectionId ?? null),
    removeAsset: (id: number) => invoke('projects:removeAsset', id),
    reorderAssets: (ids: number[]) => invoke('projects:reorderAssets', ids),
    moveAsset: (id: number, sectionId: number | null) => invoke('projects:moveAsset', id, sectionId),
    // sections ("folders" inside a hub)
    sections: (projectId: number) => invoke('projects:sections', projectId),
    createSection: (projectId: number, name: string) => invoke('projects:createSection', projectId, name),
    renameSection: (id: number, name: string) => invoke('projects:renameSection', id, name),
    removeSection: (id: number) => invoke('projects:removeSection', id),
    reorderSections: (ids: number[]) => invoke('projects:reorderSections', ids),
    // drag a hub file out to the OS / another app (native drag)
    dragOut: (paths: string[]) => ipcRenderer.send('projects:dragOut', paths),
    // work sessions (work log + file-change diff)
    sessions: (projectId: number) => invoke('projectSessions:list', projectId),
    createSession: (projectId: number, data: unknown) => invoke('projectSessions:create', projectId, data),
    updateSession: (id: number, patch: unknown) => invoke('projectSessions:update', id, patch),
    removeSession: (id: number) => invoke('projectSessions:remove', id),
    previewChanges: (projectId: number) => invoke('projects:previewChanges', projectId),
    snapshot: (projectId: number) => invoke('projects:snapshot', projectId),
    endSession: (projectId: number, data: unknown) => invoke('projects:endSession', projectId, data),
    // patches (per-hub changelog / version log)
    patches: (projectId: number) => invoke('projectPatches:list', projectId),
    createPatch: (projectId: number, data: unknown) => invoke('projectPatches:create', projectId, data),
    updatePatch: (id: number, patch: unknown) => invoke('projectPatches:update', id, patch),
    removePatch: (id: number) => invoke('projectPatches:remove', id),
  },
  trash: {
    list: () => invoke('trash:list'),
    restore: (kind: string, id: number) => invoke('trash:restore', kind, id),
    purge: (kind: string, id: number) => invoke('trash:purge', kind, id),
    empty: () => invoke('trash:empty'),
  },
  favorites: {
    list: () => invoke('favorites:list'),
    isFavorite: (kind: string, ref: string | number) => invoke('favorites:isFavorite', kind, ref),
    toggle: (input: unknown) => invoke('favorites:toggle', input),
    remove: (kind: string, ref: string | number) => invoke('favorites:remove', kind, ref),
    reorder: (ids: number[]) => invoke('favorites:reorder', ids),
  },
  // Library "folders": user-created groups of any library entity
  collections: {
    list: () => invoke('collections:list'),
    get: (id: number) => invoke('collections:get', id),
    items: (id: number) => invoke('collections:items', id),
    create: (data: unknown) => invoke('collections:create', data),
    update: (id: number, patch: unknown) => invoke('collections:update', id, patch),
    remove: (id: number) => invoke('collections:remove', id),
    reorder: (ids: number[]) => invoke('collections:reorder', ids),
    addItem: (id: number, kind: string, ref: string | number) => invoke('collections:addItem', id, kind, ref),
    removeItem: (id: number, kind: string, ref: string | number) => invoke('collections:removeItem', id, kind, ref),
    forItem: (kind: string, ref: string | number) => invoke('collections:forItem', kind, ref),
  },
  // unified Library hub roll-up (counts + cover previews per category)
  library: {
    summary: () => invoke('library:summary'),
  },
  canvas: {
    list: () => invoke('canvas:list'),
    get: (id: number) => invoke('canvas:get', id),
    create: (name: string) => invoke('canvas:create', name),
    update: (id: number, patch: unknown) => invoke('canvas:update', id, patch),
    remove: (id: number) => invoke('canvas:remove', id),
    capture: (rect: { x: number; y: number; width: number; height: number }, format: 'png' | 'jpeg') =>
      invoke('canvas:capture', rect, format),
    saveExport: (name: string, bytes: ArrayBuffer) => invoke('canvas:saveExport', name, bytes),
  },
  util: {
    // resolves a dropped File to its absolute path (File.path was removed in Electron 32+)
    pathForFile: (file: File) => webUtils.getPathForFile(file),
  },
  playlists: {
    list: () => invoke('playlists:list'),
    create: (data: unknown) => invoke('playlists:create', data),
    update: (id: number, patch: unknown) => invoke('playlists:update', id, patch),
    remove: (id: number) => invoke('playlists:remove', id),
  },
  // local music library (a "local Spotify")
  music: {
    list: () => invoke('music:list'),
    albums: () => invoke('music:albums'),
    artists: () => invoke('music:artists'),
    folders: () => invoke('music:folders'),
    scan: () => invoke('music:scan'),
    addFolder: () => invoke('music:addFolder'),
    removeFolder: (folder: string) => invoke('music:removeFolder', folder),
    setDuration: (id: number, seconds: number) => invoke('music:setDuration', id, seconds),
    setLiked: (id: number, liked: boolean) => invoke('music:setLiked', id, liked),
    recordPlay: (id: number) => invoke('music:recordPlay', id),
    remove: (id: number) => invoke('music:remove', id),
    playlists: () => invoke('music:playlists'),
    playlistTracks: (id: number) => invoke('music:playlistTracks', id),
    createPlaylist: (name: string) => invoke('music:createPlaylist', name),
    renamePlaylist: (id: number, name: string) => invoke('music:renamePlaylist', id, name),
    deletePlaylist: (id: number) => invoke('music:deletePlaylist', id),
    addToPlaylist: (playlistId: number, trackId: number) => invoke('music:addToPlaylist', playlistId, trackId),
    removeFromPlaylist: (playlistId: number, trackId: number) => invoke('music:removeFromPlaylist', playlistId, trackId),
    reorderPlaylist: (playlistId: number, trackIds: number[]) => invoke('music:reorderPlaylist', playlistId, trackIds),
  },
  vault: {
    list: (parentId?: number | null) => invoke('vault:list', parentId ?? null),
    browse: (dir: string) => invoke('vault:browse', dir),
    addPaths: (paths: string[], parentId?: number | null) => invoke('vault:addPaths', paths, parentId ?? null),
    pickAndAdd: (parentId?: number | null) => invoke('vault:pickAndAdd', parentId ?? null),
    addFolder: (parentId?: number | null) => invoke('vault:addFolder', parentId ?? null),
    createFolder: (name: string, parentId?: number | null) => invoke('vault:createFolder', name, parentId ?? null),
    rename: (id: number, name: string) => invoke('vault:rename', id, name),
    move: (id: number, parentId: number | null) => invoke('vault:move', id, parentId),
    remove: (id: number) => invoke('vault:remove', id),
    open: (p: string) => invoke('vault:open', p),
    startDrag: (p: string) => ipcRenderer.send('vault:startDrag', p),
    // re-scan every known source (music + media + Files folders) into the sections
    syncAll: () => invoke('media:syncAll'),
  },
  fs: {
    listDir: (dir: string) => invoke('fs:listDir', dir),
  },
  meta: {
    searchTitles: (type: string, query: string) => invoke('meta:searchTitles', type, query),
    coverFromUrl: (url: string) => invoke('meta:coverFromUrl', url),
    oembed: (url: string) => invoke('meta:oembed', url),
  },
  titles: {
    list: (filters?: unknown) => invoke('titles:list', filters),
    get: (id: number) => invoke('titles:get', id),
    create: (data: unknown) => invoke('titles:create', data),
    update: (id: number, patch: unknown) => invoke('titles:update', id, patch),
    remove: (id: number) => invoke('titles:remove', id),
    setIntroEnd: (id: number, seconds: number | null) => invoke('titles:setIntroEnd', id, seconds),
    genres: () => invoke('titles:genres'),
    years: () => invoke('titles:years'),
  },
  episodes: {
    listByTitle: (titleId: number) => invoke('episodes:listByTitle', titleId),
    get: (id: number) => invoke('episodes:get', id),
    bulkCreate: (items: unknown) => invoke('episodes:bulkCreate', items),
    update: (id: number, patch: unknown) => invoke('episodes:update', id, patch),
    setProgress: (id: number, position: number, duration?: number | null) =>
      invoke('episodes:setProgress', id, position, duration),
    markWatched: (id: number, watched: boolean) => invoke('episodes:markWatched', id, watched),
    remove: (id: number) => invoke('episodes:remove', id),
    continueWatching: () => invoke('episodes:continueWatching'),
  },
  moments: {
    list: (filters?: unknown) => invoke('moments:list', filters),
    create: (data: unknown) => invoke('moments:create', data),
    update: (id: number, patch: unknown) => invoke('moments:update', id, patch),
    remove: (id: number) => invoke('moments:remove', id),
    exportAll: () => invoke('moments:exportAll'),
  },
  notes: {
    list: (filters?: unknown) => invoke('notes:list', filters),
    get: (id: number) => invoke('notes:get', id),
    create: (data: unknown) => invoke('notes:create', data),
    update: (id: number, patch: unknown) => invoke('notes:update', id, patch),
    remove: (id: number) => invoke('notes:remove', id),
    tags: () => invoke('notes:tags'),
  },
  noteFolders: {
    list: () => invoke('noteFolders:list'),
    create: (name: string, parentId?: number | null) => invoke('noteFolders:create', name, parentId ?? null),
    rename: (id: number, name: string) => invoke('noteFolders:rename', id, name),
    move: (id: number, parentId: number | null) => invoke('noteFolders:move', id, parentId ?? null),
    remove: (id: number) => invoke('noteFolders:remove', id),
    reorder: (ids: number[]) => invoke('noteFolders:reorder', ids),
  },
  youtube: {
    sources: (titleId?: number) => invoke('youtube:sources', titleId),
    addSource: (titleId: number, url: string) => invoke('youtube:addSource', titleId, url),
    removeSource: (id: number) => invoke('youtube:removeSource', id),
    fetchVideos: (url: string) => invoke('youtube:fetchVideos', url),
    syncSource: (sourceId: number) => invoke('youtube:syncSource', sourceId),
  },
  sessions: {
    start: (titleId: number | null, episodeId: number | null) => invoke('sessions:start', titleId, episodeId),
    end: (id: number, durationSeconds: number) => invoke('sessions:end', id, durationSeconds),
  },
  stats: {
    summary: () => invoke('stats:summary'),
    heatmap: () => invoke('stats:heatmap'),
    byType: () => invoke('stats:byType'),
    monthly: () => invoke('stats:monthly'),
    topRated: () => invoke('stats:topRated'),
    recentlyAdded: () => invoke('stats:recentlyAdded'),
    memories: () => invoke('stats:memories'),
  },
  files: {
    pickVideos: () => invoke('files:pickVideos'),
    pickFolder: () => invoke('files:pickFolder'),
    listVideosInFolder: (folder: string) => invoke('files:listVideosInFolder', folder),
    scanMediaFolders: () => invoke('files:scanMediaFolders'),
    existingPaths: () => invoke('files:existingPaths'),
    importEpisodes: (groups: unknown) => invoke('files:importEpisodes', groups),
    pickImage: () => invoke('files:pickImage'),
    saveCoverFromPath: (src: string) => invoke('files:saveCoverFromPath', src),
    saveCoverFromBytes: (name: string, bytes: ArrayBuffer) => invoke('files:saveCoverFromBytes', name, bytes),
  },
  media: {
    fileUrl: (p: string) => `media://local/?p=${encodeURIComponent(p)}`,
    subtitles: (filePath: string) => invoke('media:subtitles', filePath),
  },
  clipboard: {
    copy: (payload: { text?: string; imagePaths?: string[] }) => invoke('clipboard:copy', payload),
  },
  screenshots: {
    saveDataUrl: (dataUrl: string, baseName: string) => invoke('screenshots:saveDataUrl', dataUrl, baseName),
  },
  // P2P hub sharing — main does the filesystem work; the renderer runs the WebRTC mesh
  p2p: {
    fileMeta: (filePath: string) =>
      invoke('p2p:fileMeta', filePath) as Promise<{ name: string; size: number; sha256: string; path: string } | null>,
    readFile: (filePath: string) => invoke('p2p:readFile', filePath) as Promise<ArrayBuffer>,
    saveIncoming: (name: string, bytes: ArrayBuffer) => invoke('p2p:saveIncoming', name, bytes) as Promise<string | null>,
  },
  data: {
    exportAll: () => invoke('data:exportAll'),
    importAll: () => invoke('data:importAll'),
    clearHistory: () => invoke('data:clearHistory'),
    clearDatabase: () => invoke('data:clearDatabase'),
  },
  brain: {
    folder: () => invoke('brain:folder'),
    stats: () => invoke('brain:stats'),
    sync: () => invoke('brain:sync'),
    restore: () => invoke('brain:restore'),
    open: () => invoke('brain:open'),
  },
  settings: {
    get: () => invoke('settings:get'),
    set: (patch: unknown) => invoke('settings:set', patch),
    pickDirectory: () => invoke('settings:pickDirectory'),
    regenerateApiToken: () => invoke('settings:regenerateApiToken'),
  },
  window: {
    setTheme: (theme: string) => invoke('window:setTheme', theme),
    capturePreview: (rect: { x: number; y: number; width: number; height: number }) => invoke('window:capturePreview', rect),
  },
  shell: {
    openExternal: (url: string) => invoke('shell:openExternal', url),
    showItemInFolder: (p: string) => invoke('shell:showItemInFolder', p),
    openInMpv: (filePath: string) => invoke('shell:openInMpv', filePath),
  },
}

contextBridge.exposeInMainWorld('wist', api)
