import { type ReactNode } from 'react'

/** Small uppercase muted label that opens a section. */
export default function SectionHeader({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500">{children}</h2>
      {action}
    </div>
  )
}
