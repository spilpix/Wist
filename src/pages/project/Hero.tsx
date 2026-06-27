import { useRef, useState } from 'react'
import {
  ArrowLeft,
  ChevronDown,
  FolderOpen,
  GripHorizontal,
  Move,
  Pencil,
  Pin,
  Share2,
  X,
} from 'lucide-react'
import ProjectCover from '../../components/ProjectCover'
import { PROJECT_STATUS_COLORS, PROJECT_STATUSES, type Project, type ProjectStatus } from '../../types/models'
import { useI18n } from '../../i18n'

type TFn = ReturnType<typeof useI18n>['t']

const EMOJI_GRID = [
  '🚀','📱','💡','🎯','🎨','📊','🔬','🏗️','💼','📚',
  '🎬','🎵','🌐','🔐','⚡','🌿','🏆','🔧','💎','🌊',
  '🦋','🌟','🔥','🎮','📐','✈️','🏠','🎤','🌸','🤖',
  '🦊','🐉','🌙','☀️','🌈','❄️','🌀','💫','🎭','🎁',
  '🏔️','🌺','🔮','🎪','🎲','⚗️','🧬','🗺️',
]

function EmojiPicker({ onPick, onClear, onClose }: {
  onPick: (e: string) => void
  onClear: () => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  return (
    <div
      ref={ref}
      className="absolute left-0 top-[calc(100%+6px)] z-50 w-64 rounded-2xl border border-edge bg-card p-3 shadow-[var(--float-shadow)]"
    >
      <div className="grid grid-cols-8 gap-0.5">
        {EMOJI_GRID.map((emoji) => (
          <button
            key={emoji}
            onClick={() => { onPick(emoji); onClose() }}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-[18px] leading-none transition-colors hover:bg-highlight"
          >
            {emoji}
          </button>
        ))}
      </div>
      <button
        onClick={() => { onClear(); onClose() }}
        className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs text-zinc-500 hover:bg-highlight hover:text-zinc-300"
      >
        <X size={12} /> Убрать иконку
      </button>
    </div>
  )
}

const DEFAULT_COVER_H = 240
const MIN_COVER_H = 100
const MAX_COVER_H = 520

export function Hero({
  project,
  accent,
  t,
  folderPath,
  onBack,
  onEdit,
  onRename,
  onStatus,
  onPin,
  onShare,
  onOpenFolder,
  onAvatarChange,
}: {
  project: Project
  accent: string
  t: TFn
  folderPath: string | null
  onBack: () => void
  onEdit: () => void
  onRename: (name: string) => void
  onStatus: (s: ProjectStatus) => void
  onPin: () => void
  onShare: () => void
  onOpenFolder: (path: string) => void
  onAvatarChange: (icon: string | null) => void
}) {
  const [renaming, setRenaming] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [repositioning, setRepositioning] = useState(false)

  const [coverH, setCoverH] = useState<number>(() => {
    const s = localStorage.getItem(`hub:cover-h:${project.id}`)
    return s ? Math.max(MIN_COVER_H, Math.min(MAX_COVER_H, parseInt(s, 10))) : DEFAULT_COVER_H
  })
  const [coverY, setCoverY] = useState<number>(() => {
    const s = localStorage.getItem(`hub:cover-y:${project.id}`)
    return s ? Math.max(0, Math.min(100, parseFloat(s))) : 50
  })

  const isPhoto = !!project.cover_path && !project.cover_path.startsWith('gradient:')
  const wash = `linear-gradient(135deg, ${accent}cc, ${accent}55)`
  const initial = (project.name || '?')[0].toUpperCase()
  const statusColor = PROJECT_STATUS_COLORS[project.status]

  const relUpdated = (() => {
    const iso = project.updated_at?.slice(0, 10)
    if (!iso) return ''
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const days = Math.round((today.getTime() - new Date(`${iso}T00:00:00`).getTime()) / 86_400_000)
    if (days <= 0) return t('hub.today')
    if (days === 1) return t('hub.yesterday')
    return iso.split('-').reverse().join('.')
  })()

  // ── Resize ──────────────────────────────────────────────────────
  const startResize = (e: React.MouseEvent) => {
    e.preventDefault()
    const startY = e.clientY
    const startH = coverH
    const onMove = (ev: MouseEvent) => {
      setCoverH(Math.max(MIN_COVER_H, Math.min(MAX_COVER_H, startH + ev.clientY - startY)))
    }
    const onUp = (ev: MouseEvent) => {
      const finalH = Math.max(MIN_COVER_H, Math.min(MAX_COVER_H, startH + ev.clientY - startY))
      localStorage.setItem(`hub:cover-h:${project.id}`, String(finalH))
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  // ── Reposition ───────────────────────────────────────────────────
  const startRepos = (e: React.MouseEvent) => {
    e.preventDefault()
    const startY = e.clientY
    const startCoverY = coverY
    const onMove = (ev: MouseEvent) => {
      setCoverY(Math.max(0, Math.min(100, startCoverY - (ev.clientY - startY) * 0.25)))
    }
    const onUp = (ev: MouseEvent) => {
      const finalY = Math.max(0, Math.min(100, startCoverY - (ev.clientY - startY) * 0.25))
      localStorage.setItem(`hub:cover-y:${project.id}`, String(finalY))
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  return (
    <div>
      {/* ── COVER ─────────────────────────────────────────────────── */}
      {/* Clean zone: only nav back + hover actions. Nothing else pollutes the image. */}
      <div className="group/cover relative overflow-hidden" style={{ height: coverH }}>
        {project.cover_path
          ? <ProjectCover cover={project.cover_path} objectPosition={`50% ${coverY}%`} className="absolute inset-0 h-full w-full" />
          : <div className="absolute inset-0" style={{ backgroundImage: wash }} />
        }

        {/* Back nav */}
        <button
          onClick={onBack}
          className="absolute left-6 top-5 flex items-center gap-1.5 rounded-lg border border-white/15 bg-black/40 px-2.5 py-1.5 text-xs font-medium text-white/80 backdrop-blur-sm transition-colors hover:bg-black/60 hover:text-white"
        >
          <ArrowLeft size={13} /> {t('nav.projects')}
        </button>

        {/* Reposition — only visible on hover, only for real photos */}
        {isPhoto && !repositioning && (
          <button
            onClick={() => setRepositioning(true)}
            className="absolute right-6 top-5 flex items-center gap-1.5 rounded-lg border border-white/15 bg-black/40 px-2.5 py-1.5 text-xs font-medium text-white/70 opacity-0 backdrop-blur-sm transition-all group-hover/cover:opacity-100 hover:text-white"
          >
            <Move size={12} /> Переместить
          </button>
        )}

        {/* Reposition drag overlay */}
        {repositioning && (
          <div
            className="absolute inset-0 cursor-grab active:cursor-grabbing select-none"
            style={{ background: 'rgba(0,0,0,0.35)' }}
            onMouseDown={startRepos}
          >
            <div className="pointer-events-none absolute inset-x-0 bottom-8 flex justify-center">
              <span className="rounded-full bg-black/70 px-4 py-1.5 text-[13px] text-white backdrop-blur">
                Перетащи чтобы выбрать область
              </span>
            </div>
            <button
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => setRepositioning(false)}
              className="absolute right-6 top-5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-black hover:bg-zinc-100"
            >
              Готово
            </button>
          </div>
        )}

        {/* Resize handle */}
        <div
          className="absolute inset-x-0 bottom-0 flex h-6 cursor-ns-resize items-end justify-center pb-1.5 opacity-0 transition-opacity group-hover/cover:opacity-100"
          onMouseDown={startResize}
        >
          <div className="rounded-full bg-black/50 px-3 py-0.5 text-white/60 backdrop-blur-sm">
            <GripHorizontal size={13} />
          </div>
        </div>
      </div>

      {/* ── IDENTITY BAR ──────────────────────────────────────────── */}
      {/* Avatar straddles the cover seam. Title + actions are cleanly below. */}
      <div className="mx-auto max-w-6xl px-8">
        <div className="flex items-start gap-4">

          {/* Avatar — pushed up to straddle the seam */}
          <div className="relative -mt-8 flex-shrink-0">
            <button
              onClick={() => setPickerOpen((o) => !o)}
              title={t('hub.avatarPick')}
              className="grid h-16 w-16 place-items-center rounded-2xl border-2 border-bg bg-card shadow-lg transition-transform hover:scale-105"
              style={!project.icon ? { backgroundColor: `${accent}25`, borderColor: 'var(--color-bg)' } : { borderColor: 'var(--color-bg)' }}
            >
              {project.icon
                ? <span className="text-[28px] leading-none">{project.icon}</span>
                : <span className="text-2xl font-bold" style={{ color: accent }}>{initial}</span>
              }
            </button>
            {pickerOpen && (
              <EmojiPicker
                onPick={onAvatarChange}
                onClear={() => onAvatarChange(null)}
                onClose={() => setPickerOpen(false)}
              />
            )}
          </div>

          {/* Title row — starts naturally below the cover */}
          <div className="flex min-w-0 flex-1 flex-col gap-0.5 pt-3">
            <div className="flex items-center gap-2.5">
              {/* Title */}
              {renaming ? (
                <input
                  autoFocus
                  defaultValue={project.name}
                  onBlur={(e) => { onRename(e.target.value); setRenaming(false) }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                    if (e.key === 'Escape') setRenaming(false)
                  }}
                  className="input min-w-[12rem] !py-0.5 text-2xl !font-bold"
                />
              ) : (
                <h1
                  className="cursor-text truncate text-2xl font-bold leading-tight text-zinc-100 hover:text-white"
                  title={t('hub.renameHint')}
                  onClick={() => setRenaming(true)}
                >
                  {project.name}
                </h1>
              )}

              {/* Status badge */}
              <StatusMenu status={project.status} t={t} onChange={onStatus} />

              {/* Actions — pushed to far right */}
              <div className="ml-auto flex items-center gap-1">
                <ActionBtn title={t(project.pinned ? 'project.unpin' : 'project.pin')} onClick={onPin} active={!!project.pinned}>
                  <Pin size={14} className={project.pinned ? 'fill-current' : ''} />
                </ActionBtn>
                {folderPath && (
                  <ActionBtn title={t('hub.openInExplorer')} onClick={() => onOpenFolder(folderPath)}>
                    <FolderOpen size={14} />
                  </ActionBtn>
                )}
                <ActionBtn title={t('hub.share')} onClick={onShare}>
                  <Share2 size={14} />
                </ActionBtn>
                <ActionBtn title={t('common.edit')} onClick={onEdit}>
                  <Pencil size={14} />
                </ActionBtn>
              </div>
            </div>

            {/* Meta */}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] text-zinc-500">
              <span>{t('nav.hub')}</span>
              {relUpdated && (
                <>
                  <span className="text-zinc-700">·</span>
                  <span>{t('hub.updated', { x: relUpdated })}</span>
                </>
              )}
              {project.tools.slice(0, 6).map((tool) => (
                <>
                  <span key={`sep-${tool}`} className="text-zinc-700">·</span>
                  <span key={tool} className="text-zinc-400">{tool}</span>
                </>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ActionBtn({
  children, onClick, title, active,
}: {
  children: React.ReactNode
  onClick: () => void
  title: string
  active?: boolean
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`grid h-8 w-8 place-items-center rounded-lg border border-edge transition-colors hover:bg-raised hover:text-zinc-100 ${active ? 'text-zinc-200' : 'text-zinc-500'}`}
    >
      {children}
    </button>
  )
}

function StatusMenu({ status, t, onChange }: { status: ProjectStatus; t: TFn; onChange: (s: ProjectStatus) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const color = PROJECT_STATUS_COLORS[status]

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide transition-opacity hover:opacity-75"
        style={{ backgroundColor: `${color}22`, color }}
      >
        {t(`project.status.${status}` as 'project.status.active')}
        <ChevronDown size={11} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute left-0 z-30 mt-1.5 w-40 overflow-hidden rounded-xl border border-edge bg-card py-1 shadow-[var(--float-shadow)]">
            {PROJECT_STATUSES.map((s) => (
              <button
                key={s}
                onClick={() => { onChange(s); setOpen(false) }}
                className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm text-zinc-300 hover:bg-raised hover:text-white"
              >
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: PROJECT_STATUS_COLORS[s] }} />
                {t(`project.status.${s}` as 'project.status.active')}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
