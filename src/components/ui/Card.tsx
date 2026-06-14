import { type HTMLAttributes, type ReactNode } from 'react'

interface Props extends HTMLAttributes<HTMLDivElement> {
  interactive?: boolean // lift + deepen shadow on hover
  pad?: boolean
  children: ReactNode
}

/** The base surface for everything boxed. `interactive` makes it a hoverable tile. */
export default function Card({ interactive, pad, className = '', children, ...rest }: Props) {
  return (
    <div className={`${interactive ? 'tile' : 'card'} ${pad ? 'p-4' : ''} ${className}`} {...rest}>
      {children}
    </div>
  )
}
