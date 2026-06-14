import { type ButtonHTMLAttributes, type ReactNode } from 'react'

type Variant = 'accent' | 'ghost' | 'subtle' | 'danger'
type Size = 'sm' | 'md'

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all duration-150 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100'

const SIZES: Record<Size, string> = {
  sm: 'px-2.5 py-1.5 text-xs',
  md: 'px-3.5 py-2 text-sm',
}

const VARIANTS: Record<Variant, string> = {
  accent:
    'bg-accent text-[#fff] hover:bg-accent/85 shadow-[0_1px_2px_rgb(var(--accent-rgb)/0.35),0_4px_14px_rgb(var(--accent-rgb)/0.22)] hover:shadow-[0_2px_5px_rgb(var(--accent-rgb)/0.4),0_8px_22px_rgb(var(--accent-rgb)/0.3)]',
  ghost: 'bg-raised text-zinc-300 hover:bg-edge hover:text-white',
  subtle: 'text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-200',
  danger: 'bg-red-500/15 text-red-400 hover:bg-red-500/25',
}

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  children: ReactNode
}

export default function Button({ variant = 'ghost', size = 'md', className = '', children, ...rest }: Props) {
  return (
    <button className={`${BASE} ${SIZES[size]} ${VARIANTS[variant]} ${className}`} {...rest}>
      {children}
    </button>
  )
}
