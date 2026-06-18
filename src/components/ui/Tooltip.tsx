import { cloneElement, type ReactElement } from 'react'

type Side = 'bottom' | 'right' | 'top'

interface Props {
  label: string
  shortcut?: string // muted shortcut chip, e.g. "Ctrl K"
  side?: Side
  children: ReactElement
}

/**
 * Convenience wrapper for a hint. It stamps a `data-tip` attribute (+ optional shortcut/
 * side) AND an `aria-label` onto its child — it does NOT use the native `title`, so the OS
 * box never appears and React never fights us over the attribute. The single global
 * <TooltipLayer/> renders every hint (these + any plain `title=` elsewhere) in one style,
 * always viewport-clamped. No wrapper element, so layout is untouched.
 */
export default function Tooltip({ label, shortcut, side, children }: Props) {
  const child = children as ReactElement<Record<string, unknown>>
  const hasName = child.props['aria-label'] != null || child.props['aria-labelledby'] != null
  return cloneElement(child, {
    'data-tip': label,
    'data-tip-kbd': shortcut,
    'data-tip-side': side,
    ...(hasName ? {} : { 'aria-label': label }), // keep an accessible name without a title
  } as Record<string, unknown>)
}
