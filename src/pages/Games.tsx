import { useCallback, useEffect, useState } from 'react'
import { Clock, Gamepad2, ImagePlus, Pencil, Play, Plus, Trash2, X } from 'lucide-react'
import EmptyState from '../components/ui/EmptyState'
import Spinner from '../components/ui/Spinner'
import Modal from '../components/ui/Modal'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import { toast } from '../store/toastStore'
import type { Game } from '../types/models'
import { formatRelative } from '../utils/formatters'
import { useI18n } from '../i18n'

function fmtPlaytime(s: number): string {
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const rm = m % 60
  return rm ? `${h} h ${rm} min` : `${h} h`
}

const baseName = (p: string) => p.split(/[\\/]/).pop() || p

export default function Games() {
  const { t } = useI18n()
  const [games, setGames] = useState<Game[] | null>(null)
  const [running, setRunning] = useState<number[]>([])
  const [editing, setEditing] = useState<{ game: Game | null; exe: string } | null>(null)
  const [confirm, setConfirm] = useState<Game | null>(null)

  const load = useCallback(async () => {
    const [g, r] = await Promise.all([window.wist.games.list(), window.wist.games.running()])
    setGames(g)
    setRunning(r)
  }, [])

  useEffect(() => {
    load()
    return window.wist.events.onDataChanged((kind) => {
      if (kind === 'games') load()
    })
  }, [load])

  const addGame = async () => {
    const exe = await window.wist.games.pickExe()
    if (exe) setEditing({ game: null, exe })
  }

  const remove = async () => {
    if (!confirm) return
    await window.wist.games.remove(confirm.id)
    setConfirm(null)
    load()
    toast(t('game.removeTitle') + ' ✓', 'success')
  }

  if (!games) return <Spinner />

  return (
    <div className="page">
      <div className="mb-2 flex items-center justify-between">
        <h1 className="page-title !mb-0">{t('nav.games')}</h1>
        <button className="btn-accent" onClick={addGame}>
          <Plus size={16} /> {t('game.add')}
        </button>
      </div>
      <p className="mb-6 max-w-2xl text-sm text-zinc-500">{t('game.trackingHint')}</p>

      {!games.length ? (
        <EmptyState
          icon={Gamepad2}
          title={t('game.emptyTitle')}
          subtitle={t('game.emptySubtitle')}
          action={
            <button className="btn-accent" onClick={addGame}>
              <Plus size={16} /> {t('game.add')}
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {games.map((g) => (
            <GameCard
              key={g.id}
              game={g}
              running={running.includes(g.id)}
              t={t}
              onLaunch={() => window.wist.vault.open(g.exe_path)}
              onEdit={() => setEditing({ game: g, exe: g.exe_path })}
              onRemove={() => setConfirm(g)}
            />
          ))}
        </div>
      )}

      {editing && (
        <GameModal
          game={editing.game}
          initialExe={editing.exe}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            load()
          }}
        />
      )}
      {confirm && (
        <ConfirmDialog
          title={t('game.removeTitle')}
          message={t('game.removeConfirm')}
          confirmLabel={t('common.delete')}
          danger
          onConfirm={remove}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  )
}

type TFn = ReturnType<typeof useI18n>['t']

function GameCard({
  game: g,
  running,
  t,
  onLaunch,
  onEdit,
  onRemove,
}: {
  game: Game
  running: boolean
  t: TFn
  onLaunch: () => void
  onEdit: () => void
  onRemove: () => void
}) {
  return (
    <div className="tile group relative flex flex-col overflow-hidden">
      <button onClick={onLaunch} className="relative block aspect-[3/4] w-full overflow-hidden bg-raised" title={g.exe_path}>
        {g.cover_path ? (
          <img
            src={window.wist.media.fileUrl(g.cover_path)}
            alt={g.name}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.04]"
          />
        ) : (
          <span
            className="flex h-full w-full items-center justify-center"
            style={{ background: 'linear-gradient(145deg, rgb(var(--accent-rgb)/0.25), rgb(var(--accent-rgb)/0.05))' }}
          >
            <Gamepad2 size={40} className="text-accent-bright" />
          </span>
        )}
        {running && (
          <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-emerald-500/90 px-2 py-0.5 text-[10px] font-semibold text-[#fff] shadow">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> {t('game.playing')}
          </span>
        )}
        <span className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all group-hover:bg-black/30 group-hover:opacity-100">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/90 text-black">
            <Play size={20} className="ml-0.5 fill-black" />
          </span>
        </span>
      </button>

      <div className="flex min-w-0 flex-col gap-0.5 p-3">
        <div className="truncate text-sm font-semibold text-zinc-100">{g.name}</div>
        <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
          <Clock size={11} /> {g.total_seconds > 0 ? fmtPlaytime(g.total_seconds) : t('game.never')}
        </div>
        <div className="text-[11px] text-zinc-600">
          {t('game.lastPlayed')}: {g.last_played ? formatRelative(g.last_played) : t('game.never')}
        </div>
      </div>

      <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          onClick={(e) => {
            e.stopPropagation()
            onEdit()
          }}
          className="rounded-md bg-black/55 p-1.5 text-zinc-100 backdrop-blur-sm transition-colors hover:bg-black/75"
          title={t('common.edit')}
        >
          <Pencil size={13} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          className="rounded-md bg-black/55 p-1.5 text-zinc-100 backdrop-blur-sm transition-colors hover:text-red-400"
          title={t('common.delete')}
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  )
}

function GameModal({ game, initialExe, onClose, onSaved }: { game: Game | null; initialExe: string; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n()
  const [name, setName] = useState(game?.name ?? baseName(initialExe).replace(/\.exe$/i, ''))
  const [exe, setExe] = useState(game?.exe_path ?? initialExe)
  const [cover, setCover] = useState<string | null>(game?.cover_path ?? null)
  const [saving, setSaving] = useState(false)

  const pickCover = async () => {
    const src = await window.wist.files.pickImage()
    if (!src) return
    setCover(await window.wist.files.saveCoverFromPath(src))
  }
  const changeExe = async () => {
    const p = await window.wist.games.pickExe()
    if (p) setExe(p)
  }

  const save = async () => {
    if (!name.trim() || saving) return
    setSaving(true)
    try {
      if (game) await window.wist.games.update(game.id, { name: name.trim(), exe_path: exe, cover_path: cover })
      else await window.wist.games.create({ name: name.trim(), exe_path: exe, cover_path: cover })
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={game ? t('common.edit') : t('game.addTitle')} onClose={onClose} width="max-w-md">
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-zinc-400">{t('game.cover')}</label>
          {cover ? (
            <div className="relative mx-auto w-40 overflow-hidden rounded-lg border border-edge">
              <img src={window.wist.media.fileUrl(cover)} alt="" className="aspect-[3/4] w-full object-cover" />
              <div className="absolute right-2 top-2 flex gap-1">
                <button onClick={pickCover} className="rounded-md bg-black/60 p-1.5 text-zinc-100 hover:bg-black/80" title={t('project.changeCover')}>
                  <Pencil size={13} />
                </button>
                <button onClick={() => setCover(null)} className="rounded-md bg-black/60 p-1.5 text-zinc-100 hover:text-red-400" title={t('common.delete')}>
                  <X size={13} />
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={pickCover}
              className="mx-auto flex aspect-[3/4] w-40 flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-edge text-zinc-500 transition-colors hover:border-accent hover:text-zinc-300"
            >
              <ImagePlus size={22} />
              <span className="text-xs font-medium">{t('project.addCover')}</span>
            </button>
          )}
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-400">{t('game.name')}</label>
          <input
            autoFocus
            className="input"
            placeholder={t('game.namePh')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && save()}
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-400">{t('game.exe')}</label>
          <div className="flex items-center gap-2">
            <input className="input flex-1 !text-xs text-zinc-500" value={exe} readOnly />
            <button className="btn-ghost shrink-0 !py-2 text-xs" onClick={changeExe}>
              {t('game.pickExe')}
            </button>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button className="btn-ghost" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn-accent" disabled={!name.trim() || saving} onClick={save}>
            {game ? t('common.save') : t('game.add')}
          </button>
        </div>
      </div>
    </Modal>
  )
}
