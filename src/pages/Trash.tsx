import { useCallback, useEffect, useState } from 'react'
import { FolderKanban, ListTodo, PenLine, RotateCcw, Trash2 } from 'lucide-react'
import PageHeader from '../components/ui/PageHeader'
import Spinner from '../components/ui/Spinner'
import EmptyState from '../components/ui/EmptyState'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import { toast } from '../store/toastStore'
import { formatRelative } from '../utils/formatters'
import { useI18n } from '../i18n'
import type { Note, Project, Task } from '../types/models'

type Kind = 'project' | 'note' | 'task'
interface Bin {
  projects: Project[]
  notes: Note[]
  tasks: Task[]
}

export default function Trash() {
  const { t } = useI18n()
  const [data, setData] = useState<Bin | null>(null)
  const [confirmEmpty, setConfirmEmpty] = useState(false)

  const load = useCallback(
    () =>
      window.wist.trash
        .list()
        .then(setData)
        .catch((e) => {
          console.error('trash load failed', e)
          setData((p) => p ?? { projects: [], notes: [], tasks: [] })
        }),
    []
  )
  useEffect(() => {
    load()
  }, [load])

  const restore = async (kind: Kind, id: number) => {
    await window.wist.trash.restore(kind, id)
    toast(t('trash.restored'), 'success')
    load()
  }
  const purge = async (kind: Kind, id: number) => {
    await window.wist.trash.purge(kind, id)
    load()
  }
  const empty = async () => {
    await window.wist.trash.empty()
    setConfirmEmpty(false)
    load()
  }

  if (!data) return <Spinner />
  const total = data.projects.length + data.notes.length + data.tasks.length

  const groups = [
    { kind: 'project' as Kind, icon: FolderKanban, label: t('nav.projects'), items: data.projects.map((p) => ({ id: p.id, title: p.name, when: p.deleted_at })) },
    { kind: 'note' as Kind, icon: PenLine, label: t('nav.notes'), items: data.notes.map((n) => ({ id: n.id, title: n.title || n.content.slice(0, 48) || t('trash.untitled'), when: n.deleted_at })) },
    { kind: 'task' as Kind, icon: ListTodo, label: t('nav.tasks'), items: data.tasks.map((tk) => ({ id: tk.id, title: tk.title, when: tk.deleted_at })) },
  ].filter((g) => g.items.length)

  return (
    <div className="page max-w-3xl">
      <PageHeader
        icon={Trash2}
        title={t('nav.trash')}
        actions={
          total > 0 ? (
            <button className="btn-ghost" onClick={() => setConfirmEmpty(true)}>
              <Trash2 size={14} /> {t('trash.empty')}
            </button>
          ) : undefined
        }
      />

      {total === 0 ? (
        <EmptyState icon={Trash2} title={t('trash.emptyTitle')} subtitle={t('trash.emptySubtitle')} />
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.kind}>
              <h2 className="section-title">
                {g.label} · {g.items.length}
              </h2>
              <div className="card divide-y divide-edge/40">
                {g.items.map((item) => (
                  <div key={item.id} className="group flex items-center gap-3 px-4 py-2.5">
                    <g.icon size={15} className="shrink-0 text-zinc-500" />
                    <span className="min-w-0 flex-1 truncate text-sm text-zinc-300">{item.title}</span>
                    <span className="shrink-0 text-[11px] text-zinc-500">{item.when ? formatRelative(item.when) : ''}</span>
                    <button
                      onClick={() => restore(g.kind, item.id)}
                      title={t('trash.restore')}
                      className="shrink-0 rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-500/15 hover:text-accent-bright"
                    >
                      <RotateCcw size={14} />
                    </button>
                    <button
                      onClick={() => purge(g.kind, item.id)}
                      title={t('trash.deleteForever')}
                      className="shrink-0 rounded-lg p-1.5 text-zinc-500 opacity-0 transition-all hover:text-red-400 group-hover:opacity-100"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {confirmEmpty && (
        <ConfirmDialog
          title={t('trash.emptyConfirmTitle')}
          message={t('trash.emptyConfirm')}
          confirmLabel={t('trash.empty')}
          danger
          onConfirm={empty}
          onCancel={() => setConfirmEmpty(false)}
        />
      )}
    </div>
  )
}
