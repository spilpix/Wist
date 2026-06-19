import { BrowserWindow, dialog } from 'electron'
import fs from 'node:fs'
import { db } from '../db/database'
import { getSettings } from '../settings'

const TABLES = [
  'projects', 'project_sections', 'project_assets', 'project_sessions', 'project_snapshots', 'project_patches',
  'note_folders', 'notes', 'journal_entries', 'tasks', 'task_comments', 'vault_files',
  'canvases', 'favorites',
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
  const tx = d.transaction(() => {
    for (const table of [...TABLES].reverse()) {
      try { d.prepare(`DELETE FROM ${table}`).run() } catch { /* table may not exist */ }
    }
    for (const table of TABLES) {
      const rows: any[] = raw[table] ?? []
      if (!rows.length) continue
      const cols = Object.keys(rows[0])
      const insert = d.prepare(
        `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map((c) => '@' + c).join(', ')})`
      )
      for (const row of rows) insert.run(row)
    }
  })
  tx()
  return true
}
