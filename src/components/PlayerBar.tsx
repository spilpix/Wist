import { useEffect } from 'react'
import {
  Heart,
  ListMusic,
  Music as MusicIcon,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume1,
  Volume2,
  VolumeX,
} from 'lucide-react'
import Tooltip from './ui/Tooltip'
import Slider from './ui/Slider'
import QueuePanel from './QueuePanel'
import { fmtTime, usePlayerStore } from '../store/playerStore'
import { useI18n } from '../i18n'

export default function PlayerBar() {
  const { t } = useI18n()
  const current = usePlayerStore((s) => s.current)
  const playing = usePlayerStore((s) => s.playing)
  const shuffle = usePlayerStore((s) => s.shuffle)
  const repeat = usePlayerStore((s) => s.repeat)
  const currentTime = usePlayerStore((s) => s.currentTime)
  const duration = usePlayerStore((s) => s.duration)
  const volume = usePlayerStore((s) => s.volume)
  const muted = usePlayerStore((s) => s.muted)
  const queueOpen = usePlayerStore((s) => s.queueOpen)
  const barCollapsed = usePlayerStore((s) => s.barCollapsed)

  // Space toggles play/pause (unless typing); active whenever a track is loaded
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      const el = e.target as HTMLElement | null
      if (el?.isContentEditable || /^(input|textarea|select|button)$/i.test(el?.tagName ?? '')) return
      e.preventDefault()
      usePlayerStore.getState().toggle()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!current) return null // no layout footprint until something is playing

  const dur = duration || current.duration_seconds || 0
  const VolIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2

  const toggleLike = () => {
    const liked = current.liked ? 0 : 1
    usePlayerStore.getState().patchTrack(current.id, { liked: liked as 0 | 1 })
    window.wist.music.setLiked(current.id, !!liked).catch(() => undefined)
  }

  const ctrlBtn = 'app-no-drag flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-highlight hover:text-zinc-100'

  return (
    <>
      <QueuePanel />
      {/* when minimized the player lives inside the sidebar (SidebarPlayer); the docked bar hides */}
      {!barCollapsed && (
      <footer className="flex h-[72px] shrink-0 items-center gap-4 border-t border-edge bg-surface px-4">
        {/* left — now playing (art · title · like) */}
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-raised">
            {current.cover_path ? (
              <img src={window.wist.media.fileUrl(current.cover_path)} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-zinc-600"><MusicIcon size={20} /></div>
            )}
          </div>
          <div className="min-w-0">
            <div className="truncate text-[13px] font-semibold text-white">{current.title}</div>
            <div className="truncate text-[12px] text-zinc-500">{current.artist || t('music.unknownArtist')}</div>
          </div>
          <Tooltip label={t('music.like')} side="top">
            <button onClick={toggleLike} className={`${ctrlBtn} shrink-0 ${current.liked ? '!text-accent-bright' : ''}`}>
              <Heart size={16} className={current.liked ? 'fill-current' : ''} />
            </button>
          </Tooltip>
        </div>

        {/* center — transport + seek */}
        <div className="flex w-[40%] max-w-[520px] flex-col items-center gap-1">
          <div className="flex items-center gap-2">
            <Tooltip label={t('music.shuffle')} side="top">
              <button onClick={() => usePlayerStore.getState().toggleShuffle()} className={`${ctrlBtn} ${shuffle ? '!text-accent-bright' : ''}`}>
                <Shuffle size={16} />
              </button>
            </Tooltip>
            <Tooltip label={t('music.prev')} side="top">
              <button onClick={() => usePlayerStore.getState().prev()} className={ctrlBtn}>
                <SkipBack size={18} className="fill-current" />
              </button>
            </Tooltip>
            <button
              onClick={() => usePlayerStore.getState().toggle()}
              className="app-no-drag flex h-9 w-9 items-center justify-center rounded-full bg-accent text-[#fff] transition-all duration-150 hover:bg-accent-hover active:scale-[0.97]"
            >
              {playing ? <Pause size={18} className="fill-current" /> : <Play size={18} className="fill-current pl-0.5" />}
            </button>
            <Tooltip label={t('music.next')} side="top">
              <button onClick={() => usePlayerStore.getState().next()} className={ctrlBtn}>
                <SkipForward size={18} className="fill-current" />
              </button>
            </Tooltip>
            <Tooltip label={t('music.repeat')} side="top">
              <button onClick={() => usePlayerStore.getState().cycleRepeat()} className={`${ctrlBtn} ${repeat !== 'off' ? '!text-accent-bright' : ''}`}>
                {repeat === 'one' ? <Repeat1 size={16} /> : <Repeat size={16} />}
              </button>
            </Tooltip>
          </div>
          <div className="flex w-full items-center gap-2">
            <span className="w-10 shrink-0 text-right text-[11px] tabular-nums text-zinc-500">{fmtTime(currentTime)}</span>
            <Slider value={currentTime} max={dur} onChange={(v) => usePlayerStore.getState().seek(v)} className="flex-1" ariaLabel={t('music.seek')} />
            <span className="w-10 shrink-0 text-[11px] tabular-nums text-zinc-500">{fmtTime(dur)}</span>
          </div>
        </div>

        {/* right — queue + volume */}
        <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
          <Tooltip label={t('music.queue')} side="top">
            <button onClick={() => usePlayerStore.getState().toggleQueue()} className={`${ctrlBtn} ${queueOpen ? '!text-accent-bright' : ''}`}>
              <ListMusic size={17} />
            </button>
          </Tooltip>
          <button onClick={() => usePlayerStore.getState().toggleMute()} className={ctrlBtn}>
            <VolIcon size={17} />
          </button>
          <Slider value={muted ? 0 : volume} max={1} onChange={(v) => usePlayerStore.getState().setVolume(v)} className="w-24" ariaLabel={t('music.volume')} />
        </div>
      </footer>
      )}
    </>
  )
}
