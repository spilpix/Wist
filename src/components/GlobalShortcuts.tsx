import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import Modal from './ui/Modal'
import { useTabStore } from '../store/tabStore'
import { routeMeta } from '../lib/routeMeta'
import { physKey } from '../lib/keyboard'
import { useI18n } from '../i18n'

// `g` then a letter jumps to a section (Linear/Gmail-style chord nav)
const GO_ROUTES: Record<string, string> = {
  h: '/',
  k: '/projects',
  n: '/notes',
  t: '/tasks',
  c: '/canvas',
  f: '/vault',
  r: '/trash',
  s: '/settings',
  y: '/history',
}

/**
 * App-wide keyboard shortcuts. Mounted once in Layout. Ctrl+K (palette) and Ctrl+B
 * (sidebar) are handled elsewhere; this adds navigation chords, tab control, context
 * "new", back/forward and a `?` help sheet. Plain-key shortcuts are ignored while the
 * user is typing in an input/textarea/contentEditable.
 */
export default function GlobalShortcuts() {
  const navigate = useNavigate()
  const location = useLocation()
  const [help, setHelp] = useState(false)

  useEffect(() => {
    let chord = false // `g` was pressed — waiting for the second key
    let chordTimer: ReturnType<typeof setTimeout> | null = null
    const clearChord = () => {
      chord = false
      if (chordTimer) clearTimeout(chordTimer)
    }
    const isTyping = (el: HTMLElement | null) =>
      !!el && (el.isContentEditable || /^(input|textarea|select)$/i.test(el.tagName))

    const onKey = (e: KeyboardEvent) => {
      const typing = isTyping(e.target as HTMLElement | null)
      const mod = e.ctrlKey || e.metaKey

      // ---- modified combos (fine even while typing — they don't alter text) ----
      if (mod && !e.altKey) {
        const k = physKey(e) // physical key → layout-independent (works on Cyrillic etc.)
        if (e.key === 'Tab') {
          e.preventDefault()
          const to = useTabStore.getState().step(e.shiftKey ? -1 : 1)
          if (to) navigate(to)
          return
        }
        if (!e.shiftKey && k >= '1' && k <= '9') {
          const to = useTabStore.getState().activateIndex(Number(k) - 1)
          if (to) {
            e.preventDefault()
            navigate(to)
          }
          return
        }
        if (!e.shiftKey && k === 't') {
          e.preventDefault()
          navigate('/')
          return
        }
        if (!e.shiftKey && k === ',') {
          e.preventDefault()
          navigate('/settings')
          return
        }
        if (!e.shiftKey && k === 'n') {
          e.preventDefault()
          navigate(location.pathname.startsWith('/project') ? '/projects?new=1' : '/notes?new=1')
          return
        }
      }
      // back / forward
      if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault()
        navigate(-1)
        return
      }
      if (e.altKey && e.key === 'ArrowRight') {
        e.preventDefault()
        navigate(1)
        return
      }

      // ---- plain keys: only when not typing / no modifiers ----
      if (typing || mod || e.altKey) {
        if (chord) clearChord()
        return
      }
      if (chord) {
        clearChord()
        const dest = GO_ROUTES[physKey(e)]
        if (dest) {
          e.preventDefault()
          navigate(dest)
        }
        return
      }
      if (physKey(e) === 'g') {
        chord = true
        chordTimer = setTimeout(() => {
          chord = false
        }, 1200)
        return
      }
      if (e.key === '?') {
        e.preventDefault()
        setHelp(true)
      }
    }

    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      if (chordTimer) clearTimeout(chordTimer)
    }
  }, [navigate, location.pathname])

  if (!help) return null
  return <ShortcutsHelp onClose={() => setHelp(false)} />
}

type Row = [string[], string]

function Keys({ keys }: { keys: string[] }) {
  return (
    <span className="flex shrink-0 items-center gap-1">
      {keys.map((k, i) => (
        <kbd key={i} className="kbd">
          {k}
        </kbd>
      ))}
    </span>
  )
}

function Group({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <div>
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{title}</div>
      <div className="space-y-1.5">
        {rows.map(([keys, label], i) => (
          <div key={i} className="flex items-center justify-between gap-3">
            <span className="truncate text-sm text-zinc-300">{label}</span>
            <Keys keys={keys} />
          </div>
        ))}
      </div>
    </div>
  )
}

function ShortcutsHelp({ onClose }: { onClose: () => void }) {
  const { t } = useI18n()
  const r = (path: string) => routeMeta(path, t).label

  const navRows: Row[] = [
    [['G', 'H'], r('/')],
    [['G', 'K'], r('/projects')],
    [['G', 'N'], r('/notes')],
    [['G', 'T'], r('/tasks')],
    [['G', 'C'], r('/canvas')],
    [['G', 'F'], r('/vault')],
    [['G', 'R'], r('/trash')],
    [['G', 'S'], r('/settings')],
    [['G', 'Y'], r('/history')],
    [['Alt', '←'], t('keys.back')],
    [['Alt', '→'], t('keys.forward')],
  ]
  const tabRows: Row[] = [
    [['Ctrl', 'T'], t('keys.newTab')],
    [['Ctrl', '1–9'], t('keys.switchTab')],
    [['Ctrl', 'Tab'], t('keys.nextTab')],
    [['Ctrl', '⇧', 'Tab'], t('keys.prevTab')],
  ]
  const actionRows: Row[] = [
    [['Ctrl', 'K'], t('keys.commandPalette')],
    [['Ctrl', 'B'], t('keys.toggleSidebar')],
    [['Ctrl', 'N'], t('keys.newItem')],
    [['Ctrl', ','], t('keys.settings')],
    [['?'], t('keys.help')],
  ]
  const editorRows: Row[] = [
    [['Ctrl', 'B'], t('keys.bold')],
    [['Ctrl', 'I'], t('keys.italic')],
    [['Ctrl', 'E'], t('keys.code')],
    [['/'], t('keys.slash')],
    [['[', '['], t('keys.wikilink')],
  ]

  return (
    <Modal title={t('keys.title')} onClose={onClose} width="max-w-2xl">
      <div className="grid grid-cols-1 gap-7 sm:grid-cols-2">
        <Group title={t('keys.navigation')} rows={navRows} />
        <div className="space-y-7">
          <Group title={t('keys.tabs')} rows={tabRows} />
          <Group title={t('keys.actions')} rows={actionRows} />
          <Group title={t('keys.editor')} rows={editorRows} />
        </div>
      </div>
    </Modal>
  )
}
