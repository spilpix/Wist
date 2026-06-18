/** Round avatar — saved image if set, else the name's initial on the accent.
 *  Mirrors the design-system §Аватары primitive. */
export default function Avatar({
  name,
  src,
  size = 32,
  className = '',
}: {
  name?: string | null
  src?: string | null
  size?: number
  className?: string
}) {
  const initial = (name?.trim()?.[0] ?? 'B').toUpperCase()
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent font-semibold text-[#fff] ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
    >
      {src ? <img src={window.wist.media.fileUrl(src)} alt="" draggable={false} className="h-full w-full object-cover" /> : initial}
    </span>
  )
}
