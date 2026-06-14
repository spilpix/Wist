import { type ReactNode } from 'react'

interface Props {
  active?: boolean
  onClick?: () => void
  dotColor?: string
  className?: string
  title?: string
  children: ReactNode
}

/** A pill — filters, categories, tags. Notion-style soft chip. */
export default function Chip({ active, onClick, dotColor, className = '', title, children }: Props) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors duration-150 ${
        active ? 'bg-accent text-[#fff]' : 'bg-raised text-zinc-400 hover:bg-edge hover:text-zinc-200'
      } ${className}`}
    >
      {dotColor && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: dotColor }} />}
      {children}
    </button>
  )
}
