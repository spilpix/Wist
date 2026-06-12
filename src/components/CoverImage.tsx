import { BookOpen, Clapperboard, Film, MonitorPlay, Sparkles, Youtube } from 'lucide-react'
import type { TitleType } from '../types/models'

const TYPE_ICONS = {
  anime: Sparkles,
  movie: Film,
  series: MonitorPlay,
  cartoon: Clapperboard,
  youtube: Youtube,
  book: BookOpen,
}

// deterministic placeholder hue from the title text
function hueFor(text: string): number {
  let h = 0
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) % 360
  return h
}

interface Props {
  coverPath: string | null
  title: string
  type: TitleType
  className?: string
  iconSize?: number
}

export default function CoverImage({ coverPath, title, type, className = '', iconSize = 36 }: Props) {
  if (coverPath) {
    return (
      <img
        src={window.wist.media.fileUrl(coverPath)}
        alt={title}
        loading="lazy"
        className={`object-cover ${className}`}
        draggable={false}
      />
    )
  }
  const Icon = TYPE_ICONS[type] ?? Film
  const hue = hueFor(title)
  return (
    <div
      className={`flex items-center justify-center ${className}`}
      style={{ backgroundColor: `hsl(${hue} 28% 16%)` }}
    >
      <Icon size={iconSize} style={{ color: `hsl(${hue} 45% 55%)` }} />
    </div>
  )
}
