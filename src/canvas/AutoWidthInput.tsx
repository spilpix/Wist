import { useLayoutEffect, useRef, useState } from 'react'

interface Props {
  value: string
  onChange: (v: string) => void
  onBlur?: () => void
  onKeyDown?: (e: React.KeyboardEvent) => void
  onPointerDown?: (e: React.PointerEvent) => void
  placeholder?: string
  autoFocus?: boolean
  className?: string
  min?: number
  max?: number
}

/** An <input> that grows/shrinks to exactly fit its text (Figma-style inline rename).
 *  A hidden mirror span (same class → same font/padding) measures the content width. */
export default function AutoWidthInput({ value, onChange, placeholder, className, min = 28, max = 480, ...rest }: Props) {
  const mirror = useRef<HTMLSpanElement>(null)
  const [w, setW] = useState(min)
  useLayoutEffect(() => {
    if (mirror.current) setW(Math.max(min, Math.min(max, Math.ceil(mirror.current.offsetWidth) + 2)))
  }, [value, placeholder, min, max])
  return (
    <span className="relative inline-flex">
      <span ref={mirror} aria-hidden className={`pointer-events-none invisible absolute whitespace-pre ${className ?? ''}`}>
        {value || placeholder || ''}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        className={className}
        style={{ width: w, boxSizing: 'border-box' }}
        {...rest}
      />
    </span>
  )
}
