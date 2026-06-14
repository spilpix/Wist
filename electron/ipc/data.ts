import { BrowserWindow, dialog } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { db } from '../db/database'
import { listMoments } from '../db/moments'
import { getSettings } from '../settings'

const TABLES = [
  'titles', 'episodes', 'moments', 'youtube_sources', 'watch_sessions', 'screenshots',
  'projects', 'project_assets',
  'games', 'game_sessions',
  'notes', 'journal_entries', 'tasks', 'playlists', 'vault_files',
  'canvases',
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

  const payload: Record<string, unknown> = {
    app: 'wist',
    version: 1,
    exported_at: new Date().toISOString(),
    settings: getSettings(),
  }
  for (const table of TABLES) {
    payload[table] = db().prepare(`SELECT * FROM ${table}`).all()
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
  if (raw?.app !== 'wist' || !Array.isArray(raw.titles)) {
    throw new Error('Not a valid Bard backup file.')
  }

  const d = db()
  const tx = d.transaction(() => {
    for (const table of [...TABLES].reverse()) d.prepare(`DELETE FROM ${table}`).run()
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

export function clearHistory(): void {
  const d = db()
  const tx = d.transaction(() => {
    d.prepare('DELETE FROM watch_sessions').run()
    d.prepare('UPDATE episodes SET watched = 0, watch_date = NULL, watch_position_seconds = 0').run()
  })
  tx()
}

export async function exportMoments(): Promise<{ exported: number; dir: string } | null> {
  const res = await dialog.showOpenDialog(win()!, {
    title: 'Choose export folder for moments',
    properties: ['openDirectory', 'createDirectory'],
  })
  if (res.canceled || !res.filePaths.length) return null
  const dir = res.filePaths[0]

  const moments = listMoments()
  let exported = 0
  const meta = moments.map((m) => {
    let copied: string | null = null
    if (m.screenshot_path && fs.existsSync(m.screenshot_path)) {
      copied = path.basename(m.screenshot_path)
      try {
        fs.copyFileSync(m.screenshot_path, path.join(dir, copied))
        exported++
      } catch {
        copied = null
      }
    }
    return { ...m, screenshot_file: copied }
  })
  fs.writeFileSync(path.join(dir, 'moments.json'), JSON.stringify(meta, null, 2), 'utf-8')
  return { exported, dir }
}
