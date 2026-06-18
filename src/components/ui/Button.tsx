import { type ButtonHTMLAttributes, type ReactNode } from 'react'

type Variant = 'accent' | 'ghost' | 'subtle' | 'outline' | 'danger'
type Size = 'sm' | 'md'

const BASE =
  'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100 [transition:transform_100ms_ease-out,background-color_200ms_ease-out,box-shadow_200ms_ease-out,color_200ms_ease-out,border-color_200ms_ease-out]'

const SIZES: Record<Size, string> = {
  sm: 'px-2.5 py-1.5 text-xs',
  md: 'px-3.5 py-2 text-[13px]',
}

const VARIANTS: Record<Variant, string> = {
  // flat & quiet (Notion/Claude) — a hairline, not a glow; mirrors the .btn-accent CSS class
  accent: 'bg-accent text-[#fff] hover:bg-accent-hover shadow-[0_1px_2px_rgb(0_0_0/0.18)]',
  ghost: 'bg-raised text-zinc-200 hover:bg-highlight hover:text-white',
  subtle: 'bg-transparent text-zinc-400 hover:bg-highlight hover:text-zinc-100',
  outline: 'border border-edge bg-transparent text-zinc-200 hover:bg-highlight hover:border-zinc-700',
  // danger pulls from the red content-color pair so it stays theme-correct in light + dark
  danger:
    'bg-[color-mix(in_srgb,var(--c-red-text)_15%,transparent)] text-[color:var(--c-red-text)] hover:bg-[color-mix(in_srgb,var(--c-red-text)_25%,transparent)]',
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
