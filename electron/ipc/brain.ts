import { app, BrowserWindow, shell } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { db } from '../db/database'
import { getSettings, setSettings } from '../settings'

/**
 * Bard's "brain": SQLite stays the live engine (fast, like Notion's local cache),
 * but everything is ALSO mirrored to an open, human-readable folder (like an
 * Obsidian vault) — a lossless `bard-brain.json` for exact restore + Markdown
 * files you can read in any app. So the knowledge survives a reinstall: point
 * Bard at the folder and "Restore" rebuilds the database.
 */

// every user table (NOT schema_migrations) — the lossless snapshot set, in FK-safe
// creation order (parents before children) so a restore inserts cleanly.
const TABLES = [
  'projects', 'project_sections', 'project_assets', 'project_sessions', 'project_snapshots', 'project_patches',
  'note_folders', 'notes', 'journal_entries', 'tasks', 'task_comments', 'vault_files',
  'canvases', 'favorites',
] as const

function emitChange() {
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send('wist:data-changed', 'all')
}

export function brainDir(): string {
  const custom = getSettings().brainFolder
  return custom && custom.trim() ? custom : path.join(app.getPath('documents'), 'Bard Brain')
}

function tableRows(table: string): any[] {
  try {
    return db().prepare(`SELECT * FROM ${table}`).all()
  } catch {
    return [] // table may not exist on an older schema — tolerate it
  }
}

export interface BrainStats {
  notes: number
  tasks: number
  tasksDone: number
  journal: number
  projects: number
  canvases: number
}

export function brainStats(): BrainStats {
  const c = (sql: string) => {
    try {
      return (db().prepare(sql).get() as { c: number }).c
    } catch {
      return 0
    }
  }
  return {
    notes: c('SELECT COUNT(*) c FROM notes WHERE deleted_at IS NULL'),
    tasks: c('SELECT COUNT(*) c FROM tasks WHERE deleted_at IS NULL'),
    tasksDone: c('SELECT COUNT(*) c FROM tasks WHERE done=1 AND deleted_at IS NULL'),
    journal: c('SELECT COUNT(*) c FROM journal_entries'),
    projects: c('SELECT COUNT(*) c FROM projects WHERE deleted_at IS NULL'),
    canvases: c('SELECT COUNT(*) c FROM canvases'),
  }
}

// ---- human-readable Markdown mirror (the "Obsidian vault" part) ----
function safeName(s: string, fallback: string): string {
  const n = (s || '').replace(/[\\/:*?"<>|#^[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)
  return n || fallback
}
function jsonArr(v: unknown): string[] {
  try {
    const a = JSON.parse(String(v ?? '[]'))
    return Array.isArray(a) ? a.map(String) : []
  } catch {
    return []
  }
}

function writeMarkdown(dir: string) {
  const write = (rel: string, content: string) => {
    const f = path.join(dir, rel)
    fs.mkdirSync(path.dirname(f), { recursive: true })
    fs.writeFileSync(f, content, 'utf-8')
  }
  const s = brainStats()

  write(
    'BRAIN.md',
    [
      '# 🧠 Bard — Мозг',
      '',
      `_Обновлено: ${new Date().toLocaleString()}_`,
      '',
      '## Что в базе',
      '',
      `- ✅ Задачи: **${s.tasks}** (выполнено ${s.tasksDone})`,
      `- 📝 Заметки: **${s.notes}**`,
      `- 📔 Дневник: **${s.journal}** записей`,
      `- 📂 Хабы: **${s.projects}**`,
      `- 🎨 Холсты: **${s.canvases}**`,
      '',
      '> Это человекочитаемое зеркало базы Барда. Полная копия для восстановления — `bard-brain.json`.',
      '',
    ].join('\n')
  )

  // Tasks.md — Obsidian-style checkboxes
  const tasks = tableRows('tasks').filter((t) => !t.deleted_at)
  write(
    'Tasks.md',
    ['# ✅ Задачи', '']
      .concat(tasks.length ? tasks.map((t) => `- [${t.done ? 'x' : ' '}] ${t.title}${t.due_date ? `  *(${String(t.due_date).slice(0, 10)})*` : ''}`) : ['_пусто_'])
      .join('\n')
  )

  // Projects.md
  const projects = tableRows('projects').filter((p) => !p.deleted_at)
  write(
    'Projects.md',
    ['# 📂 Хабы', '']
      .concat(projects.length ? projects.map((p) => `- **${p.name}** — ${p.kind} · ${p.status}`) : ['_пусто_'])
      .join('\n')
  )

  // Notes/*.md — one markdown file per note (frontmatter + content)
  for (const n of tableRows('notes').filter((x) => !x.deleted_at)) {
    const fm = ['---', `title: ${JSON.stringify(n.title || '')}`, `tags: [${jsonArr(n.tags).join(', ')}]`, `created: ${n.created_at}`, `updated: ${n.updated_at}`, '---', '', ''].join('\n')
    write(path.join('Notes', `${safeName(n.title, 'note')}-${n.id}.md`), fm + (n.content || ''))
  }

  // Journal/YYYY-MM-DD.md
  for (const j of tableRows('journal_entries')) {
    write(path.join('Journal', `${j.day}.md`), `# ${j.day}${j.mood ? `  (настроение ${j.mood}/5)` : ''}\n\n${j.content || ''}`)
  }
}

/** Mirror the whole database to the brain folder (JSON snapshot + Markdown). */
export function syncBrain(): { dir: string; records: number } {
  const dir = brainDir()
  fs.mkdirSync(dir, { recursive: true })
  const snapshot: Record<string, unknown> = {
    app: 'wist',
    kind: 'bard-brain',
    version: 1,
    exported_at: new Date().toISOString(),
    settings: getSettings(),
  }
  let records = 0
  for (const tbl of TABLES) {
    const rows = tableRows(tbl)
    snapshot[tbl] = rows
    records += rows.length
  }
  const finalPath = path.join(dir, 'bard-brain.json')
  const tmpPath = finalPath + '.tmp'
  fs.writeFileSync(tmpPath, JSON.stringify(snapshot, null, 2), 'utf-8')
  fs.renameSync(tmpPath, finalPath)
  try {
    writeMarkdown(dir)
  } catch (e) {
    console.error('[brain] markdown mirror failed', e)
  }
  return { dir, records }
}

/** Rebuild the database from the brain folder's snapshot (reinstall recovery). */
export function restoreBrain(): { restored: number } {
  const file = path.join(brainDir(), 'bard-brain.json')
  if (!fs.existsSync(file)) throw new Error('bard-brain.json not found in the brain folder')
  const raw = JSON.parse(fs.readFileSync(file, 'utf-8'))
  if (raw?.kind !== 'bard-brain' && raw?.app !== 'wist') throw new Error('Not a Bard brain snapshot')

  const d = db()
  let restored = 0
  d.pragma('foreign_keys = OFF') // PRAGMA is a no-op inside a transaction — toggle outside
  try {
    const tx = d.transaction(() => {
      for (const tbl of [...TABLES].reverse()) {
        try {
          d.prepare(`DELETE FROM ${tbl}`).run()
        } catch {
          /* table may not exist */
        }
      }
      for (const tbl of TABLES) {
        const rows: any[] = Array.isArray(raw[tbl]) ? raw[tbl] : []
        if (!rows.length) continue
        // intersect the snapshot's keys with the table's real columns so a restore
        // tolerates schema drift in either direction
        let cols: string[]
        try {
          cols = (d.prepare(`PRAGMA table_info(${tbl})`).all() as Array<{ name: string }>).map((c) => c.name)
        } catch {
          continue
        }
        const useCols = cols.filter((c) => Object.prototype.hasOwnProperty.call(rows[0], c))
        if (!useCols.length) continue
        const insert = d.prepare(`INSERT INTO ${tbl} (${useCols.join(',')}) VALUES (${useCols.map((c) => '@' + c).join(',')})`)
        for (const row of rows) {
          const clean: Record<string, unknown> = {}
          for (const c of useCols) clean[c] = row[c] ?? null
          insert.run(clean)
          restored++
        }
      }
    })
    tx()
  } finally {
    d.pragma('foreign_keys = ON')
  }
  if (raw.settings) {
    try {
      // keep the user's CURRENT brain folder, not the snapshot's machine path
      const { brainFolder, ...rest } = raw.settings
      void brainFolder
      setSettings(rest)
    } catch {
      /* ignore */
    }
  }
  emitChange()
  return { restored }
}

/** Wipe every user table (the "Clear database" button). IDs restart from 1. */
export function clearDatabase(): void {
  const d = db()
  d.pragma('foreign_keys = OFF')
  try {
    const tx = d.transaction(() => {
      for (const tbl of [...TABLES].reverse()) {
        try {
          d.prepare(`DELETE FROM ${tbl}`).run()
        } catch {
          /* table may not exist */
        }
      }
      try {
        d.prepare('DELETE FROM sqlite_sequence').run() // reset AUTOINCREMENT counters
      } catch {
        /* no sequence table yet */
      }
    })
    tx()
  } finally {
    d.pragma('foreign_keys = ON')
  }
  emitChange()
}

/** Open the brain folder in the OS file manager (creating it first). */
export async function openBrainFolder(): Promise<string> {
  const dir = brainDir()
  fs.mkdirSync(dir, { recursive: true })
  await shell.openPath(dir)
  return dir
}
