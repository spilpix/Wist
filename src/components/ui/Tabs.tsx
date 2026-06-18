import { type LucideIcon } from 'lucide-react'

export interface Tab {
  id: string
  label: string
  icon?: LucideIcon
  /** optional trailing count badge (hidden when 0/undefined) */
  count?: number
}

interface Props {
  tabs: Tab[]
  active: string
  onChange: (id: string) => void
  className?: string
}

/** Notion view tabs: light text labels, active = ink underline (not a filled pill). */
export default function Tabs({ tabs, active, onChange, className = '' }: Props) {
  return (
    <div className={`flex items-center gap-5 ${className}`}>
      {tabs.map(({ id, label, icon: Icon, count }) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          className={`flex items-center gap-1.5 border-b-2 pb-2 pt-1 text-sm font-medium transition-colors duration-150 ${
            active === id ? 'border-white text-white' : 'border-transparent text-zinc-500 hover:text-zinc-200'
          }`}
        >
          {Icon && <Icon size={14} />}
          {label}
          {count != null && count > 0 && <span className="text-[12px] font-normal text-zinc-500">{count}</span>}
        </button>
      ))}
    </div>
  )
}
