import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { BarChart3, Check, ChevronRight, Globe, History as HistoryIcon, Settings, User } from 'lucide-react'
import { useSettingsStore } from '../store/settingsStore'
import Avatar from './ui/Avatar'
import { useI18n } from '../i18n'

/**
 * Claude-style profile menu. The sidebar profile pill (or the rail avatar) opens a
 * dropdown with Settings, Profile, Language, History and Statistics — so Settings no
 * longer needs its own button in the sidebar. The dropdown is portaled to <body> and
 * fixed-positioned off the trigger's rect so it never gets clipped by the sidebar.
 */
export default function ProfileMenu({ compact = false, active = false }: { compact?: boolean; active?: boolean }) {
  const { t, lang } = useI18n()
  const navigate = useNavigate()
  const update = useSettingsStore((s) => s.update)
  const settings = useSettingsStore((s) => s.settings)
  const name = settings?.profileName?.trim() || 'Bard'
  const avatar = settings?.profileAvatar || ''
  const [open, setOpen] = useState(false)
  const [langOpen, setLangOpen] = useState(false)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const tgt = e.target as Node
      if (triggerRef.current?.contains(tgt) || menuRef.current?.contains(tgt)) return
      setOpen(false)
      setLangOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        setLangOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const toggle = () => {
    if (!open) setRect(triggerRef.current?.getBoundingClientRect() ?? null)
    setOpen((v) => !v)
    setLangOpen(false)
  }
  const go = (path: string) => {
    setOpen(false)
    navigate(path)
  }
  const pickLang = (l: 'ru' | 'en') => {
    update({ language: l })
    setOpen(false)
    setLangOpen(false)
  }

  const itemCls =
    'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-left text-[13px] text-zinc-200 transition-colors hover:bg-highlight'

  const menuStyle: CSSProperties = compact
    ? { left: (rect?.right ?? 0) + 8, bottom: window.innerHeight - (rect?.bottom ?? 0) }
    : { left: rect?.left ?? 0, bottom: window.innerHeight - (rect?.top ?? 0) + 8 }

  return (
    <>
      {compact ? (
        <button
          ref={triggerRef}
          onClick={toggle}
          title={t('nav.profile')}
          className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${open || active ? 'bg-sidebar-active' : 'hover:bg-highlight'}`}
        >
          <Avatar name={name} src={avatar} size={24} />
        </button>
      ) : (
        <button
          ref={triggerRef}
          onClick={toggle}
          className={`flex w-full items-center gap-2.5 rounded-full px-2 py-1.5 text-left transition-colors ${
            open || active ? 'bg-sidebar-active text-zinc-100' : 'hover:bg-highlight'
          }`}
        >
          <Avatar name={name} src={avatar} size={28} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold text-zinc-100">{name}</span>
            <span className="block truncate text-[11px] text-zinc-500">{t('nav.profile')}</span>
          </span>
          <ChevronRight size={14} className={`shrink-0 text-zinc-500 transition-transform ${open ? '-rotate-90' : 'rotate-90'}`} />
        </button>
      )}

      {open &&
        createPortal(
          <div
            ref={menuRef}
            style={{ position: 'fixed', zIndex: 60, boxShadow: 'var(--float-shadow)', ...menuStyle }}
            className="w-60 overflow-hidden rounded-2xl border border-edge bg-card p-1"
          >
            <div className="flex items-center gap-2.5 px-2.5 py-2">
              <Avatar name={name} src={avatar} size={32} />
              <div className="truncate text-[13px] font-semibold text-zinc-100">{name}</div>
            </div>
            <div className="my-1 h-px bg-edge" />

            <button className={itemCls} onClick={() => go('/settings')}>
              <Settings size={15} className="text-zinc-500" /> {t('nav.settings')}
              <span className="ml-auto text-[11px] text-zinc-500">Ctrl ,</span>
            </button>
            <button className={itemCls} onClick={() => go('/profile')}>
              <User size={15} className="text-zinc-500" /> {t('nav.profile')}
            </button>

            <button className={itemCls} onClick={() => setLangOpen((v) => !v)}>
              <Globe size={15} className="text-zinc-500" /> {t('set.language')}
              <span className="ml-auto flex items-center gap-1 text-[11px] text-zinc-500">
                {lang === 'ru' ? 'Русский' : 'English'}
                <ChevronRight size={13} className={`transition-transform ${langOpen ? 'rotate-90' : ''}`} />
              </span>
            </button>
            {langOpen && (
              <div className="ml-3.5 border-l border-edge pl-1">
                {(['ru', 'en'] as const).map((l) => (
                  <button key={l} className={itemCls} onClick={() => pickLang(l)}>
                    {l === 'ru' ? 'Русский' : 'English'}
                    {lang === l && <Check size={14} className="ml-auto text-zinc-100" />}
                  </button>
                ))}
              </div>
            )}

            <div className="my-1 h-px bg-edge" />
            <button className={itemCls} onClick={() => go('/history')}>
              <HistoryIcon size={15} className="text-zinc-500" /> {t('nav.history')}
            </button>
            <button className={itemCls} onClick={() => go('/stats')}>
              <BarChart3 size={15} className="text-zinc-500" /> {t('nav.statistics')}
            </button>
          </div>,
          document.body
        )}
    </>
  )
}
