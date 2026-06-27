import { BrowserWindow, dialog } from 'electron'
import fs from 'node:fs'
import { db } from '../db/database'
import { getSettings, setSettings } from '../settings'

// every user table, in FK-safe creation order (parents before children) so a restore
// inserts cleanly. MUST stay in sync with brain.ts's TABLES — both back up the same set.
const TABLES = [
  'projects', 'project_sections', 'project_assets', 'project_sessions', 'project_snapshots', 'project_patches',
  'note_folders', 'notes', 'journal_entries', 'tasks', 'task_comments', 'task_attachments', 'vault_files',
  'canvases', 'favorites', 'collections', 'collection_items', 'edges', 'ai_reports', 'object_types',
] as const

function win(): BrowserWindow | undefined {
  return BrowserWindow.getAllWindows()[0]
}

export async function exportAll(): Promise<string | null> {
  const res = await dialog.showSaveDialog(win()!, {
    title: 'Export Bard data',
    defaultPath: `wist-backup-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }],
  })
  if (res.canceled || !res.filePath) return null

  const safeSettings = { ...getSettings() } as Record<string, unknown>
  delete safeSettings.apiToken
  const payload: Record<string, unknown> = {
    app: 'wist',
    version: 1,
    exported_at: new Date().toISOString(),
    settings: safeSettings,
  }
  for (const table of TABLES) {
    try {
      payload[table] = db().prepare(`SELECT * FROM ${table}`).all()
    } catch {
      payload[table] = []
    }
  }
  fs.writeFileSync(res.filePath, JSON.stringify(payload, null, 2), 'utf-8')
  return res.filePath
}

export async function importAll(): Promise<boolean> {
  const res = await dialog.showOpenDialog(win()!, {
    title: 'Import Bard backup',
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }],
  })
  if (res.canceled || !res.filePaths.length) return false

  const raw = JSON.parse(fs.readFileSync(res.filePaths[0], 'utf-8'))
  if (raw?.app !== 'wist') throw new Error('Not a valid Bard backup file.')

  const d = db()
  d.pragma('foreign_keys = OFF') // PRAGMA is a no-op inside a transaction — toggle outside
  try {
    const tx = d.transaction(() => {
      for (const table of [...TABLES].reverse()) {
        try { d.prepare(`DELETE FROM ${table}`).run() } catch { /* table may not exist */ }
      }
      for (const table of TABLES) {
        const rows: any[] = Array.isArray(raw[table]) ? raw[table] : []
        if (!rows.length) continue
        // intersect the backup's columns with the table's real columns so a restore
        // tolerates schema drift in either direction (mirrors brain.restoreBrain)
        let cols: string[]
        try {
          cols = (d.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((c) => c.name)
        } catch { continue }
        const useCols = cols.filter((c) => Object.prototype.hasOwnProperty.call(rows[0], c))
        if (!useCols.length) continue
        const insert = d.prepare(`INSERT INTO ${table} (${useCols.join(', ')}) VALUES (${useCols.map((c) => '@' + c).join(', ')})`)
        for (const row of rows) {
          const clean: Record<string, unknown> = {}
          for (const c of useCols) clean[c] = row[c] ?? null
          insert.run(clean)
        }
      }
    })
    tx()
  } finally {
    d.pragma('foreign_keys = ON')
  }
  // restore settings too (exportAll writes them; was previously dropped on import).
  // Keep the user's CURRENT brain folder + token, not the backup's machine values.
  if (raw.settings) {
    try {
      const { brainFolder, apiToken, ...rest } = raw.settings
      void brainFolder
      void apiToken
      setSettings(rest)
    } catch { /* ignore */ }
  }
  return true
}
