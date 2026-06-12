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
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-raised">
        <Icon size={28} className="text-zinc-600" />
      </div>
      <div className="text-base font-medium text-zinc-300">{title}</div>
      {subtitle && <div className="max-w-sm text-sm text-zinc-500">{subtitle}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
