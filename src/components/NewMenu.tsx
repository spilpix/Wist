import { useNavigate } from 'react-router-dom'
import { CalendarDays, FolderKanban, Frame, ListTodo, PenLine, Plus } from 'lucide-react'
import { useI18n, type TKey } from '../i18n'
import { isoDay, today } from '../lib/dates'
import { usePopover } from '../lib/usePopover'

/**
 * Sidebar "+ New" button (Capacities-style). Opens a small popover that creates the
 * core objects — each routes to the page's own create flow so behaviour stays in one
 * place (Task → focus a new row, Note/Hub → ?new, Canvas → create + open the board).
 * Quote and Tag are intentionally omitted for now (no object type yet).
 */
export default function NewMenu() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const { open, setOpen, ref } = usePopover<HTMLDivElement>()

  const items: Array<{ key: TKey; icon: typeof Plus; run: () => void }> = [
    { key: 'new.today', icon: CalendarDays, run: () => navigate(`/calendar?v=day&d=${isoDay(today())}`) },
    { key: 'new.task', icon: ListTodo, run: () => navigate('/tasks?focus=1') },
    { key: 'new.note', icon: PenLine, run: () => navigate('/notes?new=1') },
    { key: 'new.hub', icon: FolderKanban, run: () => navigate('/projects?new=1') },
    {
      key: 'new.canvas',
      icon: Frame,
      run: async () => {
        const c = await window.wist.canvas.create(t('canvas.untitled'))
        navigate(`/canvas/${c.id}`)
      },
    },
  ]

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 rounded-lg border border-edge bg-field px-2.5 py-1.5 text-[14px] font-medium text-zinc-200 transition-colors hover:bg-highlight"
      >
        <Plus size={16} className="shrink-0 text-accent-bright" />
        <span className="min-w-0 flex-1 text-left">{t('nav.new')}</span>
      </button>
      {open && (
        <div
          className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-xl border border-edge bg-card p-1 shadow-[var(--float-shadow)] animate-scale-in"
          style={{ transformOrigin: 'top' }}
        >
          {items.map(({ key, icon: Icon, run }) => (
            <button
              key={key}
              onClick={() => {
                setOpen(false)
                run()
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-left text-[13px] text-zinc-200 transition-colors hover:bg-highlight"
            >
              <Icon size={15} className="shrink-0 text-zinc-500" /> {t(key)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
