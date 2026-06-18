import { type ButtonHTMLAttributes, type ReactNode } from 'react'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean
  children: ReactNode
}

/** Square, icon-only button — toolbars, card actions, rails. */
export default function IconButton({ active, className = '', children, ...rest }: Props) {
  return (
    <button
      className={`flex items-center justify-center rounded-lg p-1.5 transition-colors duration-150 ${
        active ? 'bg-highlight text-zinc-100' : 'text-zinc-500 hover:bg-highlight hover:text-zinc-200'
      } ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}
