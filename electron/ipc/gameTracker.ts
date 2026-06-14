import { execFile } from 'node:child_process'
import * as games from '../db/games'

/**
 * Steam-style playtime tracker. Every tick it scans running processes and matches
 * them against registered game executables, accruing real elapsed seconds. Windows
 * only (uses tasklist); a no-op elsewhere.
 */

let timer: ReturnType<typeof setInterval> | null = null
let notify: (() => void) | null = null
const active = new Map<number, { sessionId: number; since: number }>()
const TICK_MS = 15_000

function runningExeNames(): Promise<Set<string>> {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') return resolve(new Set())
    execFile('tasklist', ['/fo', 'csv', '/nh'], { windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => {
      if (err || !stdout) return resolve(new Set())
      const set = new Set<string>()
      for (const line of stdout.split(/\r?\n/)) {
        const m = /^"([^"]+)"/.exec(line)
        if (m) set.add(m[1].toLowerCase())
      }
      resolve(set)
    })
  })
}

async function tick(): Promise<void> {
  const running = await runningExeNames()
  const list = games.gameExeMap()
  const nowMs = Date.now()
  let changed = false

  for (const g of list) {
    const isRun = running.has(g.exe_name)
    const a = active.get(g.id)
    if (isRun) {
      if (a) {
        const secs = Math.round((nowMs - a.since) / 1000)
        if (secs > 0) {
          games.accrueSeconds(g.id, a.sessionId, secs)
          a.since = nowMs
          // note: no notify on plain accrual — only start/stop transitions wake the UI
        }
      } else {
        active.set(g.id, { sessionId: games.startGameSession(g.id), since: nowMs })
        changed = true
      }
    } else if (a) {
      const secs = Math.round((nowMs - a.since) / 1000)
      if (secs > 0) games.accrueSeconds(g.id, a.sessionId, secs)
      games.endGameSession(a.sessionId)
      active.delete(g.id)
      changed = true
    }
  }

  // forget games that were removed while running
  const ids = new Set(list.map((g) => g.id))
  for (const id of [...active.keys()]) if (!ids.has(id)) active.delete(id)

  if (changed && notify) notify()
}

export function startGameTracker(onChange: () => void): void {
  notify = onChange
  if (timer) return
  timer = setInterval(() => void tick(), TICK_MS)
  void tick()
}

export function runningGameIds(): number[] {
  return [...active.keys()]
}
