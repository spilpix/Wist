import { contextBridge, ipcRenderer, webUtils } from 'electron'

const invoke = (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args)

const api = {
  events: {
    onDataChanged: (cb: (kind: string) => void) => {
      const listener = (_e: unknown, kind: string) => cb(kind)
      ipcRenderer.on('wist:data-changed', listener)
      return () => ipcRenderer.removeListener('wist:data-changed', listener)
    },
  },
  journal: {
    list: () => invoke('journal:list'),
    get: (day: string) => invoke('journal:get', day),
    upsert: (day: string, patch: unknown) => invoke('journal:upsert', day, patch),
    remove: (day: string) => invoke('journal:remove', day),
    streak: () => invoke('journal:streak'),
  },
  tasks: {
    list: (filters?: unknown) => invoke('tasks:list', filters),
    create: (data: unknown) => invoke('tasks:create', data),
    update: (id: number, patch: unknown) => invoke('tasks:update', id, patch),
    remove: (id: number) => invoke('tasks:remove', id),
    clearCompleted: () => invoke('tasks:clearCompleted'),
  },
  projects: {
    list: () => invoke('projects:list'),
    get: (id: number) => invoke('projects:get', id),
    create: (data: unknown) => invoke('projects:create', data),
    update: (id: number, patch: unknown) => invoke('projects:update', id, patch),
    remove: (id: number) => invoke('projects:remove', id),
    reorder: (ids: number[]) => invoke('projects:reorder', ids),
    assets: (projectId: number) => invoke('projects:assets', projectId),
    addFiles: (projectId: number) => invoke('projects:addFiles', projectId),
    addFolder: (projectId: number) => invoke('projects:addFolder', projectId),
    addImages: (projectId: number) => invoke('projects:addImages', projectId),
    addUrl: (projectId: number, url: string, label: string | null) => invoke('projects:addUrl', projectId, url, label),
    addPaths: (projectId: number, paths: string[]) => invoke('projects:addPaths', projectId, paths),
    removeAsset: (id: number) => invoke('projects:removeAsset', id),
    reorderAssets: (ids: number[]) => invoke('projects:reorderAssets', ids),
  },
  games: {
    list: () => invoke('games:list'),
    get: (id: number) => invoke('games:get', id),
    create: (data: unknown) => invoke('games:create', data),
    update: (id: number, patch: unknown) => invoke('games:update', id, patch),
    remove: (id: number) => invoke('games:remove', id),
    running: () => invoke('games:running'),
    pickExe: () => invoke('games:pickExe'),
  },
  canvas: {
    list: () => invoke('canvas:list'),
    get: (id: number) => invoke('canvas:get', id),
    create: (name: string) => invoke('canvas:create', name),
    update: (id: number, patch: unknown) => invoke('canvas:update', id, patch),
    remove: (id: number) => invoke('canvas:remove', id),
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
    worldAssets: () => invoke('files:worldAssets'),
  },
  media: {
    fileUrl: (p: string) => `media://local/?p=${encodeURIComponent(p)}`,
    subtitles: (filePath: string) => invoke('media:subtitles', filePath),
  },
  screenshots: {
    saveDataUrl: (dataUrl: string, baseName: string) => invoke('screenshots:saveDataUrl', dataUrl, baseName),
  },
  data: {
    exportAll: () => invoke('data:exportAll'),
    importAll: () => invoke('data:importAll'),
    clearHistory: () => invoke('data:clearHistory'),
  },
  settings: {
    get: () => invoke('settings:get'),
    set: (patch: unknown) => invoke('settings:set', patch),
    pickDirectory: () => invoke('settings:pickDirectory'),
    regenerateApiToken: () => invoke('settings:regenerateApiToken'),
  },
  window: {
    setTheme: (theme: string) => invoke('window:setTheme', theme),
  },
  shell: {
    openExternal: (url: string) => invoke('shell:openExternal', url),
    showItemInFolder: (p: string) => invoke('shell:showItemInFolder', p),
    openInMpv: (filePath: string) => invoke('shell:openInMpv', filePath),
  },
}

contextBridge.exposeInMainWorld('wist', api)
