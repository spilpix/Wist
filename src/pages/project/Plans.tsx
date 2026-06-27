import { CheckCircle2, Circle, Clock, ExternalLink, Plus, ScrollText } from 'lucide-react'
import type { Note, Task, TaskStatus } from '../../types/models'
import { useI18n } from '../../i18n'

type TFn = ReturnType<typeof useI18n>['t']

// Hub "Plans" tab — two sections:
// 1. Roadmap: tasks visualised by status (todo / doing / done) in 3 columns
// 2. Plan documents: notes in this project tagged as plans (props.category === 'plan')

const STATUS_META: Record<TaskStatus, { label: string; labelRu: string; color: string; Icon: typeof Circle }> = {
  todo: { label: 'To do', labelRu: 'Надо сделать', color: 'var(--c-gray-text)', Icon: Circle },
  doing: { label: 'In progress', labelRu: 'В работе', color: 'var(--c-orange-text)', Icon: Clock },
  done: { label: 'Done', labelRu: 'Готово', color: 'var(--c-green-text)', Icon: CheckCircle2 },
}

function RoadmapColumn({ status, tasks, t }: { status: TaskStatus; tasks: Task[]; t: TFn }) {
  const meta = STATUS_META[status]
  const Icon = meta.Icon
  const shown = tasks.slice(0, 8)
  const extra = tasks.length - shown.length

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="mb-3 flex items-center gap-2">
        <Icon size={14} style={{ color: meta.color }} />
        <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: meta.color }}>
          {meta.labelRu}
        </span>
        {tasks.length > 0 && (
          <span className="ml-auto text-[11px] text-zinc-600">{tasks.length}</span>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        {shown.map((task) => (
          <div
            key={task.id}
            className="flex items-start gap-2 rounded-xl border border-edge bg-card px-3 py-2.5"
          >
            <Icon size={13} className="mt-0.5 shrink-0" style={{ color: meta.color }} />
            <span className={`min-w-0 flex-1 text-[13px] leading-snug ${task.done ? 'text-zinc-500 line-through' : 'text-zinc-200'}`}>
              {task.title}
            </span>
          </div>
        ))}
        {extra > 0 && (
          <div className="px-1 text-[11px] text-zinc-600">+{extra} {t('hub.seeAll').toLowerCase()}</div>
        )}
        {shown.length === 0 && (
          <div className="rounded-xl border border-dashed border-edge px-3 py-4 text-center text-xs text-zinc-600">
            —
          </div>
        )}
      </div>
    </div>
  )
}

// relative date label (same logic as Hero)
function relDate(iso: string): string {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const days = Math.round((today.getTime() - new Date(`${iso}T00:00:00`).getTime()) / 86_400_000)
  if (days <= 0) return 'сегодня'
  if (days === 1) return 'вчера'
  return iso.slice(0, 10).split('-').reverse().join('.')
}

export function Plans({
  tasks,
  notes,
  t,
  onNewPlan,
  onOpenNote,
}: {
  tasks: Task[]
  notes: Note[]
  t: TFn
  onNewPlan: () => void
  onOpenNote: (n: Note) => void
}) {
  const plans = notes.filter((n) => {
    try { return (n.props as any)?.category === 'plan' } catch { return false }
  })

  const byStatus = (s: TaskStatus) => tasks.filter((tk) => !tk.deleted_at && tk.status === s)
  const hasTasks = tasks.filter((tk) => !tk.deleted_at).length > 0

  return (
    <div className="space-y-10">
      {/* ── Roadmap ── */}
      <section>
        <div className="mb-4 flex items-center gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">{t('hub.plansRoadmap')}</h2>
        </div>
        {hasTasks ? (
          <div className="flex gap-4">
            {(['todo', 'doing', 'done'] as TaskStatus[]).map((s) => (
              <RoadmapColumn key={s} status={s} tasks={byStatus(s)} t={t} />
            ))}
          </div>
        ) : (
          <p className="text-xs text-zinc-600">{t('hub.plansRoadmapEmpty')}</p>
        )}
      </section>

      {/* ── Plan documents ── */}
      <section>
        <div className="mb-4 flex items-center gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">{t('hub.tabPlans')}</h2>
          <button
            onClick={onNewPlan}
            className="ml-auto flex items-center gap-1.5 rounded-lg border border-dashed border-edge px-2.5 py-1.5 text-xs text-zinc-500 transition-colors hover:border-accent hover:text-zinc-200"
          >
            <Plus size={13} /> {t('hub.plansNew')}
          </button>
        </div>

        {plans.length === 0 ? (
          <button
            onClick={onNewPlan}
            className="flex w-full flex-col items-center gap-3 rounded-2xl border border-dashed border-edge py-10 text-center transition-colors hover:border-zinc-600"
          >
            <ScrollText size={28} className="text-zinc-700" />
            <div>
              <div className="text-sm font-medium text-zinc-400">{t('hub.plansEmpty')}</div>
              <div className="mt-1 text-xs text-zinc-600">{t('hub.plansNew')}</div>
            </div>
          </button>
        ) : (
          <div className="space-y-2">
            {plans.map((n) => {
              const title = n.title.trim() || n.content.trim().split('\n')[0].slice(0, 60) || '—'
              const preview = n.content.trim().split('\n').find((l) => l.trim() && !l.startsWith('#'))?.slice(0, 100)
              return (
                <button
                  key={n.id}
                  onClick={() => onOpenNote(n)}
                  className="group flex w-full items-center gap-4 rounded-xl border border-edge bg-card px-4 py-3 text-left transition-colors hover:border-zinc-600"
                >
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-raised">
                    <ScrollText size={16} className="text-zinc-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-zinc-200 group-hover:text-white">{title}</div>
                    {preview && (
                      <div className="mt-0.5 truncate text-xs text-zinc-500">{preview}</div>
                    )}
                  </div>
                  <div className="shrink-0 text-[11px] text-zinc-600">{relDate(n.updated_at)}</div>
                  <ExternalLink size={13} className="shrink-0 text-zinc-600 opacity-0 transition-opacity group-hover:opacity-100" />
                </button>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
