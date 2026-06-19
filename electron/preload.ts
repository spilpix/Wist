import { contextBridge, ipcRenderer, webUtils } from 'electron'

const invoke = (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args)

const api = {
  events: {
    onDataChanged: (cb: (kind: string) => void) => {
      const listener = (_e: unknown, kind: string) => cb(kind)
      ipcRenderer.on('wist:data-changed', listener)
      return () => ipcRenderer.removeListener('wist:data-changed', listener)
    },
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
    sections: (projectId: number) => invoke('projects:sections', projectId),
    createSection: (projectId: number, name: string) => invoke('projects:createSection', projectId, name),
    renameSection: (id: number, name: string) => invoke('projects:renameSection', id, name),
    removeSection: (id: number) => invoke('projects:removeSection', id),
    reorderSections: (ids: number[]) => invoke('projects:reorderSections', ids),
    dragOut: (paths: string[]) => ipcRenderer.send('projects:dragOut', paths),
    sessions: (projectId: number) => invoke('projectSessions:list', projectId),
    createSession: (projectId: number, data: unknown) => invoke('projectSessions:create', projectId, data),
    updateSession: (id: number, patch: unknown) => invoke('projectSessions:update', id, patch),
    removeSession: (id: number) => invoke('projectSessions:remove', id),
    previewChanges: (projectId: number) => invoke('projects:previewChanges', projectId),
    snapshot: (projectId: number) => invoke('projects:snapshot', projectId),
    endSession: (projectId: number, data: unknown) => invoke('projects:endSession', projectId, data),
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
    pathForFile: (file: File) => webUtils.getPathForFile(file),
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
  fs: {
    listDir: (dir: string) => invoke('fs:listDir', dir),
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
  files: {
    pickFolder: () => invoke('files:pickFolder'),
    pickImage: () => invoke('files:pickImage'),
    saveCoverFromPath: (src: string) => invoke('files:saveCoverFromPath', src),
    saveCoverFromBytes: (name: string, bytes: ArrayBuffer) => invoke('files:saveCoverFromBytes', name, bytes),
  },
  media: {
    fileUrl: (p: string) => `media://local/?p=${encodeURIComponent(p)}`,
  },
  clipboard: {
    copy: (payload: { text?: string; imagePaths?: string[] }) => invoke('clipboard:copy', payload),
  },
  p2p: {
    fileMeta: (filePath: string) =>
      invoke('p2p:fileMeta', filePath) as Promise<{ name: string; size: number; sha256: string; path: string } | null>,
    readFile: (filePath: string) => invoke('p2p:readFile', filePath) as Promise<ArrayBuffer>,
    saveIncoming: (name: string, bytes: ArrayBuffer) => invoke('p2p:saveIncoming', name, bytes) as Promise<string | null>,
  },
  data: {
    exportAll: () => invoke('data:exportAll'),
    importAll: () => invoke('data:importAll'),
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
  },
}

contextBridge.exposeInMainWorld('wist', api)
