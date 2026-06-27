import { useEffect } from 'react'
import { useObjectTypesStore } from '../store/objectTypesStore'
import { objColor, type ObjHue } from '../lib/objectColors'
import { typeIcon } from './TypePicker'

/**
 * Small colour-coded type marker for an object card (resolves props.type → icon/colour).
 * `withLabel` adds the type name as a chip. Renders nothing when the object has no type.
 */
export default function TypeBadge({ typeId, size = 13, withLabel = false, className = '' }: { typeId?: number | null; size?: number; withLabel?: boolean; className?: string }) {
  const byId = useObjectTypesStore((s) => s.byId)
  const loaded = useObjectTypesStore((s) => s.loaded)
  const load = useObjectTypesStore((s) => s.load)
  useEffect(() => {
    if (!loaded) load()
  }, [loaded, load])

  const type = typeId != null ? byId[typeId] : undefined
  if (!type) return null
  const Icon = typeIcon(type.icon)
  const c = objColor(type.hue as ObjHue)

  if (withLabel) {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-medium ${className}`}
        style={{ color: c, background: `color-mix(in srgb, ${c} 14%, transparent)` }}
        title={type.name}
      >
        <Icon size={size - 1} />
        {type.name}
      </span>
    )
  }
  return (
    <span className={`inline-flex shrink-0 items-center ${className}`} style={{ color: c }} title={type.name}>
      <Icon size={size} />
    </span>
  )
}
