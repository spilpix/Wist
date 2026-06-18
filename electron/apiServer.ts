import http from 'node:http'
import { app } from 'electron'
import { getSettings } from './settings'
import * as tasks from './db/tasks'
import * as notes from './db/notes'
import { now } from './db/database'

/**
 * Local HTTP API so external tools and AI agents can write into Bard:
 * tasks they completed and reports as notes. 127.0.0.1 only,
 * Bearer-token auth, JSON in/out.
 */

let server: http.Server | null = null
let notifyRenderer: (kind: string) => void = () => undefined

export function setApiNotifier(fn: (kind: string) => void): void {
  notifyRenderer = fn
}

function json(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(payload)
}

function readBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (chunk) => {
      data += chunk
      if (data.length > 1_000_000) {
        reject(new Error('Body too large'))
        req.destroy()
      }
    })
    req.on('end', () => {
      if (!data) return resolve({})
      try {
        resolve(JSON.parse(data))
      } catch {
        reject(new Error('Invalid JSON body'))
      }
    })
    req.on('error', reject)
  })
}

async function handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const settings = getSettings()
  const url = new URL(req.url ?? '/', 'http://localhost')
  const route = `${req.method} ${url.pathname.replace(/\/+$/, '') || '/'}`

  if (route === 'GET /api/health') {
    json(res, 200, { ok: true, app: 'wist', version: app.getVersion(), time: now() })
    return
  }

  // everything else requires the token
  const auth = req.headers.authorization ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : (req.headers['x-api-key'] as string | undefined)
  if (!settings.apiToken || token !== settings.apiToken) {
    json(res, 401, { error: 'Unauthorized: pass Authorization: Bearer <token> (see Bard Settings)' })
    return
  }

  try {
    if (route === 'GET /api/tasks') {
      const doneParam = url.searchParams.get('done')
      const list = tasks.listTasks(doneParam === null ? {} : { done: doneParam === '1' || doneParam === 'true' })
      json(res, 200, { tasks: list })
      return
    }

    if (route === 'POST /api/tasks') {
      const body = await readBody(req)
      if (!body.title || typeof body.title !== 'string') {
        json(res, 400, { error: 'title (string) is required' })
        return
      }
      const task = tasks.createTask({
        title: body.title,
        note: typeof body.note === 'string' ? body.note : null,
        priority: body.priority,
        due_date: typeof body.due_date === 'string' ? body.due_date : null,
        tags: body.tags,
        source: typeof body.source === 'string' && body.source ? body.source : 'agent',
      })
      notifyRenderer('tasks')
      json(res, 201, { task })
      return
    }

    const deleteMatch = /^DELETE \/api\/tasks\/(\d+)$/.exec(route)
    if (deleteMatch) {
      const id = Number(deleteMatch[1])
      if (!tasks.getTask(id)) {
        json(res, 404, { error: 'task not found' })
        return
      }
      tasks.deleteTask(id)
      notifyRenderer('tasks')
      json(res, 200, { ok: true })
      return
    }

    const taskMatch = /^PATCH \/api\/tasks\/(\d+)$/.exec(route)
    if (taskMatch) {
      const id = Number(taskMatch[1])
      if (!tasks.getTask(id)) {
        json(res, 404, { error: 'task not found' })
        return
      }
      const body = await readBody(req)
      const task = tasks.updateTask(id, {
        title: typeof body.title === 'string' ? body.title : undefined,
        note: typeof body.note === 'string' ? body.note : undefined,
        done: typeof body.done === 'boolean' ? (body.done ? 1 : 0) as 0 | 1 : undefined,
        priority: body.priority,
        due_date: typeof body.due_date === 'string' ? body.due_date : undefined,
      })
      notifyRenderer('tasks')
      json(res, 200, { task })
      return
    }

    if (route === 'POST /api/notes') {
      const body = await readBody(req)
      if (!body.content || typeof body.content !== 'string') {
        json(res, 400, { error: 'content (string) is required' })
        return
      }
      const note = notes.createNote({
        title: typeof body.title === 'string' ? body.title : '',
        content: body.content,
        tags: body.tags,
        source: typeof body.source === 'string' && body.source ? body.source : 'agent',
      })
      notifyRenderer('notes')
      json(res, 201, { note })
      return
    }

    if (route === 'GET /api/summary') {
      const open = tasks.listTasks({ done: false }).length
      json(res, 200, {
        openTasks: open,
        notes: notes.listNotes({}).length,
      })
      return
    }

    json(res, 404, {
      error: 'Unknown route',
      routes: [
        'GET /api/health',
        'GET /api/tasks?done=0|1',
        'POST /api/tasks {title, note?, priority?, due_date?, tags?, source?}',
        'PATCH /api/tasks/:id {done?, title?, note?, priority?, due_date?}',
        'DELETE /api/tasks/:id',
        'POST /api/notes {content, title?, tags?, source?}',
        'GET /api/summary',
      ],
    })
  } catch (err: any) {
    json(res, 400, { error: String(err?.message ?? err) })
  }
}

export function restartApiServer(): void {
  if (server) {
    server.close()
    server = null
  }
  const settings = getSettings()
  if (!settings.apiEnabled) return
  server = http.createServer((req, res) => {
    handle(req, res).catch((err) => json(res, 500, { error: String(err?.message ?? err) }))
  })
  server.on('error', (err) => {
    console.error('Bard API server error:', err.message)
    server = null
  })
  server.listen(settings.apiPort || 7459, '127.0.0.1')
}
