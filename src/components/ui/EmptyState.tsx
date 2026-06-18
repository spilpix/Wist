import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

interface Props {
  icon: LucideIcon
  title: string
  subtitle?: string
  action?: ReactNode
}

export default function EmptyState({ icon: Icon, title, subtitle, action }: Props) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-center animate-fade-in">
      <div className="mb-1 flex h-16 w-16 animate-pop-in items-center justify-center rounded-2xl bg-gradient-to-br from-raised to-surface ring-1 ring-edge">
        <Icon size={26} className="text-zinc-500" />
      </div>
      <div className="text-base font-semibold text-zinc-200">{title}</div>
      {subtitle && <div className="max-w-sm text-sm leading-relaxed text-zinc-500">{subtitle}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
