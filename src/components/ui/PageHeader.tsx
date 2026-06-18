import { type ReactNode } from 'react'
import { type LucideIcon } from 'lucide-react'

interface Props {
  icon?: LucideIcon
  title: string
  subtitle?: string
  actions?: ReactNode
  children?: ReactNode // a row beneath the title — tabs, filters, chips
}

/** The Notion-style page header: soft icon tile + title + actions, optional row below. */
export default function PageHeader({ icon: Icon, title, subtitle, actions, children }: Props) {
  return (
    <div className="mb-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {Icon && (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-raised text-zinc-400">
              <Icon size={20} />
            </span>
          )}
          <div className="min-w-0">
            <h1 className="truncate text-[1.7rem] font-bold leading-tight tracking-tight text-white">{title}</h1>
            {subtitle && <p className="mt-0.5 truncate text-sm text-zinc-500">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      {children && <div className="mt-4">{children}</div>}
    </div>
  )
}
