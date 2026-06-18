import { ChevronDown, Heart, ListMusic, Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward, Volume1, Volume2, VolumeX } from 'lucide-react'
import Slider from './ui/Slider'
import Cover, { coverUrl, gradientFor } from './ui/Cover'
import { fmtTime, usePlayerStore } from '../store/playerStore'
import { useI18n } from '../i18n'

/** Immersive full-screen "now playing" — big art, big controls, blurred cover backdrop. */
export default function NowPlaying() {
  const { t } = useI18n()
  const npOpen = usePlayerStore((s) => s.npOpen)
  const current = usePlayerStore((s) => s.current)
  const playing = usePlayerStore((s) => s.playing)
  const shuffle = usePlayerStore((s) => s.shuffle)
  const repeat = usePlayerStore((s) => s.repeat)
  const currentTime = usePlayerStore((s) => s.currentTime)
  const duration = usePlayerStore((s) => s.duration)
  const volume = usePlayerStore((s) => s.volume)
  const muted = usePlayerStore((s) => s.muted)

  if (!npOpen || !current) return null
  const dur = duration || current.duration_seconds || 0
  const url = coverUrl(current.cover_path)
  const VolIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2
  const ctrl = 'flex h-11 w-11 items-center justify-center rounded-lg text-zinc-300 transition-colors hover:bg-highlight hover:text-zinc-100'

  const toggleLike = () => {
    const liked = current.liked ? 0 : 1
    usePlayerStore.getState().patchTrack(current.id, { liked: liked as 0 | 1 })
    window.wist.music.setLiked(current.id, !!liked).catch(() => undefined)
  }

  return (
    <div className="app-no-drag fixed inset-0 z-50 overflow-hidden bg-bg animate-fade-in">
      {/* blurred cover backdrop */}
      <div
        className="absolute inset-0 scale-125 opacity-40 blur-3xl"
        style={url ? { backgroundImage: `url(${url})`, backgroundSize: 'cover', backgroundPosition: 'center' } : { background: gradientFor(current.album || current.title) }}
      />
      <div className="absolute inset-0 bg-bg/80" />

      {/* content */}
      <div className="relative flex h-full flex-col items-center px-6 py-5">
        <div className="flex w-full max-w-3xl items-center justify-between">
          <button onClick={() => usePlayerStore.getState().setNpOpen(false)} className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 hover:bg-highlight hover:text-zinc-100" title={t('music.collapse')}>
            <ChevronDown size={22} />
          </button>
          <span className="text-[12px] font-semibold uppercase tracking-wider text-zinc-500">{t('music.nowPlaying')}</span>
          <button onClick={() => usePlayerStore.getState().toggleQueue()} className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 hover:bg-highlight hover:text-zinc-100" title={t('music.queue')}>
            <ListMusic size={20} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-7 py-6">
          <div className="aspect-square w-[min(46vh,420px)] overflow-hidden rounded-xl" style={{ boxShadow: 'var(--float-shadow)' }}>
            <Cover path={current.cover_path} seed={current.album || current.title} rounded="rounded-xl" size={80} />
          </div>
          <div className="w-[min(46vh,420px)] text-center">
            <h2 className="truncate text-[1.7rem] font-bold tracking-tight text-white">{current.title}</h2>
            <div className="mt-1 truncate text-[15px] text-zinc-400">{current.artist || t('music.unknownArtist')}</div>
            {current.album && <div className="mt-0.5 truncate text-[13px] text-zinc-500">{current.album}</div>}
          </div>
        </div>

        {/* seek + controls */}
        <div className="w-full max-w-xl pb-2">
          <div className="flex items-center gap-3">
            <span className="w-10 text-right text-[12px] tabular-nums text-zinc-500">{fmtTime(currentTime)}</span>
            <Slider value={currentTime} max={dur} onChange={(v) => usePlayerStore.getState().seek(v)} className="flex-1" big ariaLabel={t('music.seek')} />
            <span className="w-10 text-[12px] tabular-nums text-zinc-500">{fmtTime(dur)}</span>
          </div>
          <div className="mt-3 flex items-center justify-center gap-3">
            <button onClick={() => usePlayerStore.getState().toggleShuffle()} className={`${ctrl} ${shuffle ? '!text-accent-bright' : ''}`} title={t('music.shuffle')}>
              <Shuffle size={19} />
            </button>
            <button onClick={() => usePlayerStore.getState().prev()} className={ctrl} title={t('music.prev')}>
              <SkipBack size={22} className="fill-current" />
            </button>
            <button onClick={() => usePlayerStore.getState().toggle()} className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-[#fff] transition-all duration-150 hover:bg-accent-hover active:scale-[0.97]">
              {playing ? <Pause size={24} className="fill-current" /> : <Play size={24} className="fill-current pl-0.5" />}
            </button>
            <button onClick={() => usePlayerStore.getState().next()} className={ctrl} title={t('music.next')}>
              <SkipForward size={22} className="fill-current" />
            </button>
            <button onClick={() => usePlayerStore.getState().cycleRepeat()} className={`${ctrl} ${repeat !== 'off' ? '!text-accent-bright' : ''}`} title={t('music.repeat')}>
              {repeat === 'one' ? <Repeat1 size={19} /> : <Repeat size={19} />}
            </button>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <button onClick={toggleLike} className={`${ctrl} ${current.liked ? '!text-accent-bright' : ''}`} title={t('music.like')}>
              <Heart size={18} className={current.liked ? 'fill-current' : ''} />
            </button>
            <div className="flex items-center gap-2">
              <button onClick={() => usePlayerStore.getState().toggleMute()} className="text-zinc-400 hover:text-zinc-200"><VolIcon size={18} /></button>
              <Slider value={muted ? 0 : volume} max={1} onChange={(v) => usePlayerStore.getState().setVolume(v)} className="w-28" ariaLabel={t('music.volume')} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
