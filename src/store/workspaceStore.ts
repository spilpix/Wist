import { create } from 'zustand'
import { supabase } from '../data/cloud'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Workspace {
  id: string
  name: string
  join_code: string
  created_by: string | null
  created_at: string
}

export interface WorkspaceMember {
  workspace_id: string
  user_id: string
  display_name: string
  last_seen: string
  joined_at: string
}

export interface SharedProject {
  id: string
  workspace_id: string
  name: string
  color: string | null
  kind: string
  status: string
  description: string | null
  deadline: string | null
  created_by: string | null
  updated_at: string
  created_at: string
}

export interface SharedTask {
  id: string
  workspace_id: string
  project_id: string
  title: string
  status: string
  done: boolean
  due_date: string | null
  notes: string | null
  priority: string | null
  assignee_id: string | null
  assignee_name: string | null
  created_by: string | null
  updated_at: string
  created_at: string
}

export interface SharedComment {
  id: string
  workspace_id: string
  task_id: string
  author_id: string | null
  author_name: string | null
  body: string
  created_at: string
}

export interface SharedActivity {
  id: string
  workspace_id: string
  project_id: string | null
  actor_id: string | null
  actor_name: string | null
  kind: string
  summary: string
  created_at: string
}

export interface SharedNote {
  id: string
  workspace_id: string
  project_id: string | null
  title: string
  content: string
  created_by: string | null
  updated_at: string
  created_at: string
}

// ─── Store ───────────────────────────────────────────────────────────────────

type Status = 'idle' | 'loading' | 'ready' | 'error'

interface WorkspaceState {
  userId: string | null
  workspace: Workspace | null
  members: WorkspaceMember[]
  projects: SharedProject[]
  activity: SharedActivity[]
  status: Status
  error: string | null

  init: () => Promise<void>
  create: (opts: { name: string; displayName: string }) => Promise<void>
  join: (opts: { code: string; displayName: string }) => Promise<void>
  leave: () => Promise<void>
  deleteWorkspace: () => Promise<void>
  removeMember: (memberId: string) => Promise<void>
  renameWorkspace: (name: string) => Promise<void>
  isOwner: () => boolean
  updateDisplayName: (name: string) => Promise<void>
  createProject: (name: string) => Promise<SharedProject | null>
  deleteProject: (id: string) => Promise<void>
  ping: () => Promise<void>
  logActivity: (kind: string, summary: string, projectId?: string | null) => Promise<void>
  myName: () => string
  _loadActivity: (wsId: string) => Promise<void>
  _setup: (wsId: string) => void
  _teardown: () => void
}

// Join code: 8 uppercase chars, groups of 4, no ambiguous chars (0/O/I/1/L)
function generateJoinCode(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  const seg = (n: number) => Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
  return `${seg(4)}-${seg(4)}`
}

const WS_STORAGE_KEY = 'bard-workspace-id'
const DEVICE_ID_KEY = 'bard-device-id'

function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(DEVICE_ID_KEY, id)
  }
  return id
}

// Module-level channel ref so teardown works across calls
let _channel: ReturnType<typeof supabase.channel> | null = null

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  userId: null,
  workspace: null,
  members: [],
  projects: [],
  activity: [],
  status: 'idle',
  error: null,

  // ── Init (call once on app start) ─────────────────────────────────────────

  init: async () => {
    if (get().status !== 'idle') return
    set({ status: 'loading' })
    try {
      // Stable device identity — no auth required (RLS is disabled)
      const userId = getDeviceId()
      set({ userId })

      // Restore saved workspace
      const wsId = localStorage.getItem(WS_STORAGE_KEY)
      if (!wsId) { set({ status: 'ready' }); return }

      const { data: ws, error: wsErr } = await supabase
        .from('workspaces').select('*').eq('id', wsId).single()
      if (wsErr || !ws) {
        localStorage.removeItem(WS_STORAGE_KEY)
        set({ status: 'ready' })
        return
      }

      const [{ data: members }, { data: projects }] = await Promise.all([
        supabase.from('workspace_members').select('*').eq('workspace_id', wsId),
        supabase.from('shared_projects').select('*').eq('workspace_id', wsId).order('created_at'),
      ])

      set({ workspace: ws, members: members ?? [], projects: projects ?? [], status: 'ready' })
      get()._setup(wsId)
      get()._loadActivity(wsId)
      get().ping()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Connection failed'
      console.error('[workspace] init failed', e)
      set({ status: 'error', error: msg })
    }
  },

  // ── Create workspace ───────────────────────────────────────────────────────

  create: async ({ name, displayName }) => {
    const { userId } = get()
    if (!userId) throw new Error('Not authenticated')

    const joinCode = generateJoinCode()

    const { data: ws, error: wsErr } = await supabase
      .from('workspaces')
      .insert({ name, join_code: joinCode, created_by: userId })
      .select().single()
    if (wsErr) throw wsErr

    await supabase.from('workspace_members').insert({
      workspace_id: ws.id, user_id: userId, display_name: displayName,
    })

    localStorage.setItem(WS_STORAGE_KEY, ws.id)
    const me: WorkspaceMember = {
      workspace_id: ws.id, user_id: userId, display_name: displayName,
      last_seen: new Date().toISOString(), joined_at: new Date().toISOString(),
    }
    set({ workspace: ws, members: [me], projects: [], activity: [], error: null })
    get()._setup(ws.id)
  },

  // ── Join workspace by code ─────────────────────────────────────────────────

  join: async ({ code, displayName }) => {
    const { userId } = get()
    if (!userId) throw new Error('Not authenticated')

    const normalized = code.trim().toUpperCase()
    const { data: ws, error } = await supabase
      .from('workspaces').select('*').eq('join_code', normalized).single()
    if (error || !ws) throw new Error('workspace_not_found')

    await supabase.from('workspace_members').upsert({
      workspace_id: ws.id, user_id: userId, display_name: displayName,
      last_seen: new Date().toISOString(),
    })

    const [{ data: members }, { data: projects }] = await Promise.all([
      supabase.from('workspace_members').select('*').eq('workspace_id', ws.id),
      supabase.from('shared_projects').select('*').eq('workspace_id', ws.id).order('created_at'),
    ])

    localStorage.setItem(WS_STORAGE_KEY, ws.id)
    set({ workspace: ws, members: members ?? [], projects: projects ?? [], error: null })
    get()._setup(ws.id)
    get()._loadActivity(ws.id)
    get().logActivity('member_join', `${displayName} присоединился к воркспейсу`)
  },

  // ── Leave workspace ────────────────────────────────────────────────────────

  leave: async () => {
    const { workspace, userId } = get()
    if (!workspace || !userId) return
    await supabase.from('workspace_members')
      .delete().eq('workspace_id', workspace.id).eq('user_id', userId)
    get()._teardown()
    localStorage.removeItem(WS_STORAGE_KEY)
    set({ workspace: null, members: [], projects: [], activity: [] })
  },

  // ── Owner check ────────────────────────────────────────────────────────────
  // The creator is the owner. Legacy workspaces with a null created_by are treated
  // as owner-less (anyone may manage them) so they're never permanently locked.
  isOwner: () => {
    const { workspace, userId } = get()
    if (!workspace) return false
    return !workspace.created_by || workspace.created_by === userId
  },

  // ── Delete the whole workspace (owner only) ────────────────────────────────
  // Best-effort cascade so it works whether or not the DB has ON DELETE CASCADE
  // foreign keys — every per-workspace row is removed, then the workspace itself.
  deleteWorkspace: async () => {
    const { workspace } = get()
    if (!workspace || !get().isOwner()) throw new Error('not_owner')
    const wsId = workspace.id
    // canvas nodes are scoped by canvas, not workspace — clear them via their canvases
    try {
      const { data: canvases } = await supabase.from('shared_canvases').select('id').eq('workspace_id', wsId)
      const canvasIds = (canvases ?? []).map((c: { id: string }) => c.id)
      if (canvasIds.length) await supabase.from('shared_canvas_nodes').delete().in('canvas_id', canvasIds)
    } catch { /* table may not exist / no cascade needed */ }
    const childTables = ['shared_comments', 'shared_tasks', 'shared_notes', 'shared_activity', 'shared_files', 'shared_canvases', 'shared_projects', 'workspace_members']
    for (const table of childTables) {
      try { await supabase.from(table).delete().eq('workspace_id', wsId) } catch { /* best effort */ }
    }
    await supabase.from('workspaces').delete().eq('id', wsId)
    get()._teardown()
    localStorage.removeItem(WS_STORAGE_KEY)
    set({ workspace: null, members: [], projects: [], activity: [] })
  },

  // ── Remove a member (owner only) ───────────────────────────────────────────
  removeMember: async (memberId) => {
    const { workspace, userId } = get()
    if (!workspace || !get().isOwner()) throw new Error('not_owner')
    if (memberId === userId) return // owner leaves via leave()/delete, not remove
    const member = get().members.find((m) => m.user_id === memberId)
    await supabase.from('workspace_members').delete().eq('workspace_id', workspace.id).eq('user_id', memberId)
    set((s) => ({ members: s.members.filter((m) => m.user_id !== memberId) }))
    if (member) get().logActivity('member_remove', `удалил(а) участника ${member.display_name}`)
  },

  // ── Rename the workspace (owner only) ──────────────────────────────────────
  renameWorkspace: async (name) => {
    const { workspace } = get()
    if (!workspace || !get().isOwner()) throw new Error('not_owner')
    const v = name.trim()
    if (!v || v === workspace.name) return
    await supabase.from('workspaces').update({ name: v }).eq('id', workspace.id)
    set({ workspace: { ...workspace, name: v } })
    get().logActivity('workspace_rename', `переименовал(а) воркспейс в «${v}»`)
  },

  // ── Update own display name ────────────────────────────────────────────────

  updateDisplayName: async (name) => {
    const { workspace, userId } = get()
    if (!workspace || !userId) return
    await supabase.from('workspace_members')
      .update({ display_name: name })
      .eq('workspace_id', workspace.id).eq('user_id', userId)
    set((s) => ({
      members: s.members.map((m) => m.user_id === userId ? { ...m, display_name: name } : m),
    }))
  },

  // ── Projects ───────────────────────────────────────────────────────────────

  createProject: async (name) => {
    const { workspace, userId } = get()
    if (!workspace) return null
    const { data, error } = await supabase
      .from('shared_projects')
      .insert({ workspace_id: workspace.id, name, created_by: userId })
      .select().single()
    if (error) throw error
    set((s) => ({ projects: [...s.projects, data] }))
    get().logActivity('project_create', `создал проект «${name}»`, data.id)
    return data
  },

  deleteProject: async (id) => {
    const proj = get().projects.find((p) => p.id === id)
    await supabase.from('shared_projects').delete().eq('id', id)
    set((s) => ({ projects: s.projects.filter((p) => p.id !== id) }))
    if (proj) get().logActivity('project_delete', `удалил проект «${proj.name}»`)
  },

  // ── Ping (update last_seen) ────────────────────────────────────────────────

  ping: async () => {
    const { workspace, userId } = get()
    if (!workspace || !userId) return
    await supabase.from('workspace_members')
      .update({ last_seen: new Date().toISOString() })
      .eq('workspace_id', workspace.id).eq('user_id', userId)
  },

  // ── Activity feed ──────────────────────────────────────────────────────────

  myName: () => {
    const { members, userId } = get()
    return members.find((m) => m.user_id === userId)?.display_name ?? 'Кто-то'
  },

  logActivity: async (kind, summary, projectId = null) => {
    const { workspace, userId } = get()
    if (!workspace) return
    await supabase.from('shared_activity').insert({
      workspace_id: workspace.id,
      project_id: projectId,
      actor_id: userId,
      actor_name: get().myName(),
      kind,
      summary,
    })
  },

  _loadActivity: async (wsId) => {
    const { data } = await supabase
      .from('shared_activity').select('*')
      .eq('workspace_id', wsId)
      .order('created_at', { ascending: false })
      .limit(40)
    if (data) set({ activity: data })
  },

  // ── Realtime ───────────────────────────────────────────────────────────────

  _setup: (wsId) => {
    get()._teardown()
    _channel = supabase
      .channel(`ws:${wsId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'workspace_members', filter: `workspace_id=eq.${wsId}` },
        () => supabase.from('workspace_members').select('*').eq('workspace_id', wsId)
          .then(({ data }) => { if (data) set({ members: data }) })
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shared_projects', filter: `workspace_id=eq.${wsId}` },
        () => supabase.from('shared_projects').select('*').eq('workspace_id', wsId).order('created_at')
          .then(({ data }) => { if (data) set({ projects: data }) })
      )
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'shared_activity', filter: `workspace_id=eq.${wsId}` },
        (payload) => set((s) => ({ activity: [payload.new as SharedActivity, ...s.activity].slice(0, 40) }))
      )
      .subscribe()
  },

  _teardown: () => {
    if (_channel) { supabase.removeChannel(_channel); _channel = null }
  },
}))
