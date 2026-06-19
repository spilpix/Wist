import { app, ipcMain, nativeImage, shell, dialog, BrowserWindow, clipboard } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import * as notes from '../db/notes'
import * as noteFolders from '../db/noteFolders'
import * as tasks from '../db/tasks'
import * as projects from '../db/projects'
import * as projectSessions from '../db/projectSessions'
import * as projectPatches from '../db/projectPatches'
import * as trash from '../db/trash'
import * as favorites from '../db/favorites'
import * as canvases from '../db/canvases'
import * as vault from '../db/vault'
import * as files from './files'
import * as data from './data'
import * as brain from './brain'
import { registerP2pHandlers } from './p2p'
import { getSettings, setSettings, regenerateApiToken } from '../settings'
import { restartApiServer } from '../apiServer'

export function registerIpcHandlers(): void {
  registerP2pHandlers()
  const emitChange = (kind: string) => BrowserWindow.getAllWindows()[0]?.webContents.send('wist:data-changed', kind)
  const trashEvent: Record<string, string> = { project: 'projects', note: 'notes', task: 'tasks' }

  // --- notes ---
  ipcMain.handle('notes:list', (_e, filters) => notes.listNotes(filters ?? {}))
  ipcMain.handle('notes:get', (_e, id: number) => notes.getNote(id))
  ipcMain.handle('notes:create', (_e, payload) => {
    const r = notes.createNote(payload ?? {})
    emitChange('notes')
    return r
  })
  ipcMain.handle('notes:update', (_e, id: number, patch) => {
    const r = notes.updateNote(id, patch ?? {})
    emitChange('notes')
    return r
  })
  ipcMain.handle('notes:remove', (_e, id: number) => {
    notes.deleteNote(id)
    emitChange('notes')
  })
  ipcMain.handle('notes:tags', () => notes.distinctNoteTags())

  // --- note folders ---
  ipcMain.handle('noteFolders:list', () => noteFolders.listFolders())
  ipcMain.handle('noteFolders:create', (_e, name: string, parentId?: number | null) => {
    const r = noteFolders.createFolder(name ?? '', parentId ?? null)
    emitChange('notes')
    return r
  })
  ipcMain.handle('noteFolders:rename', (_e, id: number, name: string) => {
    const r = noteFolders.renameFolder(id, name ?? '')
    emitChange('notes')
    return r
  })
  ipcMain.handle('noteFolders:move', (_e, id: number, parentId: number | null) => {
    noteFolders.moveFolder(id, parentId ?? null)
    emitChange('notes')
  })
  ipcMain.handle('noteFolders:remove', (_e, id: number) => {
    noteFolders.removeFolder(id)
    emitChange('notes')
  })
  ipcMain.handle('noteFolders:reorder', (_e, ids: number[]) => {
    noteFolders.reorderFolders(ids ?? [])
    emitChange('notes')
  })

  // --- tasks ---
  ipcMain.handle('tasks:list', (_e, filters) => tasks.listTasks(filters ?? {}))
  ipcMain.handle('tasks:create', (_e, payload) => {
    const r = tasks.createTask(payload ?? {})
    emitChange('tasks')
    return r
  })
  ipcMain.handle('tasks:update', (_e, id: number, patch) => {
    const r = tasks.updateTask(id, patch ?? {})
    emitChange('tasks')
    return r
  })
  ipcMain.handle('tasks:remove', (_e, id: number) => {
    tasks.deleteTask(id)
    emitChange('tasks')
  })
  ipcMain.handle('tasks:clearCompleted', () => {
    const n = tasks.clearCompleted()
    emitChange('tasks')
    return n
  })
  ipcMain.handle('tasks:reorder', (_e, ids: number[]) => {
    tasks.reorderTasks(Array.isArray(ids) ? ids : [])
    emitChange('tasks')
  })
  ipcMain.handle('tasks:comments', (_e, taskId: number) => tasks.listComments(taskId))
  ipcMain.handle('tasks:addComment', (_e, taskId: number, body: string) => tasks.addComment(taskId, body))
  ipcMain.handle('tasks:removeComment', (_e, id: number) => tasks.removeComment(id))
  ipcMain.handle('tasks:attachments', (_e, taskId: number) => tasks.listAttachments(taskId))
  ipcMain.handle('tasks:addAttachment', (_e, taskId: number, filePath: string, name: string) => tasks.addAttachment(taskId, filePath, name))
  ipcMain.handle('tasks:removeAttachment', (_e, id: number) => tasks.removeAttachment(id))

  ipcMain.handle('clipboard:copy', (_e, payload: { text?: string; imagePaths?: string[] }) => {
    const text = payload.text ?? ''
    const paths = (payload.imagePaths ?? []).filter(Boolean)
    let bitmap: ReturnType<typeof nativeImage.createFromPath> | null = null
    const imgTags: string[] = []
    for (const p of paths) {
      try {
        const ext = path.extname(p).slice(1).toLowerCase() || 'png'
        const mime = ext === 'jpg' ? 'jpeg' : ext
        imgTags.push(
          `<img src="data:image/${mime};base64,${fs.readFileSync(p).toString('base64')}" style="max-width:100%;display:block;margin:8px 0" />`
        )
        if (!bitmap) {
          const ni = nativeImage.createFromPath(p)
          if (!ni.isEmpty()) bitmap = ni
        }
      } catch {
        /* unreadable file — skip */
      }
    }
    const data: { text?: string; html?: string; image?: ReturnType<typeof nativeImage.createFromPath> } = {}
    if (text) data.text = text
    if (text || imgTags.length) {
      const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      data.html = `<div style="white-space:pre-wrap;font-family:sans-serif">${esc}</div>${imgTags.join('')}`
    }
    if (bitmap) data.image = bitmap
    if (!data.text && !data.html && !data.image) return false
    clipboard.write(data)
    return true
  })

  // --- projects ---
  ipcMain.handle('projects:list', () => projects.listProjects())
  ipcMain.handle('projects:get', (_e, id: number) => projects.getProject(id))
  ipcMain.handle('projects:create', (_e, payload) => {
    const r = projects.createProject(payload ?? {})
    emitChange('projects')
    return r
  })
  ipcMain.handle('projects:update', (_e, id: number, patch) => {
    const r = projects.updateProject(id, patch ?? {})
    emitChange('projects')
    return r
  })
  ipcMain.handle('projects:remove', (_e, id: number) => {
    projects.deleteProject(id)
    emitChange('projects')
  })
  ipcMain.handle('projects:reorder', (_e, ids: number[]) => {
    projects.reorderProjects(ids ?? [])
    emitChange('projects')
  })

  // --- trash ---
  ipcMain.handle('trash:list', () => trash.listTrash())
  ipcMain.handle('trash:restore', (_e, kind: string, id: number) => {
    trash.restoreTrash(kind, id)
    emitChange(trashEvent[kind] ?? kind)
  })
  ipcMain.handle('trash:purge', (_e, kind: string, id: number) => {
    trash.purgeTrash(kind, id)
    emitChange(trashEvent[kind] ?? kind)
  })
  ipcMain.handle('trash:empty', () => {
    const n = trash.emptyTrash()
    emitChange('tasks')
    emitChange('notes')
    emitChange('projects')
    return n
  })

  // project assets
  ipcMain.handle('projects:assets', (_e, projectId: number) => projects.listAssets(projectId))
  ipcMain.handle('projects:addFiles', async (_e, projectId: number, sectionId?: number | null) => {
    const res = await dialog.showOpenDialog(BrowserWindow.getAllWindows()[0]!, { properties: ['openFile', 'multiSelections'] })
    if (res.canceled || !res.filePaths.length) return 0
    return projects.addAssets(projectId, res.filePaths.map((p) => ({ kind: 'file' as const, path: p, label: path.basename(p) })), sectionId)
  })
  ipcMain.handle('projects:addFolder', async (_e, projectId: number, sectionId?: number | null) => {
    const res = await dialog.showOpenDialog(BrowserWindow.getAllWindows()[0]!, { properties: ['openDirectory', 'multiSelections'] })
    if (res.canceled || !res.filePaths.length) return 0
    return projects.addAssets(projectId, res.filePaths.map((p) => ({ kind: 'folder' as const, path: p, label: path.basename(p) })), sectionId)
  })
  ipcMain.handle('projects:addImages', async (_e, projectId: number, sectionId?: number | null) => {
    const res = await dialog.showOpenDialog(BrowserWindow.getAllWindows()[0]!, {
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif'] }],
    })
    if (res.canceled || !res.filePaths.length) return 0
    return projects.addAssets(projectId, res.filePaths.map((p) => ({ kind: 'image' as const, path: p, label: path.basename(p) })), sectionId)
  })
  ipcMain.handle('projects:addUrl', (_e, projectId: number, url: string, label: string | null, sectionId?: number | null) =>
    projects.addAssets(projectId, [{ kind: 'url', url, label: label || url }], sectionId)
  )
  ipcMain.handle('projects:addPaths', (_e, projectId: number, paths: string[], sectionId?: number | null) => {
    const items = (paths ?? []).filter(Boolean).map((p) => {
      let kind: 'folder' | 'image' | 'file' = 'file'
      try {
        if (fs.statSync(p).isDirectory()) kind = 'folder'
      } catch { /* treat as file */ }
      if (kind === 'file' && /\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(p)) kind = 'image'
      return { kind, path: p, label: path.basename(p) }
    })
    return projects.addAssets(projectId, items, sectionId)
  })
  ipcMain.handle('projects:removeAsset', (_e, id: number) => projects.removeAsset(id))
  ipcMain.handle('projects:reorderAssets', (_e, ids: number[]) => projects.reorderAssets(ids ?? []))
  ipcMain.handle('projects:moveAsset', (_e, id: number, sectionId: number | null) => projects.moveAsset(id, sectionId ?? null))

  // project sections
  ipcMain.handle('projects:sections', (_e, projectId: number) => projects.listSections(projectId))
  ipcMain.handle('projects:createSection', (_e, projectId: number, name: string) => projects.createSection(projectId, name ?? ''))
  ipcMain.handle('projects:renameSection', (_e, id: number, name: string) => projects.renameSection(id, name ?? ''))
  ipcMain.handle('projects:removeSection', (_e, id: number) => projects.removeSection(id))
  ipcMain.handle('projects:reorderSections', (_e, ids: number[]) => projects.reorderSections(ids ?? []))

  ipcMain.on('projects:dragOut', (e, paths: string[]) => {
    const draggable = (paths ?? []).filter((p) => typeof p === 'string' && fs.existsSync(p))
    if (!draggable.length) return
    let icon = nativeImage.createFromPath(path.join(app.getAppPath(), 'build', 'icon-32.png'))
    if (icon.isEmpty()) {
      const s = 24
      const buf = Buffer.alloc(s * s * 4)
      for (let i = 0; i < buf.length; i += 4) (buf[i] = 0xe1), (buf[i + 1] = 0x83), (buf[i + 2] = 0x23), (buf[i + 3] = 0xff)
      icon = nativeImage.createFromBitmap(buf, { width: s, height: s })
    }
    e.sender.startDrag(draggable.length === 1 ? { file: draggable[0], icon } : { file: draggable[0], files: draggable, icon })
  })

  // hub work sessions
  ipcMain.handle('projectSessions:list', (_e, projectId: number) => projectSessions.listSessions(projectId))
  ipcMain.handle('projectSessions:create', (_e, projectId: number, data) => projectSessions.createSession(projectId, data ?? {}))
  ipcMain.handle('projectSessions:update', (_e, id: number, patch) => projectSessions.updateSession(id, patch ?? {}))
  ipcMain.handle('projectSessions:remove', (_e, id: number) => projectSessions.removeSession(id))

  const scanHub = (projectId: number) => {
    const assets = projects.listAssets(projectId)
    const scanned: Record<string, string> = {}
    const seen = new Set<string>()
    let count = 0
    const CAP = 40000
    const SKIP = new Set(['node_modules', '.git', '.cache', 'dist', 'build', '$RECYCLE.BIN'])
    const record = (full: string) => {
      try {
        const st = fs.statSync(full)
        scanned[full] = `${Math.round(st.mtimeMs)}:${st.size}`
        count++
      } catch { /* skip */ }
    }
    const walk = (dir: string, depth: number) => {
      if (depth > 14 || count >= CAP) return
      let real: string
      try { real = fs.realpathSync.native(dir) } catch { real = dir }
      if (seen.has(real)) return
      seen.add(real)
      let ents: fs.Dirent[]
      try { ents = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
      for (const en of ents) {
        if (count >= CAP) break
        if (en.name.startsWith('.') || SKIP.has(en.name)) continue
        const full = path.join(dir, en.name)
        let isDir = en.isDirectory()
        if (!isDir && en.isSymbolicLink()) {
          try { isDir = fs.statSync(full).isDirectory() } catch { continue }
        }
        if (isDir) walk(full, depth + 1)
        else record(full)
      }
    }
    for (const a of assets) {
      if (!a.path) continue
      if (a.kind === 'folder') walk(a.path, 0)
      else if (a.kind === 'file' || a.kind === 'image') record(a.path)
    }
    return { files: scanned, scanned: count }
  }

  const computeDiff = (projectId: number) => {
    const prev = projectSessions.getSnapshot(projectId)
    const { files: current, scanned } = scanHub(projectId)
    const hadSnapshot = Object.keys(prev).length > 0
    const added: string[] = []
    const removed: string[] = []
    const modified: string[] = []
    if (hadSnapshot) {
      for (const p of Object.keys(current)) {
        if (!(p in prev)) added.push(p)
        else if (prev[p] !== current[p]) modified.push(p)
      }
      for (const p of Object.keys(prev)) if (!(p in current)) removed.push(p)
    }
    const cap = (arr: string[]) => arr.slice(0, 1000)
    const changes = {
      added: cap(added), removed: cap(removed), modified: cap(modified),
      addedCount: added.length, removedCount: removed.length, modifiedCount: modified.length, scanned,
    }
    return { files: current, changes }
  }

  ipcMain.handle('projects:previewChanges', (_e, projectId: number) => computeDiff(projectId).changes)
  ipcMain.handle('projects:snapshot', (_e, projectId: number) => {
    projectSessions.saveSnapshot(projectId, scanHub(projectId).files)
  })
  ipcMain.handle('projects:endSession', (_e, projectId: number, data) => {
    const { files: current, changes } = computeDiff(projectId)
    return projectSessions.saveSessionAndSnapshot(projectId, { ...(data ?? {}), changes_json: JSON.stringify(changes) }, current)
  })

  // hub patches
  ipcMain.handle('projectPatches:list', (_e, projectId: number) => projectPatches.listPatches(projectId))
  ipcMain.handle('projectPatches:create', (_e, projectId: number, data) => {
    const r = projectPatches.createPatch(projectId, data ?? {})
    emitChange('projects')
    return r
  })
  ipcMain.handle('projectPatches:update', (_e, id: number, patch) => {
    const r = projectPatches.updatePatch(id, patch ?? {})
    emitChange('projects')
    return r
  })
  ipcMain.handle('projectPatches:remove', (_e, id: number) => {
    projectPatches.removePatch(id)
    emitChange('projects')
  })

  ipcMain.handle('fs:listDir', (_e, dir: string) => {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      return entries
        .filter((en) => !en.name.startsWith('.'))
        .map((en) => ({ name: en.name, path: path.join(dir, en.name), isDir: en.isDirectory() }))
        .sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1))
    } catch {
      return []
    }
  })

  // --- vault ---
  ipcMain.handle('vault:list', (_e, parentId?: number | null) => vault.listVaultFiles(parentId ?? null))
  ipcMain.handle('vault:browse', (_e, dir: string) => vault.browseDir(dir))
  ipcMain.handle('vault:addPaths', (_e, paths: string[], parentId?: number | null) =>
    vault.addVaultFiles(paths ?? [], parentId ?? null)
  )
  ipcMain.handle('vault:createFolder', (_e, name: string, parentId?: number | null) =>
    vault.createVaultFolder(name, parentId ?? null)
  )
  ipcMain.handle('vault:rename', (_e, id: number, name: string) => vault.renameVaultItem(id, name))
  ipcMain.handle('vault:move', (_e, id: number, parentId: number | null) => vault.moveVaultItem(id, parentId ?? null))
  ipcMain.handle('vault:pickAndAdd', async (_e, parentId?: number | null) => {
    const res = await dialog.showOpenDialog(BrowserWindow.getAllWindows()[0]!, {
      properties: ['openFile', 'multiSelections'],
    })
    if (res.canceled || !res.filePaths.length) return 0
    return vault.addVaultFiles(res.filePaths, parentId ?? null)
  })
  ipcMain.handle('vault:addFolder', async (_e, parentId?: number | null) => {
    const res = await dialog.showOpenDialog(BrowserWindow.getAllWindows()[0]!, {
      properties: ['openDirectory', 'multiSelections'],
    })
    if (res.canceled || !res.filePaths.length) return { folders: 0 }
    const folders = vault.addDiskFolders(res.filePaths, parentId ?? null)
    return { folders }
  })
  ipcMain.handle('vault:remove', (_e, id: number) => vault.removeVaultFile(id))
  ipcMain.handle('vault:open', (_e, p: string) => shell.openPath(p))
  ipcMain.on('vault:startDrag', (event, filePath: string) => {
    try {
      let icon = nativeImage.createFromPath(path.join(app.getAppPath(), 'build', 'icon-32.png'))
      if (icon.isEmpty()) icon = nativeImage.createFromPath(filePath)
      if (icon.isEmpty()) {
        icon = nativeImage.createFromDataURL(
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPgPAAEDAQAIicLsAAAAAElFTkSuQmCC'
        )
      }
      event.sender.startDrag({ file: filePath, icon })
    } catch (err) {
      console.error('vault:startDrag failed', err)
    }
  })

  // --- favorites ---
  ipcMain.handle('favorites:list', () => favorites.listFavorites())
  ipcMain.handle('favorites:isFavorite', (_e, kind: string, ref: string | number) =>
    favorites.isFavorite(kind, String(ref))
  )
  ipcMain.handle('favorites:toggle', (_e, input: favorites.FavoriteInput) => {
    const state = favorites.toggleFavorite(input)
    emitChange('favorites')
    return state
  })
  ipcMain.handle('favorites:remove', (_e, kind: string, ref: string | number) => {
    favorites.removeFavorite(kind, ref)
    emitChange('favorites')
  })
  ipcMain.handle('favorites:reorder', (_e, ids: number[]) => {
    favorites.reorderFavorites(ids ?? [])
    emitChange('favorites')
  })

  // --- canvas ---
  ipcMain.handle('canvas:list', () => canvases.listCanvases())
  ipcMain.handle('canvas:get', (_e, id: number) => canvases.getCanvas(id))
  ipcMain.handle('canvas:create', (_e, name: string) => canvases.createCanvas(name))
  ipcMain.handle('canvas:update', (_e, id: number, patch) => canvases.updateCanvas(id, patch ?? {}))
  ipcMain.handle('canvas:remove', (_e, id: number) => canvases.deleteCanvas(id))
  ipcMain.handle('canvas:capture', async (_e, rect: { x: number; y: number; width: number; height: number }, format: 'png' | 'jpeg') => {
    const w = BrowserWindow.getAllWindows()[0]
    if (!w) return null
    const r = {
      x: Math.max(0, Math.round(rect.x)),
      y: Math.max(0, Math.round(rect.y)),
      width: Math.max(1, Math.round(rect.width)),
      height: Math.max(1, Math.round(rect.height)),
    }
    const img = await w.webContents.capturePage(r)
    const bytes = format === 'jpeg' ? img.toJPEG(92) : img.toPNG()
    const size = nativeImage.createFromBuffer(bytes).getSize()
    return { bytes, width: size.width, height: size.height }
  })
  ipcMain.handle('canvas:saveExport', async (_e, defaultName: string, bytes: ArrayBuffer) => {
    const w = BrowserWindow.getAllWindows()[0]
    const res = await dialog.showSaveDialog(w!, { defaultPath: defaultName })
    if (res.canceled || !res.filePath) return null
    fs.writeFileSync(res.filePath, Buffer.from(bytes))
    return res.filePath
  })

  // --- files ---
  ipcMain.handle('files:pickFolder', () => files.pickFolder())
  ipcMain.handle('files:pickImage', () => files.pickImage())
  ipcMain.handle('files:saveCoverFromPath', (_e, src: string) => files.saveCoverFromPath(src))
  ipcMain.handle('files:saveCoverFromBytes', (_e, name: string, bytes: ArrayBuffer) =>
    files.saveCoverFromBytes(name, bytes)
  )

  // --- data ---
  ipcMain.handle('data:exportAll', () => data.exportAll())
  ipcMain.handle('data:importAll', () => data.importAll())
  ipcMain.handle('data:clearDatabase', () => brain.clearDatabase())

  // --- brain ---
  ipcMain.handle('brain:folder', () => brain.brainDir())
  ipcMain.handle('brain:stats', () => brain.brainStats())
  ipcMain.handle('brain:sync', () => brain.syncBrain())
  ipcMain.handle('brain:restore', () => brain.restoreBrain())
  ipcMain.handle('brain:open', () => brain.openBrainFolder())

  // --- settings ---
  ipcMain.handle('settings:get', () => getSettings())
  ipcMain.handle('settings:set', (_e, patch) => {
    const next = setSettings(patch)
    if (patch && ('apiEnabled' in patch || 'apiPort' in patch)) restartApiServer()
    return next
  })
  ipcMain.handle('settings:regenerateApiToken', () => {
    const token = regenerateApiToken()
    restartApiServer()
    return token
  })
  ipcMain.handle('settings:pickDirectory', async () => {
    const res = await dialog.showOpenDialog(BrowserWindow.getAllWindows()[0]!, {
      properties: ['openDirectory', 'createDirectory'],
    })
    return res.canceled || !res.filePaths.length ? null : res.filePaths[0]
  })

  // --- window ---
  ipcMain.handle('window:setTheme', (_e, theme: 'dark' | 'light') => {
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) return
    try {
      win.setTitleBarOverlay(
        theme === 'light'
          ? { color: '#f7f7f5', symbolColor: '#787774', height: 42 }
          : { color: '#202020', symbolColor: '#9b9b99', height: 42 }
      )
      win.setBackgroundColor(theme === 'light' ? '#ffffff' : '#191919')
    } catch {
      /* overlay not supported on this platform */
    }
  })
  ipcMain.handle('window:capturePreview', async (_e, rect: { x: number; y: number; width: number; height: number }) => {
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) return null
    try {
      const r = {
        x: Math.max(0, Math.round(rect.x)),
        y: Math.max(0, Math.round(rect.y)),
        width: Math.max(1, Math.round(rect.width)),
        height: Math.max(1, Math.round(rect.height)),
      }
      const img = (await win.webContents.capturePage(r)).resize({ width: 360 })
      return img.toDataURL()
    } catch {
      return null
    }
  })

  // --- shell ---
  ipcMain.handle('shell:openExternal', (_e, url: string) => {
    if (/^https:\/\//i.test(url)) return shell.openExternal(url)
  })
  ipcMain.handle('shell:showItemInFolder', (_e, p: string) => shell.showItemInFolder(p))
}
