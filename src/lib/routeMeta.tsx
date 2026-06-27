import {
  Archive,
  BarChart3,
  CalendarDays,
  FileText,
  FolderKanban,
  Frame,
  Heart,
  History as HistoryIcon,
  Home,
  ListTodo,
  PenLine,
  Settings,
  Share2,
  Trash2,
  User,
  Users,
  type LucideIcon,
} from 'lucide-react'
import type { TKey } from '../i18n'

// exact-path → [icon, i18n label]. Shared by the workspace tabs and the History page.
const STATIC: Record<string, [LucideIcon, TKey]> = {
  '/': [Home, 'nav.home'],
  '/favorites': [Heart, 'nav.favorites'],
  '/calendar': [CalendarDays, 'nav.calendar'],
  '/notes': [PenLine, 'nav.notes'],
  '/tasks': [ListTodo, 'nav.tasks'],
  '/vault': [Archive, 'nav.vault'],
  '/projects': [FolderKanban, 'nav.projects'],
  '/trash': [Trash2, 'nav.trash'],
  '/canvas': [Frame, 'nav.canvas'],
  '/tree': [Share2, 'nav.tree'],
  '/stats': [BarChart3, 'nav.statistics'],
  '/profile': [User, 'nav.profile'],
  '/settings': [Settings, 'nav.settings'],
  '/history': [HistoryIcon, 'nav.history'],
  '/workspace': [Users, 'nav.workspace'],
}

// dynamic detail prefixes → [icon, fallback i18n label]
const PREFIX: Array<[string, LucideIcon, TKey]> = [
  ['/project/', FolderKanban, 'nav.hub'],
  ['/canvas/', Frame, 'nav.canvas'],
]

/** Resolve an icon + display label for any route (used by tabs + history). */
export function routeMeta(path: string, t: (k: TKey) => string): { icon: LucideIcon; label: string } {
  const exact = STATIC[path]
  if (exact) return { icon: exact[0], label: t(exact[1]) }
  const base = path.split('?')[0]
  if (STATIC[base]) return { icon: STATIC[base][0], label: t(STATIC[base][1]) }
  for (const [pre, icon, key] of PREFIX) if (base.startsWith(pre)) return { icon, label: t(key) }
  return { icon: FileText, label: base.replace(/^\//, '') || '?' }
}
