import { type CSSProperties } from 'react'

/** A single shimmer line. `w` is any CSS width (e.g. '60%', 120). */
export function SkeletonLine({ w = '100%', className = '' }: { w?: string | number; className?: string }) {
  return <div className={`skel line ${className}`} style={{ width: typeof w === 'number' ? `${w}px` : w }} />
}

/** A shimmer circle — avatars, covers, thumbnails. */
export function SkeletonCircle({ size = 40, style }: { size?: number; style?: CSSProperties }) {
  return <div className="skel circle" style={{ width: size, height: size, ...style }} />
}

/** A free-form shimmer block (rounded-xs by default). */
export default function Skeleton({ w = '100%', h = 11, radius, className = '' }: { w?: string | number; h?: string | number; radius?: string; className?: string }) {
  return (
    <div
      className={`skel ${className}`}
      style={{
        width: typeof w === 'number' ? `${w}px` : w,
        height: typeof h === 'number' ? `${h}px` : h,
        borderRadius: radius,
      }}
    />
  )
}

/** Borderless task-list placeholder: N rows of check-square + title + due (mirrors TaskListRow). */
export function SkeletonTasks({ rows = 5, className = '' }: { rows?: number; className?: string }) {
  const widths = ['46%', '32%', '54%', '38%', '60%', '28%']
  return (
    <div className={`mt-1.5 ${className}`}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-2.5 py-2">
          <Skeleton w={18} h={18} radius="6px" className="shrink-0" />
          <SkeletonLine w={widths[i % widths.length]} />
          <div className="flex-1" />
          {i % 3 === 0 && <SkeletonLine w={34} className="shrink-0" />}
        </div>
      ))}
    </div>
  )
}

/** Cover-tile grid placeholder: N tiles of 16:9 cover + title + sub (mirrors media/category cards). */
export function SkeletonTiles({ count = 6, className = 'grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3' }: { count?: number; className?: string }) {
  return (
    <div className={className}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex flex-col gap-2.5">
          <div className="skel aspect-[16/9] w-full rounded-xl" />
          <SkeletonLine w="56%" />
          <SkeletonLine w="32%" />
        </div>
      ))}
    </div>
  )
}

/** List placeholder: N rows of icon + two lines, inside a bordered list container. */
export function SkeletonList({ rows = 4, className = '' }: { rows?: number; className?: string }) {
  const widths = ['30%', '38%', '26%', '34%', '22%', '40%']
  return (
    <div className={`overflow-hidden rounded-xl border border-edge bg-card ${className}`}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 border-b border-edge px-3.5 py-[11px] last:border-b-0">
          <SkeletonCircle size={30} />
          <div className="flex flex-1 flex-col gap-1.5">
            <SkeletonLine w={widths[i % widths.length]} />
            <SkeletonLine w="18%" />
          </div>
        </div>
      ))}
    </div>
  )
}
