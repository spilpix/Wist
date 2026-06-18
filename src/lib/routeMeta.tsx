import {
  Archive,
  BarChart3,
  BookOpen,
  Bookmark,
  FileText,
  Film,
  FolderKanban,
  Frame,
  HardDrive,
  Heart,
  History as HistoryIcon,
  Home,
  Image as ImageIcon,
  Library,
  ListTodo,
  Music,
  PenLine,
  Play,
  Settings,
  Share2,
  Trash2,
  User,
  Users,
  Youtube,
  type LucideIcon,
} from 'lucide-react'
import type { TKey } from '../i18n'

// exact-path → [icon, i18n label]. Shared by the workspace tabs and the History page.
const STATIC: Record<string, [LucideIcon, TKey]> = {
  '/': [Home, 'nav.home'],
  '/library': [Library, 'nav.library'],
  '/continue': [Play, 'nav.continue'],
  '/favorites': [Heart, 'nav.favorites'],
  '/moments': [Bookmark, 'nav.moments'],
  '/notes': [PenLine, 'nav.notes'],
  '/tasks': [ListTodo, 'nav.tasks'],
  '/music': [Music, 'nav.music'],
  '/vault': [Archive, 'nav.vault'],
  '/projects': [FolderKanban, 'nav.projects'],
  '/trash': [Trash2, 'nav.trash'],
  '/canvas': [Frame, 'nav.canvas'],
  '/tree': [Share2, 'nav.tree'],
  '/local': [HardDrive, 'nav.localFiles'],
  '/video': [Film, 'lib.cat.videos'],
  '/youtube': [Youtube, 'nav.youtube'],
  '/stats': [BarChart3, 'nav.statistics'],
  '/profile': [User, 'nav.profile'],
  '/settings': [Settings, 'nav.settings'],
  '/history': [HistoryIcon, 'nav.history'],
  '/workspace': [Users, 'nav.workspace'],
}

// dynamic detail prefixes → [icon, fallback i18n label]
const PREFIX: Array<[string, LucideIcon, TKey]> = [
  ['/project/', FolderKanban, 'nav.hub'],
  ['/title/', Film, 'nav.library'],
  ['/canvas/', Frame, 'nav.canvas'],
]

/** Resolve an icon + display label for any route (used by tabs + history). */
export function routeMeta(path: string, t: (k: TKey) => string): { icon: LucideIcon; label: string } {
  const exact = STATIC[path]
  if (exact) return { icon: exact[0], label: t(exact[1]) }
  const base = path.split('?')[0]
  // Library sub-views share the /library pathname — distinguish them by query (new ?cat= + legacy)
  if (base === '/library') {
    const q = new URLSearchParams(path.split('?')[1] ?? '')
    const cat = q.get('cat')
    if (cat === 'documents') return { icon: FileText, label: t('lib.cat.documents') }
    if (cat === 'images') return { icon: ImageIcon, label: t('lib.cat.images') }
    if (cat === 'files' || q.get('tab') === 'files') return { icon: Archive, label: t('lib.cat.files') }
    if (cat === 'books' || q.get('type') === 'book') return { icon: BookOpen, label: t('lib.cat.books') }
    if (cat === 'music' || q.get('tab') === 'music') return { icon: Music, label: t('nav.music') }
  }
  if (STATIC[base]) return { icon: STATIC[base][0], label: t(STATIC[base][1]) }
  for (const [pre, icon, key] of PREFIX) if (base.startsWith(pre)) return { icon, label: t(key) }
  return { icon: FileText, label: base.replace(/^\//, '') || '?' }
}
