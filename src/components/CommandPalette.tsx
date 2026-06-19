import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Archive,
  BarChart3,
  FolderKanban,
  Heart,
  Home,
  ListTodo,
  Moon,
  PenLine,
  Plus,
  Search,
  Settings,
  Sun,
  Trash2,
  TreePine,
} from 'lucide-react'
import { useUiStore } from '../store/uiStore'
import { useSettingsStore, resolvedTheme } from '../store/settingsStore'
import type { Note, Project, Task } from '../types/models'
import { physKey } from '../lib/keyboard'
import { useI18n, type TKey } from '../i18n'

interface Item {
  id: string
  group: 'pages' | 'actions' | 'notes' | 'tasks' | 'projects'
  label: string
  sublabel?: string
  icon: typeof Home
  run: () => void
}

function score(text: string, query: string): number {
  const t = text.toLowerCase()
  const q = query.toLowerCase()
  if (!q) return 1
  if (t.startsWith(q)) return 4
  if (t.includes(' ' + q)) return 3
  if (t.includes(q)) return 2
  let i = 0
  for (const ch of q) {
    const j = t.indexOf(ch, i)
    if (j === -1) return 0
    i = j + 1
  }
  return 1
}

const PAGES: Array<{ to: string; key: TKey; icon: typeof Home }> = [
  { to: '/', key: 'nav.home', icon: Home },
  { to: '/favorites', key: 'nav.favorites', icon: Heart },
  { to: '/notes', key: 'nav.notes', icon: PenLine },
  { to: '/tasks', key: 'nav.tasks', icon: ListTodo },
  { to: '/vault', key: 'nav.vault', icon: Archive },
  { to: '/projects', key: 'nav.projects', icon: FolderKanban },
  { to: '/tree', key: 'nav.tree', icon: TreePine },
  { to: '/trash', key: 'nav.trash', icon: Trash2 },
  { to: '/stats', key: 'nav.statistics', icon: BarChart3 },
  { to: '/settings', key: 'nav.settings', icon: Settings },
]

export default function CommandPalette() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const open = useUiStore((s) => s.paletteOpen)
  const setPalette = useUiStore((s) => s.setPalette)
  const updateSettings = useSettingsStore((s) => s.update)

  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [notes, setNotes] = useState<Note[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && physKey(e) === 'k') {
        e.preventDefault()
        setPalette(!useUiStore.getState().paletteOpen)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setPalette])

  useEffect(() => {
    if (!open) return
    setQuery('')
    setActive(0)
    window.wist.notes.list({}).then(setNotes)
    window.wist.tasks.list().then(setTasks).catch(() => undefined)
    window.wist.projects.list().then(setProjects).catch(() => undefined)
  }, [open])

  const close = useCallback(() => setPalette(false), [setPalette])

  const go = useCallback(
    (to: string) => {
      close()
      navigate(to)
    },
    [close, navigate]
  )

  const items = useMemo<Item[]>(() => {
    const out: Item[] = []
    const q = query.trim()

    for (const p of PAGES) {
      const label = t(p.key)
      if (score(label, q) > 0) {
        out.push({ id: `p${p.to}`, group: 'pages', label, icon: p.icon, run: () => go(p.to) })
      }
    }

    const dark = resolvedTheme() === 'dark'
    const actions: Item[] = [
      {
        id: 'a-project',
        group: 'actions',
        label: t('cmdk.newProject'),
        icon: FolderKanban,
        run: () => go('/projects?new=1'),
      },
      {
        id: 'a-note',
        group: 'actions',
        label: t('cmdk.newNote'),
        icon: PenLine,
        run: () => go('/notes?new=1'),
      },
      {
        id: 'a-task',
        group: 'actions',
        label: t('cmdk.newTask'),
        icon: ListTodo,
        run: () => go('/tasks?focus=1'),
      },
      {
        id: 'a-theme',
        group: 'actions',
        label: t('cmdk.toggleTheme'),
        icon: dark ? Sun : Moon,
        run: () => {
          close()
          updateSettings({ theme: dark ? 'light' : 'dark' })
        },
      },
    ]
    for (const a of actions) if (score(a.label, q) > 0) out.push(a)

    if (q) {
      const scoredNotes = notes
        .map((n) => ({ n, s: Math.max(score(n.title, q), score(n.content.slice(0, 200), q)) }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s)
        .slice(0, 6)
      for (const { n } of scoredNotes) {
        out.push({
          id: `n${n.id}`,
          group: 'notes',
          label: n.title || n.content.slice(0, 50),
          icon: PenLine,
          run: () => go(`/notes?open=${n.id}`),
        })
      }

      const scoredTasks = tasks
        .filter((tk) => !tk.done)
        .map((tk) => ({ tk, s: score(tk.title, q) }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s)
        .slice(0, 5)
      for (const { tk } of scoredTasks) {
        out.push({
          id: `tk${tk.id}`,
          group: 'tasks',
          label: tk.title,
          sublabel: tk.status,
          icon: ListTodo,
          run: () => go(`/tasks?open=${tk.id}`),
        })
      }

      const scoredProjects = projects
        .map((p) => ({ p, s: score(p.name, q) }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s)
        .slice(0, 4)
      for (const { p } of scoredProjects) {
        out.push({
          id: `pr${p.id}`,
          group: 'projects',
          label: p.name,
          sublabel: p.kind || undefined,
          icon: FolderKanban,
          run: () => go(`/project/${p.id}`),
        })
      }
    }
    return out
  }, [query, notes, tasks, projects, t, go, close, updateSettings])

  useEffect(() => setActive(0), [query])

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-idx="${active}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [active])

  if (!open) return null

  const GROUP_LABEL: Record<Item['group'], string> = {
    pages: t('cmdk.pages'),
    actions: t('cmdk.actions'),
    notes: t('cmdk.notes'),
    tasks: t('nav.tasks'),
    projects: t('nav.projects'),
  }

  let lastGroup: Item['group'] | null = null

  return (
    <div className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[2px] animate-fade-in" onMouseDown={close}>
      <div
        className="mx-auto mt-[12vh] w-[600px] max-w-[92vw] overflow-hidden rounded-2xl border border-edge bg-card animate-scale-in"
        style={{ boxShadow: 'var(--palette-shadow)' }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-edge px-4">
          <Search size={16} className="shrink-0 text-zinc-600" />
          <input
            autoFocus
            className="h-12 w-full bg-transparent text-[15px] text-zinc-100 outline-none placeholder:text-zinc-500 focus-visible:!outline-none"
            placeholder={t('cmdk.placeholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') close()
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setActive((i) => Math.min(i + 1, items.length - 1))
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault()
                setActive((i) => Math.max(i - 1, 0))
              }
              if (e.key === 'Enter' && items[active]) items[active].run()
            }}
          />
        </div>

        <div ref={listRef} className="max-h-[380px] overflow-y-auto p-2">
          {!items.length && (
            <div className="px-3 py-10 text-center text-sm text-zinc-600">{t('cmdk.noResults')}</div>
          )}
          {items.map((item, i) => {
            const header = item.group !== lastGroup
            lastGroup = item.group
            const Icon = item.icon
            return (
              <div key={item.id}>
                {header && (
                  <div className="px-3 pb-1 pt-2.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
                    {GROUP_LABEL[item.group]}
                  </div>
                )}
                <button
                  data-idx={i}
                  onMouseMove={() => setActive(i)}
                  onClick={item.run}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                    i === active ? 'bg-highlight text-zinc-100' : 'text-zinc-400'
                  }`}
                >
                  <Icon size={15} className={i === active ? 'text-zinc-100' : 'text-zinc-600'} />
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {item.sublabel && <span className="text-[11px] uppercase tracking-wide text-zinc-600">{item.sublabel}</span>}
                </button>
              </div>
            )
          })}
        </div>

        <div className="flex items-center gap-4 border-t border-edge px-4 py-2.5 text-[11px] text-zinc-600">
          <span className="flex items-center gap-1.5"><span className="kbd">↑</span><span className="kbd">↓</span> {t('cmdk.navigate')}</span>
          <span className="flex items-center gap-1.5"><span className="kbd">Enter</span> {t('cmdk.open')}</span>
          <span className="flex items-center gap-1.5"><span className="kbd">Esc</span> {t('cmdk.close')}</span>
        </div>
      </div>
    </div>
  )
}
