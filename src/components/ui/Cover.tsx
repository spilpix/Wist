import { Music as MusicIcon } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export const coverUrl = (p: string | null | undefined) => (p ? window.wist.media.fileUrl(p) : null)

// deterministic gradient so cover-less albums/tracks still look intentional
const GRADIENTS = [
  'linear-gradient(135deg,#7AA8C4,#3A8A8A)',
  'linear-gradient(135deg,#A87DC4,#C47A7A)',
  'linear-gradient(135deg,#6FB06F,#3A8A8A)',
  'linear-gradient(135deg,#E67D22,#C15F3C)',
  'linear-gradient(135deg,#C9A96B,#847A6D)',
  'linear-gradient(135deg,#5FA8EC,#2383E1)',
]
export function gradientFor(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return GRADIENTS[h % GRADIENTS.length]
}

export default function Cover({
  path,
  seed,
  rounded = 'rounded-lg',
  icon: Icon = MusicIcon,
  size = 20,
}: {
  path: string | null | undefined
  seed: string
  rounded?: string
  icon?: LucideIcon
  size?: number
}) {
  const url = coverUrl(path)
  return (
    <div className={`flex h-full w-full items-center justify-center overflow-hidden ${rounded}`} style={url ? undefined : { background: gradientFor(seed) }}>
      {url ? <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" /> : <Icon size={size} className="text-[#fff]/80" />}
    </div>
  )
}
