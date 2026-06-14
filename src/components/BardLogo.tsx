/**
 * Bard brand mark — a symmetric voice/soundwave glyph on a rounded accent tile.
 * Geometric and flat in the spirit of Notion / Claude; the gradient follows the
 * app accent so it re-themes with the user's chosen colour.
 */
interface LogoProps {
  size?: number
  className?: string
  /** render just the glyph (no tile) — used on dark surfaces */
  bare?: boolean
}

const BARS = [
  { x: 8, h: 8, o: 0.78 },
  { x: 11.6, h: 13, o: 0.9 },
  { x: 15.2, h: 18, o: 1 },
  { x: 18.8, h: 13, o: 0.9 },
  { x: 22.4, h: 8, o: 0.78 },
]

export default function BardLogo({ size = 24, className, bare = false }: LogoProps) {
  const id = bare ? 'bardGlyph' : 'bardTile'
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      aria-label="Bard"
    >
      {!bare && (
        <>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
              <stop offset="0" style={{ stopColor: 'rgb(var(--accent-rgb))' }} />
              <stop offset="1" style={{ stopColor: 'rgb(var(--accent-bright-rgb))' }} />
            </linearGradient>
          </defs>
          <rect width="32" height="32" rx="8.5" fill={`url(#${id})`} />
        </>
      )}
      <g
        fill={bare ? 'currentColor' : '#fff'}
        transform={bare ? 'translate(0 0)' : ''}
      >
        {BARS.map((b) => (
          <rect
            key={b.x}
            x={b.x}
            y={16 - b.h / 2}
            width="2.6"
            height={b.h}
            rx="1.3"
            opacity={b.o}
          />
        ))}
      </g>
    </svg>
  )
}
