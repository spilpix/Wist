import { contextBridge, ipcRenderer } from 'electron'

const invoke = (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args)

const api = {
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
  },
  shell: {
    openExternal: (url: string) => invoke('shell:openExternal', url),
    showItemInFolder: (p: string) => invoke('shell:showItemInFolder', p),
    openInMpv: (filePath: string) => invoke('shell:openInMpv', filePath),
  },
}

contextBridge.exposeInMainWorld('wist', api)
