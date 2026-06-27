import { useState } from 'react'
import { CheckCircle2, Circle, ExternalLink, FileText, FolderOpen, History, Link2, Plus } from 'lucide-react'
import ProgressRing from '../../components/ui/ProgressRing'
import { type Note, type Project, type ProjectAsset, type ProjectSession, type Task } from '../../types/models'
import type { HubTabId } from '../../lib/hubConfig'
import { useI18n } from '../../i18n'

type TFn = ReturnType<typeof useI18n>['t']

const baseName = (p: string) => p.split(/[\\/]/).pop() || p

export function Overview({
  project,
  accent,
  assets,
  tasks,
  notes,
  sessions,
  t,
  onQuickTask,
  onNewNote,
  onOpenNote,
  onOpenAsset,
  onToggleTask,
  onOpenTask,
  onGoTab,
  onAddLink,
}: {
  project: Project
  accent: string
  assets: ProjectAsset[]
  tasks: Task[]
  notes: Note[]
  sessions: ProjectSession[]
  t: TFn
  onQuickTask: (title: string) => void
  onNewNote: () => void
  onOpenNote: (n: Note) => void
  onOpenAsset: (a: ProjectAsset) => void
  onToggleTask: (task: Task) => void
  onOpenTask: (task: Task) => void
  onGoTab: (tab: HubTabId) => void
  onAddLink: () => void
}) {
  const [quick, setQuick] = useState('')

  const total = tasks.length
  const done = tasks.filter((x) => x.done).length
  const pct = total > 0 ? done / total : 0
  const openTasks = tasks.filter((x) => !x.done).slice(0, 8)
  const refs = assets
    .filter((a) => a.kind === 'url' || a.kind === 'folder')
    .sort((a, b) => (a.kind === 'url' ? 0 : 1) - (b.kind === 'url' ? 0 : 1))
    .slice(0, 8)
  const recentNotes = notes.slice(0, 4)


  return (
    <div className="space-y-7">
      {/* ── Stats bar — uniform 4-col grid ───────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat value={String(total)} sub={total - done > 0 ? `${total - done} ${t('hub.statOpen')}` : t('hub.tasksShort')} />
        <Stat value={String(assets.length)} sub={t('hub.statFiles')} />
        <Stat value={String(notes.length)} sub={t('hub.notesShort')} />
        <div className="flex items-center gap-3 rounded-xl border border-edge bg-card px-4 py-3">
          <ProgressRing value={pct} size={38} stroke={4} color={accent}>
            <span className="text-[9px] font-bold leading-none" style={{ color: accent }}>
              {Math.round(pct * 100)}%
            </span>
          </ProgressRing>
          <div className="min-w-0">
            <div className="text-base font-bold leading-tight text-zinc-100">{done}/{total || '—'}</div>
            <div className="text-[11px] text-zinc-500">{t('hub.tasksDone')}</div>
          </div>
        </div>
      </div>

      {/* ── Description ───────────────────────────────────────── */}
      {project.description && (
        <p className="max-w-2xl whitespace-pre-wrap text-sm leading-relaxed text-zinc-400">{project.description}</p>
      )}

      {/* ── Quick-add ─────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <input
          className="input flex-1 !py-2 text-sm"
          placeholder={t('hub.quickCapturePh')}
          value={quick}
          onChange={(e) => setQuick(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && quick.trim()) {
              onQuickTask(quick)
              setQuick('')
            }
          }}
        />
        <button
          onClick={onNewNote}
          className="flex items-center gap-1.5 rounded-lg border border-edge bg-card px-3 py-2 text-sm text-zinc-400 transition-colors hover:text-zinc-100"
        >
          <Plus size={14} /> {t('hub.addNote')}
        </button>
      </div>

      {/* ── Main grid ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Open tasks */}
        <SectionCard
          title={t('hub.openTasks')}
          count={tasks.filter((x) => !x.done).length}
          onSeeAll={() => onGoTab('tasks')}
          t={t}
        >
          {openTasks.length ? (
            <div className="divide-y divide-edge">
              {openTasks.map((task) => (
                <div key={task.id} className="flex items-start gap-2.5 py-2.5 px-3">
                  <button
                    onClick={() => onToggleTask(task)}
                    className="mt-0.5 shrink-0 text-zinc-500 transition-colors hover:text-zinc-200"
                  >
                    {task.done ? <CheckCircle2 size={16} style={{ color: accent }} /> : <Circle size={16} />}
                  </button>
                  <button
                    onClick={() => onOpenTask(task)}
                    className="min-w-0 flex-1 text-left text-sm text-zinc-200 hover:text-white"
                  >
                    <span className="line-clamp-1">{task.title}</span>
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <EmptyHint>{t('hub.allDone')} 🎉</EmptyHint>
          )}
          {tasks.filter((x) => !x.done).length > 8 && (
            <button onClick={() => onGoTab('tasks')} className="px-3 py-2 text-[11px] text-zinc-500 hover:text-zinc-200">
              {t('hub.seeAll')} →
            </button>
          )}
        </SectionCard>

        {/* References */}
        <SectionCard
          title={t('hub.widgetReferences')}
          count={refs.length}
          onSeeAll={() => onGoTab('files')}
          t={t}
        >
          {refs.length ? (
            <div className="divide-y divide-edge">
              {refs.map((a) => (
                <button
                  key={a.id}
                  onClick={() => onOpenAsset(a)}
                  className="group flex w-full items-center gap-2.5 px-3 py-2.5 text-left"
                >
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-raised text-zinc-400 group-hover:text-zinc-200">
                    {a.kind === 'folder' ? <FolderOpen size={14} /> : <Link2 size={14} />}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-zinc-300 group-hover:text-white">
                    {a.label || a.url}
                  </span>
                  {a.kind === 'url' && <ExternalLink size={13} className="shrink-0 text-zinc-600 group-hover:text-zinc-400" />}
                </button>
              ))}
            </div>
          ) : (
            <button
              onClick={onAddLink}
              className="flex w-full items-center gap-2 px-3 py-5 text-sm text-zinc-500 hover:text-zinc-300"
            >
              <Link2 size={15} className="shrink-0" /> {t('hub.noReferences')}
            </button>
          )}
        </SectionCard>
      </div>

      {/* ── Recent notes ──────────────────────────────────────── */}
      {recentNotes.length > 0 && (
        <SectionCard
          title={t('hub.tabNotes')}
          count={notes.length}
          onSeeAll={() => onGoTab('notes')}
          t={t}
        >
          <div className="grid grid-cols-1 gap-2 p-3 sm:grid-cols-2">
            {recentNotes.map((n) => (
              <button
                key={n.id}
                onClick={() => onOpenNote(n)}
                className="group flex items-start gap-2.5 rounded-lg p-2.5 text-left transition-colors hover:bg-raised"
              >
                <FileText size={15} className="mt-0.5 shrink-0 text-zinc-500 group-hover:text-zinc-300" />
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-zinc-200 group-hover:text-white">
                    {n.title.trim() || n.content.trim().split('\n')[0].slice(0, 50) || '—'}
                  </div>
                  {n.content && (
                    <div className="line-clamp-1 text-[11px] text-zinc-600">
                      {n.content.replace(/^#+ /, '').slice(0, 80)}
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        </SectionCard>
      )}

      {/* ── Recent sessions ───────────────────────────────────── */}
      {sessions.length > 0 && (
        <SectionCard
          title={t('hub.recentSessions')}
          count={sessions.length}
          onSeeAll={() => onGoTab('sessions')}
          t={t}
        >
          <div className="divide-y divide-edge">
            {sessions.slice(0, 3).map((s) => (
              <div key={s.id} className="flex items-center gap-2.5 px-3 py-2.5">
                <History size={14} className="shrink-0 text-zinc-500" />
                <span className="min-w-0 flex-1 truncate text-sm text-zinc-300">
                  {s.title?.trim() || s.created_at.slice(0, 10)}
                </span>
                <span className="shrink-0 text-[11px] text-zinc-500">
                  {Math.round((s.duration_seconds || 0) / 60)}{t('hub.mShort')}
                </span>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {total === 0 && assets.length === 0 && notes.length === 0 && (
        <p className="py-12 text-center text-sm text-zinc-600">{t('hub.emptyTab')}</p>
      )}
    </div>
  )
}

function Stat({ value, sub }: { value: string; sub: string }) {
  return (
    <div className="flex flex-col rounded-xl border border-edge bg-card px-4 py-2.5">
      <div className="text-lg font-bold leading-none text-zinc-100">{value}</div>
      <div className="mt-1 text-[11px] text-zinc-500">{sub}</div>
    </div>
  )
}

function SectionCard({
  title,
  count,
  onSeeAll,
  t,
  children,
}: {
  title: string
  count: number
  onSeeAll: () => void
  t: TFn
  children: React.ReactNode
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-edge bg-card">
      <div className="flex items-center gap-2 border-b border-edge px-3 py-2.5">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{title}</h2>
        {count > 0 && <span className="text-[11px] text-zinc-600">{count}</span>}
        <button onClick={onSeeAll} className="ml-auto text-[11px] text-zinc-500 hover:text-zinc-200">
          {t('hub.seeAll')}
        </button>
      </div>
      {children}
    </section>
  )
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return <p className="px-3 py-6 text-center text-sm text-zinc-600">{children}</p>
}
