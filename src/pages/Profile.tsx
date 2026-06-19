import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BarChart3, Camera, ChevronRight, Heart, History as HistoryIcon, Pencil, Settings, Trash2, Tv, X } from 'lucide-react'
import Avatar from '../components/ui/Avatar'
import { useSettingsStore } from '../store/settingsStore'
import { useI18n, type TKey } from '../i18n'

type TFn = ReturnType<typeof useI18n>['t']

function QuickLink({ to, icon: Icon, label, t }: { to: string; icon: typeof Tv; label: string; t: TFn }) {
  return (
    <Link to={to} className="tile group flex items-center gap-3 px-4 py-4 text-sm font-medium text-zinc-200">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-raised text-zinc-400 transition-colors group-hover:text-zinc-100">
        <Icon size={17} />
      </span>
      {label}
      <ChevronRight size={16} className="ml-auto text-zinc-600 transition-transform group-hover:translate-x-0.5 group-hover:text-zinc-400" />
    </Link>
  )
}

export default function Profile() {
  const { t } = useI18n()
  const settings = useSettingsStore((s) => s.settings)
  const updateSettings = useSettingsStore((s) => s.update)
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')

  const name = settings?.profileName?.trim() ?? ''
  const avatar = settings?.profileAvatar || ''
  const displayName = name || 'Bard'

  const startEditName = () => { setNameDraft(name); setEditingName(true) }
  const saveName = () => { void updateSettings({ profileName: nameDraft.trim() }); setEditingName(false) }
  const changeAvatar = async () => {
    const src = await window.wist.files.pickImage()
    if (!src) return
    const saved = await window.wist.files.saveCoverFromPath(src)
    await updateSettings({ profileAvatar: saved })
  }
  const removeAvatar = () => void updateSettings({ profileAvatar: '' })

  const links: Array<{ to: string; icon: typeof Tv; key: TKey }> = [
    { to: '/stats', icon: BarChart3, key: 'nav.statistics' },
    { to: '/history', icon: HistoryIcon, key: 'nav.history' },
    { to: '/favorites', icon: Heart, key: 'nav.favorites' },
    { to: '/trash', icon: Trash2, key: 'nav.trash' },
  ]

  return (
    <div className="page">
      <div className="mx-auto max-w-3xl space-y-8">
        <header className="card overflow-hidden">
          <div className="h-24 bg-raised" />
          <div className="flex flex-wrap items-end gap-4 px-6 pb-5">
            <div className="group relative -mt-10 shrink-0">
              <button onClick={changeAvatar} title={t('profile.changeAvatar')} className="relative block rounded-full">
                <Avatar name={displayName} src={avatar} size={80} className="ring-4 ring-card" />
                <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45 opacity-0 transition-opacity group-hover:opacity-100">
                  <Camera size={20} className="text-[#fff]" />
                </span>
              </button>
              {avatar && (
                <button
                  onClick={removeAvatar}
                  title={t('profile.removeAvatar')}
                  className="absolute -right-0.5 -top-0.5 flex h-6 w-6 items-center justify-center rounded-full border border-edge bg-card text-zinc-400 shadow-[var(--card-shadow)] transition-colors hover:text-danger"
                >
                  <X size={13} />
                </button>
              )}
            </div>
            <div className="min-w-0 flex-1 pb-0.5">
              {editingName ? (
                <input
                  autoFocus
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  onBlur={saveName}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setEditingName(false) }}
                  placeholder={t('profile.namePlaceholder')}
                  maxLength={40}
                  className="input max-w-xs !text-xl !font-bold"
                />
              ) : (
                <button onClick={startEditName} title={t('profile.editName')} className="group/name inline-flex items-center gap-2">
                  <h1 className="text-2xl font-bold tracking-tight text-zinc-100">{displayName}</h1>
                  <Pencil size={14} className="text-zinc-500 opacity-0 transition-opacity group-hover/name:opacity-100" />
                </button>
              )}
              <p className="mt-0.5 text-sm text-zinc-500">{t('profile.subtitle')}</p>
            </div>
            <Link to="/settings" className="btn-ghost mb-0.5">
              <Settings size={15} /> {t('nav.settings')}
            </Link>
          </div>
        </header>

        <section>
          <h2 className="section-title">{t('profile.quickLinks')}</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {links.map((l) => (
              <QuickLink key={l.to} to={l.to} icon={l.icon} label={t(l.key)} t={t} />
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
