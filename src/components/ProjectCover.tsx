import { type ReactNode } from 'react'
import { coverGradient } from '../types/models'

/**
 * Renders a project cover — either a preset gradient template ("gradient:<id>"),
 * a real saved image, or nothing. Children render as an overlay on top.
 */
export default function ProjectCover({
  cover,
  className = '',
  children,
}: {
  cover: string | null
  className?: string
  children?: ReactNode
}) {
  const grad = coverGradient(cover)
  // a "gradient:" reference with an unknown id resolves to no gradient — don't try to
  // load it as an image file (that would show a broken-image icon); render a neutral fill
  const isGradientRef = !!cover && cover.startsWith('gradient:')
  return (
    <div className={`relative overflow-hidden ${grad ? '' : isGradientRef ? 'bg-raised' : ''} ${className}`} style={grad ? { backgroundImage: grad } : undefined}>
      {!isGradientRef && cover && (
        <img
          src={window.wist.media.fileUrl(cover)}
          alt=""
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover"
          draggable={false}
        />
      )}
      {children}
    </div>
  )
}
