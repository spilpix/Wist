import { type LucideIcon } from 'lucide-react'

export interface Tab {
  id: string
  label: string
  icon?: LucideIcon
}

interface Props {
  tabs: Tab[]
  active: string
  onChange: (id: string) => void
  className?: string
}

/** Notion-style view tabs: a soft segmented row, active = accent pill. */
export default function Tabs({ tabs, active, onChange, className = '' }: Props) {
  return (
    <div className={`flex items-center gap-1 ${className}`}>
      {tabs.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors duration-150 ${
            active === id ? 'bg-accent/15 text-accent-bright' : 'text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-300'
          }`}
        >
          {Icon && <Icon size={14} />}
          {label}
        </button>
      ))}
    </div>
  )
}
