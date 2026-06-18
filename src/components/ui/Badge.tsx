import { type ReactNode } from 'react'

/** Small count / status badge. */
export default function Badge({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full bg-raised px-2 py-0.5 text-[11px] font-medium text-zinc-400 ${className}`}>
      {children}
    </span>
  )
}
