import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Activity, ArrowLeft, Calendar, Check, CheckCircle2, Circle, Columns3, Copy,
  Crown, Flag, FolderKanban, Globe, List, LogOut,
  MessageSquare, MoreVertical, Pencil, Plus, Send, Trash2, UserMinus, Users, X,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import {
  useWorkspaceStore,
  type SharedComment,
  type SharedNote,
  type SharedProject,
  type SharedTask,
  type WorkspaceMember,
} from '../store/workspaceStore'
import { useSettingsStore } from '../store/settingsStore'
import { toast } from '../store/toastStore'
import { useI18n } from '../i18n'
import EmptyState from '../components/ui/EmptyState'
import Spinner from '../components/ui/Spinner'
import Tabs from '../components/ui/Tabs'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import CanvasSection from '../components/workspace/CanvasSection'
import FilesSection from '../components/workspace/FilesSection'
import {
  Avatar, COLUMNS, dueLabel, PRIORITIES, PRIORITY_META, PROJECT_COLORS, timeAgo,
} from '../lib/wsUi'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isOnline(lastSeen: string): boolean {
  return Date.now() - new Date(lastSeen).getTime() < 5 * 60 * 1000 // within 5 min
}

// ─── No-workspace screen ──────────────────────────────────────────────────────

function NoWorkspace() {
  const { t } = useI18n()
  const { userId, init, create, join, status } = useWorkspaceStore()
  const profileName = useSettingsStore((s) => s.settings?.profileName)?.trim()

  const [mode, setMode] = useState<'none' | 'create' | 'join'>('none')
  const [name, setName] = useState('Моя команда')
  const [displayName, setDisplayName] = useState(profileName || '')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (userId && status === 'idle') init()
  }, [userId, status, init])

  const handleCreate = async () => {
    if (!displayName.trim()) return
    setBusy(true)
    try {
      await create({ name: name.trim() || t('workspace.namePh'), displayName: displayName.trim() })
      toast(t('workspace.createSuccess'), 'success')
    } catch (e) {
      const detail = e instanceof Error ? e.message : (e as any)?.message ?? JSON.stringify(e)
      console.error('[workspace] create failed:', e)
      toast(`Ошибка: ${detail}`)
    } finally {
      setBusy(false)
    }
  }

  const handleJoin = async () => {
    if (!code.trim() || !displayName.trim()) return
    setBusy(true)
    try {
      await join({ code: code.trim(), displayName: displayName.trim() })
      toast(t('workspace.joinSuccess'), 'success')
    } catch (e: unknown) {
      const detail = e instanceof Error ? e.message : (e as any)?.message ?? JSON.stringify(e)
      console.error('[workspace] join failed:', e)
      toast(detail === 'workspace_not_found' ? t('workspace.joinError') : `Ошибка: ${detail}`)
    } finally {
      setBusy(false)
    }
  }

  if (status === 'loading') return <Spinner label={t('workspace.connecting')} />

  return (
    <div className="page flex flex-col items-center justify-center min-h-[70vh]">
      <div className="w-full max-w-md space-y-6 text-center">
        <div className="flex justify-center">
          <span
            className="flex h-16 w-16 animate-pop-in items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-accent/70 text-white"
            style={{ boxShadow: '0 10px 34px rgb(var(--accent-rgb) / 0.4)' }}
          >
            <Globe size={28} />
          </span>
        </div>
        <div className="animate-fade-up" style={{ animationDelay: '70ms' }}>
          <h1 className="text-2xl font-bold text-white">{t('workspace.noWorkspace')}</h1>
          <p className="mt-2 text-sm text-zinc-500">{t('workspace.noWorkspaceHint')}</p>
        </div>

        {mode === 'none' && (
          <div className="flex animate-fade-up flex-col gap-3" style={{ animationDelay: '140ms' }}>
            <button className="btn-accent py-3 text-sm font-semibold transition-transform active:scale-[0.98]" onClick={() => setMode('create')}>
              <Plus size={16} /> {t('workspace.create')}
            </button>
            <button className="btn py-3 text-sm font-medium transition-transform active:scale-[0.98]" onClick={() => setMode('join')}>
              {t('workspace.join')}
            </button>
          </div>
        )}

        {mode === 'create' && (
          <div className="card animate-scale-in space-y-4 p-5 text-left">
            <h2 className="font-semibold text-white">{t('workspace.create')}</h2>
            <div className="space-y-2">
              <label className="text-xs text-zinc-500">{t('workspace.displayName')}</label>
              <input
                autoFocus
                className="input w-full"
                placeholder={t('workspace.displayNamePh')}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs text-zinc-500">{t('workspace.nameLabel')}</label>
              <input
                className="input w-full"
                placeholder={t('workspace.namePh')}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button className="btn flex-1" onClick={() => setMode('none')} disabled={busy}>
                {t('common.cancel')}
              </button>
              <button
                className="btn-accent flex-1"
                onClick={handleCreate}
                disabled={busy || !displayName.trim()}
              >
                {busy ? t('workspace.creating') : t('workspace.create')}
              </button>
            </div>
          </div>
        )}

        {mode === 'join' && (
          <div className="card animate-scale-in space-y-4 p-5 text-left">
            <h2 className="font-semibold text-white">{t('workspace.join')}</h2>
            <div className="space-y-2">
              <label className="text-xs text-zinc-500">{t('workspace.displayName')}</label>
              <input
                autoFocus
                className="input w-full"
                placeholder={t('workspace.displayNamePh')}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs text-zinc-500">{t('workspace.code')}</label>
              <input
                className="input w-full font-mono tracking-widest uppercase"
                placeholder={t('workspace.joinPh')}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                maxLength={9}
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button className="btn flex-1" onClick={() => setMode('none')} disabled={busy}>
                {t('common.cancel')}
              </button>
              <button
                className="btn-accent flex-1"
                onClick={handleJoin}
                disabled={busy || !code.trim() || !displayName.trim()}
              >
                {busy ? t('workspace.joining') : t('workspace.joinBtn')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Project card ─────────────────────────────────────────────────────────────

function ProjectCard({
  project,
  selected,
  index = 0,
  onClick,
  onDelete,
}: {
  project: SharedProject
  selected: boolean
  index?: number
  onClick: () => void
  onDelete: () => void
}) {
  const color = project.color || PROJECT_COLORS[0]
  return (
    <button
      onClick={onClick}
      style={{ animationDelay: `${index * 45}ms` }}
      className={`group relative w-full animate-fade-up overflow-hidden rounded-2xl border text-left transition-all duration-200 hover:-translate-y-1 hover:shadow-xl ${
        selected ? 'border-accent/60' : 'border-edge hover:border-zinc-600'
      }`}
    >
      {/* colour band — soft diagonal wash + a glossy highlight that drifts in on hover */}
      <div className="relative h-16 overflow-hidden" style={{ background: `linear-gradient(135deg, ${color}, ${color}99)` }}>
        <span className="pointer-events-none absolute -inset-x-6 -top-10 h-16 -rotate-12 bg-white/20 opacity-0 blur-md transition-opacity duration-300 group-hover:opacity-100" />
        <span className="flex h-full w-full items-center justify-center">
          <FolderKanban size={22} className="text-white/90 transition-transform duration-300 group-hover:scale-110" />
        </span>
      </div>
      <div className="bg-raised px-4 py-3 transition-colors group-hover:bg-card">
        <div className="truncate text-sm font-semibold text-white">{project.name}</div>
        <div className="mt-0.5 text-xs capitalize text-zinc-500">{project.status}</div>
      </div>
      <span
        onClick={(e) => { e.stopPropagation(); onDelete() }}
        className="absolute right-2 top-2 hidden rounded-md bg-black/30 p-1 text-white/80 hover:text-red-300 group-hover:flex"
      >
        <Trash2 size={13} />
      </span>
    </button>
  )
}

// ─── Full project view (board / list / notes) ───────────────────────────────

function ProjectView({
  project,
  workspaceId,
  userId,
  onBack,
}: {
  project: SharedProject
  workspaceId: string
  userId: string
  onBack: () => void
}) {
  const { t } = useI18n()
  const members = useWorkspaceStore((s) => s.members)
  const logActivity = useWorkspaceStore((s) => s.logActivity)
  const [tasks, setTasks] = useState<SharedTask[]>([])
  const [notes, setNotes] = useState<SharedNote[]>([])
  const [view, setView] = useState<'board' | 'list' | 'notes'>('board')
  const [loading, setLoading] = useState(true)
  const [openTaskId, setOpenTaskId] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropCol, setDropCol] = useState<string | null>(null)
  const [adding, setAdding] = useState<string | null>(null)
  const [addText, setAddText] = useState('')

  useEffect(() => {
    setLoading(true)
    Promise.all([
      supabase.from('shared_tasks').select('*').eq('project_id', project.id).order('created_at'),
      supabase.from('shared_notes').select('*').eq('project_id', project.id).order('updated_at', { ascending: false }),
    ]).then(([{ data: tk }, { data: n }]) => {
      setTasks(tk ?? [])
      setNotes(n ?? [])
      setLoading(false)
    })
  }, [project.id])

  useEffect(() => {
    const ch = supabase
      .channel(`project:${project.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shared_tasks', filter: `project_id=eq.${project.id}` },
        () => supabase.from('shared_tasks').select('*').eq('project_id', project.id).order('created_at')
          .then(({ data }) => { if (data) setTasks(data) }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shared_notes', filter: `project_id=eq.${project.id}` },
        () => supabase.from('shared_notes').select('*').eq('project_id', project.id).order('updated_at', { ascending: false })
          .then(({ data }) => { if (data) setNotes(data) }))
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [project.id])

  const addTask = async (status: string) => {
    const title = addText.trim()
    if (!title) { setAdding(null); return }
    setAddText('')
    const { data } = await supabase.from('shared_tasks').insert({
      workspace_id: workspaceId, project_id: project.id, title, status,
      done: status === 'done', created_by: userId,
    }).select().single()
    if (data) setTasks((p) => [...p, data])
    logActivity('task_create', `добавил задачу «${title}» в «${project.name}»`, project.id)
  }

  const moveTask = async (id: string, status: string) => {
    const task = tasks.find((x) => x.id === id)
    if (!task || task.status === status) return
    setTasks((p) => p.map((x) => x.id === id ? { ...x, status, done: status === 'done' } : x))
    await supabase.from('shared_tasks').update({ status, done: status === 'done', updated_at: new Date().toISOString() }).eq('id', id)
    if (status === 'done') logActivity('task_done', `завершил «${task.title}»`, project.id)
  }

  const deleteTask = async (id: string) => {
    setTasks((p) => p.filter((x) => x.id !== id))
    if (openTaskId === id) setOpenTaskId(null)
    await supabase.from('shared_tasks').delete().eq('id', id)
  }

  const patchTask = async (id: string, patch: Partial<SharedTask>) => {
    setTasks((p) => p.map((x) => x.id === id ? { ...x, ...patch } : x))
    await supabase.from('shared_tasks').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)
  }

  const addNote = async () => {
    const { data } = await supabase.from('shared_notes').insert({
      workspace_id: workspaceId, project_id: project.id, title: 'Без названия', content: '', created_by: userId,
    }).select().single()
    if (data) setNotes((p) => [data, ...p])
  }

  const color = project.color || PROJECT_COLORS[0]
  const openTask = tasks.find((x) => x.id === openTaskId) || null

  const VIEWS = [
    { id: 'board', icon: Columns3, label: t('workspace.viewBoard') },
    { id: 'list', icon: List, label: t('workspace.viewList') },
    { id: 'notes', icon: MessageSquare, label: t('workspace.notes') },
  ] as const

  return (
    <div className="flex h-full min-w-0 flex-1 animate-fade-in flex-col">
      <div className="flex items-center gap-3 border-b border-edge px-6 py-3">
        <button onClick={onBack} className="rounded-lg p-1 text-zinc-500 transition-colors hover:bg-raised hover:text-zinc-200">
          <ArrowLeft size={16} />
        </button>
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white" style={{ backgroundColor: color }}>
          <FolderKanban size={13} />
        </span>
        <span className="flex-1 truncate text-sm font-semibold text-white">{project.name}</span>
        <div className="flex items-center gap-0.5 rounded-lg border border-edge bg-surface p-0.5">
          {VIEWS.map((v) => (
            <button key={v.id} onClick={() => setView(v.id)}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${view === v.id ? 'bg-raised text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'}`}>
              <v.icon size={13} /> {v.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-auto">
          {loading ? <div className="grid h-full place-items-center"><Spinner /></div> : (
            <>
              {view === 'board' && (
                <div className="flex h-full gap-4 p-6">
                  {COLUMNS.map((col) => {
                    const colTasks = tasks.filter((x) => x.status === col.id)
                    return (
                      <div key={col.id}
                        onDragOver={(e) => { e.preventDefault(); setDropCol(col.id) }}
                        onDragLeave={() => setDropCol((c) => c === col.id ? null : c)}
                        onDrop={() => { if (dragId) moveTask(dragId, col.id); setDragId(null); setDropCol(null) }}
                        className={`flex w-72 shrink-0 flex-col rounded-xl border p-2 transition-colors ${dropCol === col.id ? 'border-accent/50 bg-accent-subtle' : 'border-edge bg-surface'}`}>
                        <div className="flex items-center justify-between px-2 py-1.5">
                          <span className="text-xs font-semibold text-zinc-300">{col.label}</span>
                          <span className="text-[11px] text-zinc-600">{colTasks.length}</span>
                        </div>
                        <div className="flex-1 space-y-2 overflow-y-auto px-0.5">
                          {colTasks.map((task) => (
                            <TaskCard key={task.id} task={task}
                              onClick={() => setOpenTaskId(task.id)}
                              onDragStart={() => setDragId(task.id)}
                              onDragEnd={() => { setDragId(null); setDropCol(null) }} />
                          ))}
                        </div>
                        {adding === col.id ? (
                          <input autoFocus className="input mt-2 w-full !py-1.5 text-sm" placeholder={t('workspace.taskTitlePh')}
                            value={addText} onChange={(e) => setAddText(e.target.value)}
                            onBlur={() => addTask(col.id)}
                            onKeyDown={(e) => { if (e.key === 'Enter') addTask(col.id); if (e.key === 'Escape') { setAdding(null); setAddText('') } }} />
                        ) : (
                          <button onClick={() => { setAdding(col.id); setAddText('') }}
                            className="mt-1 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-zinc-500 hover:bg-raised hover:text-zinc-300">
                            <Plus size={13} /> {t('workspace.add')}
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {view === 'list' && (
                <div className="mx-auto max-w-2xl p-6 space-y-1">
                  {tasks.length === 0 && <p className="py-10 text-center text-xs text-zinc-600">{t('workspace.noTasksHint')}</p>}
                  {tasks.map((task) => (
                    <button key={task.id} onClick={() => setOpenTaskId(task.id)}
                      className="group flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-raised">
                      <span onClick={(e) => { e.stopPropagation(); moveTask(task.id, task.done ? 'todo' : 'done') }}
                        className="shrink-0 text-zinc-500 hover:text-accent">
                        {task.done ? <CheckCircle2 size={16} className="text-accent" /> : <Circle size={16} />}
                      </span>
                      <span className={`flex-1 truncate text-sm ${task.done ? 'text-zinc-600 line-through' : 'text-zinc-200'}`}>{task.title}</span>
                      {task.priority && task.priority !== 'none' && <Flag size={12} style={{ color: PRIORITY_META[task.priority].color }} />}
                      {task.assignee_name && <Avatar name={task.assignee_name} size={20} />}
                    </button>
                  ))}
                </div>
              )}

              {view === 'notes' && (
                <div className="mx-auto max-w-2xl p-6 space-y-2">
                  <button className="btn w-full text-sm" onClick={addNote}><Plus size={14} /> {t('workspace.addNote')}</button>
                  {notes.length === 0 && <p className="py-6 text-center text-xs text-zinc-600">{t('workspace.noNotesHint')}</p>}
                  {notes.map((note) => (
                    <div key={note.id} className="rounded-lg border border-edge bg-raised p-3">
                      <div className="text-sm font-medium text-zinc-200">{note.title || t('workspace.untitledNote')}</div>
                      {note.content && <div className="mt-1 line-clamp-3 text-xs text-zinc-500">{note.content}</div>}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {openTask && (
          <TaskDetail task={openTask} members={members} userId={userId} workspaceId={workspaceId}
            onClose={() => setOpenTaskId(null)} onPatch={patchTask} onDelete={deleteTask} />
        )}
      </div>
    </div>
  )
}

// ─── Kanban task card ────────────────────────────────────────────────────────

function TaskCard({ task, onClick, onDragStart, onDragEnd }: {
  task: SharedTask; onClick: () => void; onDragStart: () => void; onDragEnd: () => void
}) {
  const due = task.due_date ? dueLabel(task.due_date) : null
  const prio = task.priority && task.priority !== 'none' ? PRIORITY_META[task.priority] : null
  return (
    <div draggable onDragStart={onDragStart} onDragEnd={onDragEnd} onClick={onClick}
      className="cursor-pointer animate-fade-up rounded-lg border border-edge bg-card p-2.5 shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:border-zinc-600 hover:shadow-md active:scale-[0.98]">
      <div className={`text-sm ${task.done ? 'text-zinc-600 line-through' : 'text-zinc-200'}`}>{task.title}</div>
      {(prio || due || task.assignee_name) && (
        <div className="mt-2 flex items-center gap-2">
          {prio && <Flag size={11} style={{ color: prio.color }} />}
          {due && <span className={`flex items-center gap-1 text-[11px] ${due.overdue ? 'text-red-400' : 'text-zinc-500'}`}><Calendar size={11} /> {due.text}</span>}
          <span className="flex-1" />
          {task.assignee_name && <Avatar name={task.assignee_name} size={20} />}
        </div>
      )}
    </div>
  )
}

// ─── Task detail drawer (assignee, priority, due, comments) ──────────────────

function TaskDetail({ task, members, userId, workspaceId, onClose, onPatch, onDelete }: {
  task: SharedTask
  members: WorkspaceMember[]
  userId: string
  workspaceId: string
  onClose: () => void
  onPatch: (id: string, patch: Partial<SharedTask>) => void
  onDelete: (id: string) => void
}) {
  const { t } = useI18n()
  const myName = useWorkspaceStore((s) => s.myName)
  const logActivity = useWorkspaceStore((s) => s.logActivity)
  const [comments, setComments] = useState<SharedComment[]>([])
  const [body, setBody] = useState('')
  const [showAssignee, setShowAssignee] = useState(false)

  useEffect(() => {
    supabase.from('shared_comments').select('*').eq('task_id', task.id).order('created_at')
      .then(({ data }) => setComments(data ?? []))
    const ch = supabase.channel(`task:${task.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shared_comments', filter: `task_id=eq.${task.id}` },
        () => supabase.from('shared_comments').select('*').eq('task_id', task.id).order('created_at')
          .then(({ data }) => setComments(data ?? [])))
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [task.id])

  const cyclePriority = () => {
    const cur = (task.priority || 'none') as typeof PRIORITIES[number]
    const next = PRIORITIES[(PRIORITIES.indexOf(cur) + 1) % PRIORITIES.length]
    onPatch(task.id, { priority: next })
  }

  const setAssignee = (m: WorkspaceMember | null) => {
    onPatch(task.id, { assignee_id: m?.user_id ?? null, assignee_name: m?.display_name ?? null })
    setShowAssignee(false)
    if (m) logActivity('task_assign', `назначил «${task.title}» на ${m.display_name}`, task.project_id)
  }

  const addComment = async () => {
    const text = body.trim()
    if (!text) return
    setBody('')
    await supabase.from('shared_comments').insert({
      workspace_id: workspaceId, task_id: task.id, author_id: userId, author_name: myName(), body: text,
    })
  }

  const prio = PRIORITY_META[task.priority || 'none']
  return (
    <div className="flex w-80 shrink-0 animate-slide-in-right flex-col border-l border-edge bg-card">
      <div className="flex items-center justify-between border-b border-edge px-4 py-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{t('workspace.task')}</span>
        <div className="flex items-center gap-1">
          <button onClick={() => onDelete(task.id)} className="rounded p-1 text-zinc-600 hover:text-red-400"><Trash2 size={14} /></button>
          <button onClick={onClose} className="rounded p-1 text-zinc-500 hover:text-zinc-200"><X size={16} /></button>
        </div>
      </div>

      <div className="border-b border-edge p-4 space-y-3">
        <input className="w-full bg-transparent text-sm font-semibold text-white outline-none"
          defaultValue={task.title} key={task.id}
          onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== task.title) onPatch(task.id, { title: v }) }} />

        <div className="relative flex items-center gap-2 text-xs">
          <span className="w-20 text-zinc-500">{t('workspace.assignee')}</span>
          <button onClick={() => setShowAssignee((v) => !v)} className="flex items-center gap-1.5 rounded-md px-2 py-1 hover:bg-raised">
            {task.assignee_name
              ? <><Avatar name={task.assignee_name} size={18} /> <span className="text-zinc-300">{task.assignee_name}</span></>
              : <span className="text-zinc-500">{t('workspace.unassigned')}</span>}
          </button>
          {showAssignee && (
            <div className="absolute left-20 top-7 z-10 w-44 rounded-lg border border-edge bg-card p-1 shadow-lg">
              <button onClick={() => setAssignee(null)} className="block w-full rounded px-2 py-1.5 text-left text-xs text-zinc-500 hover:bg-raised">{t('workspace.nobody')}</button>
              {members.map((m) => (
                <button key={m.user_id} onClick={() => setAssignee(m)} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-zinc-300 hover:bg-raised">
                  <Avatar name={m.display_name} size={18} /> {m.display_name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="w-20 text-zinc-500">{t('workspace.priority')}</span>
          <button onClick={cyclePriority} className="flex items-center gap-1.5 rounded-md px-2 py-1 hover:bg-raised" style={{ color: prio.color }}>
            <Flag size={13} /> <span>{prio.label}</span>
          </button>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="w-20 text-zinc-500">{t('workspace.due')}</span>
          <input type="date" className="input !py-1 text-xs" value={task.due_date?.slice(0, 10) ?? ''}
            onChange={(e) => onPatch(task.id, { due_date: e.target.value || null })} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          <MessageSquare size={12} /> {t('workspace.discussion')}
        </div>
        {comments.length === 0 && <p className="text-xs text-zinc-600">{t('workspace.noComments')}</p>}
        {comments.map((c) => (
          <div key={c.id} className="flex gap-2">
            <Avatar name={c.author_name || '?'} size={22} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="text-xs font-medium text-zinc-300">{c.author_name}</span>
                <span className="text-[10px] text-zinc-600">{timeAgo(c.created_at)}</span>
              </div>
              <div className="whitespace-pre-wrap break-words text-sm text-zinc-300">{c.body}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-edge p-3">
        <div className="flex gap-2">
          <input className="input flex-1 !py-1.5 text-sm" placeholder={t('workspace.commentPh')} value={body}
            onChange={(e) => setBody(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addComment()} />
          <button className="btn-accent !px-3" onClick={addComment}><Send size={14} /></button>
        </div>
      </div>
    </div>
  )
}

// ─── Activity feed (workspace sidebar) ───────────────────────────────────────

function ActivityFeed() {
  const { t } = useI18n()
  const activity = useWorkspaceStore((s) => s.activity)
  if (activity.length === 0) {
    return <p className="px-2 text-[11px] text-zinc-600">{t('workspace.activityEmpty')}</p>
  }
  return (
    <div className="space-y-2.5">
      {activity.slice(0, 20).map((a, i) => (
        <div key={a.id} className="flex animate-fade-up gap-2" style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}>
          <Avatar name={a.actor_name || '?'} size={18} />
          <div className="min-w-0 flex-1 text-[12px] leading-snug text-zinc-400">
            <span className="font-medium text-zinc-300">{a.actor_name}</span> {a.summary}
            <div className="text-[10px] text-zinc-600">{timeAgo(a.created_at)}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Sidebar stat tile ───────────────────────────────────────────────────────

function WsStat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-edge bg-raised/40 px-2 py-2 text-center transition-colors hover:bg-raised">
      <div className={`text-lg font-bold leading-tight tabular-nums ${accent ? 'text-green-400' : 'text-white'}`}>{value}</div>
      <div className="mt-0.5 truncate text-[10px] uppercase tracking-wide text-zinc-600">{label}</div>
    </div>
  )
}

// ─── Main Workspace page ──────────────────────────────────────────────────────

export default function WorkspacePage() {
  const { t } = useI18n()
  const {
    userId, workspace, members, projects, status,
    init, leave, deleteWorkspace, removeMember, renameWorkspace,
    createProject, deleteProject, updateDisplayName, ping,
  } = useWorkspaceStore()

  const [section, setSection] = useState<'hubs' | 'canvas' | 'files'>('hubs')
  const [selectedProject, setSelectedProject] = useState<SharedProject | null>(null)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [confirmDeleteWs, setConfirmDeleteWs] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState<WorkspaceMember | null>(null)
  const [confirmDeleteProject, setConfirmDeleteProject] = useState<string | null>(null)
  const [newProjectName, setNewProjectName] = useState('')
  const [showNewProject, setShowNewProject] = useState(false)
  const [codeCopied, setCodeCopied] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState('')
  const [wsMenu, setWsMenu] = useState(false)
  const [editingWsName, setEditingWsName] = useState(false)
  const [wsNameValue, setWsNameValue] = useState('')
  const newProjectRef = useRef<HTMLInputElement>(null)

  const owner = !!workspace && (!workspace.created_by || workspace.created_by === userId)
  const onlineCount = members.filter((m) => isOnline(m.last_seen)).length

  // Init on mount + ping every 3 min to show presence
  useEffect(() => {
    init()
  }, [init])

  useEffect(() => {
    if (!workspace) return
    const id = setInterval(() => ping(), 3 * 60 * 1000)
    return () => clearInterval(id)
  }, [workspace, ping])

  // Keep selected project in sync with real-time updates
  useEffect(() => {
    if (!selectedProject) return
    const updated = projects.find((p) => p.id === selectedProject.id)
    if (updated) setSelectedProject(updated)
    else setSelectedProject(null)
  }, [projects]) // eslint-disable-line react-hooks/exhaustive-deps

  const copyCode = useCallback(() => {
    if (!workspace) return
    navigator.clipboard.writeText(workspace.join_code)
    setCodeCopied(true)
    setTimeout(() => setCodeCopied(false), 2000)
  }, [workspace])

  const handleCreateProject = async () => {
    const name = newProjectName.trim()
    if (!name) return
    setNewProjectName('')
    setShowNewProject(false)
    try {
      const p = await createProject(name)
      if (p) setSelectedProject(p)
    } catch {
      toast(t('workspace.joinError'))
    }
  }

  const handleDeleteProject = async (id: string) => {
    if (selectedProject?.id === id) setSelectedProject(null)
    await deleteProject(id)
    setConfirmDeleteProject(null)
  }

  const handleLeave = async () => {
    setSelectedProject(null)
    await leave()
    setConfirmLeave(false)
  }

  const handleDeleteWorkspace = async () => {
    setSelectedProject(null)
    try {
      await deleteWorkspace()
      toast(t('workspace.deleted'), 'success')
    } catch {
      toast(t('workspace.createError'))
    }
    setConfirmDeleteWs(false)
  }

  const handleRemoveMember = async (m: WorkspaceMember) => {
    try {
      await removeMember(m.user_id)
      toast(t('workspace.memberRemoved'), 'success')
    } catch {
      /* not owner / network — silent */
    }
    setConfirmRemove(null)
  }

  const saveWsName = async () => {
    const v = wsNameValue.trim()
    if (v) await renameWorkspace(v)
    setEditingWsName(false)
  }

  const saveName = async () => {
    const v = nameValue.trim()
    if (v) await updateDisplayName(v)
    setEditingName(false)
  }

  const myMember = members.find((m) => m.user_id === userId)

  if (status === 'loading' || status === 'idle') return <Spinner label={t('workspace.connecting')} />
  if (!workspace) return <NoWorkspace />

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Left sidebar ──────────────────────────────────────────────────── */}
      <div className="flex w-72 shrink-0 flex-col border-r border-edge bg-sidebar">
        {/* Workspace header */}
        <div className="relative border-b border-edge px-4 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-accent/70 text-white shadow-[0_4px_14px_rgb(var(--accent-rgb)/0.35)]">
              <Users size={16} />
            </span>
            <div className="min-w-0 flex-1">
              {editingWsName ? (
                <input
                  autoFocus
                  className="input w-full !py-1 text-sm font-semibold"
                  value={wsNameValue}
                  placeholder={t('workspace.renamePh')}
                  onChange={(e) => setWsNameValue(e.target.value)}
                  onBlur={saveWsName}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveWsName(); if (e.key === 'Escape') setEditingWsName(false) }}
                />
              ) : (
                <div className="truncate text-sm font-semibold text-white">{workspace.name}</div>
              )}
              <div className="mt-0.5 flex items-center gap-1 text-[11px] text-green-400">
                <span className="presence-online h-1.5 w-1.5 rounded-full bg-green-500" /> {t('workspace.connected')}
              </div>
            </div>
            <button
              onClick={() => setWsMenu((v) => !v)}
              title={t('workspace.settings')}
              className="shrink-0 rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-raised hover:text-zinc-200"
            >
              <MoreVertical size={16} />
            </button>
          </div>

          {wsMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setWsMenu(false)} />
              <div className="absolute right-3 top-[60px] z-20 w-52 origin-top-right animate-scale-in rounded-xl border border-edge bg-card p-1 text-sm shadow-[var(--float-shadow)]">
                {owner && (
                  <button
                    onClick={() => { setWsNameValue(workspace.name); setEditingWsName(true); setWsMenu(false) }}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-zinc-300 transition-colors hover:bg-raised hover:text-white"
                  >
                    <Pencil size={14} /> {t('workspace.rename')}
                  </button>
                )}
                <button
                  onClick={() => { setWsMenu(false); setConfirmLeave(true) }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-zinc-300 transition-colors hover:bg-raised hover:text-white"
                >
                  <LogOut size={14} /> {t('workspace.leave')}
                </button>
                {owner && (
                  <>
                    <div className="my-1 h-px bg-edge" />
                    <button
                      onClick={() => { setWsMenu(false); setConfirmDeleteWs(true) }}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-red-400 transition-colors hover:bg-highlight"
                    >
                      <Trash2 size={14} /> {t('workspace.delete')}
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>

        {/* Stats strip — gives the sidebar weight + a glanceable team pulse */}
        <div className="grid grid-cols-3 gap-2 border-b border-edge px-4 py-3">
          <WsStat label={t('workspace.statProjects')} value={projects.length} />
          <WsStat label={t('workspace.members')} value={members.length} />
          <WsStat label={t('workspace.statOnline')} value={onlineCount} accent />
        </div>

        {/* Invite code */}
        <div className="border-b border-edge px-4 py-3">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-600">{t('workspace.code')}</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-lg border border-edge bg-raised px-3 py-1.5 font-mono text-sm font-bold tracking-widest text-white">
              {workspace.join_code}
            </code>
            <button
              onClick={copyCode}
              title={t('workspace.codeCopied')}
              className="rounded-lg border border-edge bg-raised p-1.5 text-zinc-400 hover:text-white transition-colors"
            >
              {codeCopied ? <Check size={14} className="animate-check-pop text-green-400" /> : <Copy size={14} />}
            </button>
          </div>
          <p className="mt-1.5 text-[10px] text-zinc-600">{t('workspace.codeHint')}</p>
        </div>

        {/* Members + activity */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-600">
            {t('workspace.members')} · {members.length}
          </p>
          <div className="space-y-1">
            {members.map((m, i) => {
              const online = isOnline(m.last_seen)
              const isMe = m.user_id === userId
              const isCreator = !!workspace.created_by && m.user_id === workspace.created_by
              return (
                <div
                  key={m.user_id}
                  className="group flex animate-fade-up items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-highlight"
                  style={{ animationDelay: `${i * 35}ms` }}
                >
                  <Avatar name={m.display_name} size={22} />
                  <span className="flex min-w-0 flex-1 items-center gap-1 truncate text-sm text-zinc-300">
                    <span className="truncate">{m.display_name}</span>
                    {isMe && <span className="text-xs text-zinc-600">{t('workspace.you')}</span>}
                    {isCreator && (
                      <span title={t('workspace.owner')} className="inline-flex shrink-0">
                        <Crown size={11} className="text-amber-400" />
                      </span>
                    )}
                  </span>
                  {owner && !isMe && !isCreator && (
                    <button
                      onClick={() => setConfirmRemove(m)}
                      title={t('workspace.removeMember')}
                      className="hidden shrink-0 rounded p-0.5 text-zinc-500 transition-colors hover:text-red-400 group-hover:block"
                    >
                      <UserMinus size={13} />
                    </button>
                  )}
                  <span className={`h-2 w-2 shrink-0 rounded-full ${online ? 'bg-green-500 presence-online' : 'bg-zinc-700'}`}
                    title={online ? t('workspace.online') : timeAgo(m.last_seen)} />
                </div>
              )
            })}
          </div>

          <div className="mt-5 mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-600">
            <Activity size={11} /> {t('workspace.activity')}
          </div>
          <ActivityFeed />
        </div>

        {/* My name + leave */}
        <div className="border-t border-edge px-4 py-3 space-y-2">
          {editingName ? (
            <div className="flex gap-1.5">
              <input
                autoFocus
                className="input flex-1 !py-1 text-xs"
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setEditingName(false) }}
              />
              <button className="btn !px-2 !py-1 text-xs" onClick={saveName}><Check size={12} /></button>
            </div>
          ) : (
            <button
              className="w-full text-left text-xs text-zinc-600 hover:text-zinc-300 transition-colors"
              onClick={() => { setEditingName(true); setNameValue(myMember?.display_name ?? '') }}
            >
              <Users size={11} className="mr-1 inline" />
              {myMember?.display_name ?? '…'}
            </button>
          )}
          <button
            onClick={() => setConfirmLeave(true)}
            className="flex w-full items-center gap-1.5 text-xs text-zinc-600 hover:text-red-400 transition-colors"
          >
            <LogOut size={12} /> {t('workspace.leave')}
          </button>
        </div>
      </div>

      {/* ── Content area ──────────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* section switcher — hidden while a hub is open (ProjectView owns the header) */}
        {!selectedProject && (
          <div className="border-b border-edge px-6">
            <Tabs
              tabs={[
                { id: 'hubs', label: t('workspace.secHubs') },
                { id: 'canvas', label: t('workspace.secCanvas') },
                { id: 'files', label: t('workspace.secFiles') },
              ]}
              active={section}
              onChange={(id) => setSection(id as 'hubs' | 'canvas' | 'files')}
            />
          </div>
        )}

        <div className="flex min-h-0 flex-1">
          {section === 'hubs' && (selectedProject && userId ? (
            <ProjectView
              project={selectedProject}
              workspaceId={workspace.id}
              userId={userId}
              onBack={() => setSelectedProject(null)}
            />
          ) : (
            <div className="flex min-w-0 flex-1 animate-fade-in flex-col overflow-hidden">
              <div className="flex items-center justify-between border-b border-edge px-6 py-3">
                <h2 className="text-sm font-semibold text-white">{t('workspace.sharedProjects')}</h2>
                <button
                  onClick={() => { setShowNewProject(true); setTimeout(() => newProjectRef.current?.focus(), 50) }}
                  className="btn-accent !px-3 !py-1.5 text-xs"
                >
                  <Plus size={13} /> {t('workspace.newProject')}
                </button>
              </div>

              {showNewProject && (
                <div className="flex animate-slide-up items-center gap-2 border-b border-edge bg-raised px-6 py-2">
                  <input
                    ref={newProjectRef}
                    className="input flex-1 !py-1.5 text-sm"
                    placeholder={t('workspace.projectNamePh')}
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCreateProject()
                      if (e.key === 'Escape') { setShowNewProject(false); setNewProjectName('') }
                    }}
                  />
                  <button className="btn-accent !px-3 !py-1.5 text-xs" onClick={handleCreateProject}>
                    {t('common.add')}
                  </button>
                  <button className="btn !px-2 !py-1.5" onClick={() => { setShowNewProject(false); setNewProjectName('') }}>
                    <X size={14} />
                  </button>
                </div>
              )}

              <div className="flex-1 overflow-y-auto p-6">
                {projects.length === 0 ? (
                  <EmptyState
                    icon={FolderKanban}
                    title={t('workspace.noProjects')}
                    subtitle={t('workspace.noProjectsHint')}
                    action={
                      <button
                        onClick={() => { setShowNewProject(true); setTimeout(() => newProjectRef.current?.focus(), 50) }}
                        className="btn-accent !px-4 !py-2 text-sm transition-transform active:scale-95"
                      >
                        <Plus size={14} /> {t('workspace.newProject')}
                      </button>
                    }
                  />
                ) : (
                  <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
                    {projects.map((p, i) => (
                      <ProjectCard
                        key={p.id}
                        project={p}
                        selected={false}
                        index={i}
                        onClick={() => setSelectedProject(p)}
                        onDelete={() => setConfirmDeleteProject(p.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          {section === 'canvas' && userId && <CanvasSection workspaceId={workspace.id} userId={userId} />}
          {section === 'files' && userId && <FilesSection workspaceId={workspace.id} userId={userId} />}
        </div>
      </div>

      {/* ── Dialogs ────────────────────────────────────────────────────────── */}
      {confirmLeave && (
        <ConfirmDialog
          title={t('workspace.leave')}
          message={t('workspace.leaveConfirm')}
          confirmLabel={t('workspace.leave')}
          danger
          onConfirm={() => { handleLeave() }}
          onCancel={() => setConfirmLeave(false)}
        />
      )}
      {confirmDeleteProject && (
        <ConfirmDialog
          title={t('workspace.deleteProject')}
          message={t('workspace.deleteProjectConfirm')}
          confirmLabel={t('common.delete')}
          danger
          onConfirm={() => handleDeleteProject(confirmDeleteProject)}
          onCancel={() => setConfirmDeleteProject(null)}
        />
      )}
      {confirmDeleteWs && (
        <ConfirmDialog
          title={t('workspace.delete')}
          message={t('workspace.deleteConfirm')}
          confirmLabel={t('workspace.delete')}
          danger
          onConfirm={handleDeleteWorkspace}
          onCancel={() => setConfirmDeleteWs(false)}
        />
      )}
      {confirmRemove && (
        <ConfirmDialog
          title={t('workspace.removeMember')}
          message={t('workspace.removeMemberConfirm', { name: confirmRemove.display_name })}
          confirmLabel={t('common.delete')}
          danger
          onConfirm={() => handleRemoveMember(confirmRemove)}
          onCancel={() => setConfirmRemove(null)}
        />
      )}
    </div>
  )
}
