import { useState } from 'react'
import { Heart, Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward, X } from 'lucide-react'
import Cover from './ui/Cover'
import Equalizer from './ui/Equalizer'
import Slider from './ui/Slider'
import Tooltip from './ui/Tooltip'
import { fmtTime, usePlayerStore } from '../store/playerStore'
import { useI18n } from '../i18n'

/**
 * The minimized player, docked inside the sidebar (above the profile). A self-
 * contained mini controller — cover · title · like · seek · transport — that
 * adapts to the sidebar width. Clicking the track opens the up-next queue inline
 * (smoothly). Only rendered while the bottom bar is collapsed (`barCollapsed`),
 * which the route handles automatically (full bar on /music, tucked elsewhere).
 */
export default function SidebarPlayer({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n()
  const current = usePlayerStore((s) => s.current)
  const barCollapsed = usePlayerStore((s) => s.barCollapsed)
  const playing = usePlayerStore((s) => s.playing)
  const shuffle = usePlayerStore((s) => s.shuffle)
  const repeat = usePlayerStore((s) => s.repeat)
  const currentTime = usePlayerStore((s) => s.currentTime)
  const duration = usePlayerStore((s) => s.duration)
  const [qOpen, setQOpen] = useState(false)

  if (!current || !barCollapsed) return null

  const p = usePlayerStore.getState()
  const dur = duration || current.duration_seconds || 0
  const frac = dur > 0 ? Math.min(1, currentTime / dur) : 0
  const queue = usePlayerStore.getState().queue
  const order = usePlayerStore.getState().order
  const pos = usePlayerStore.getState().pos
  const upNext = order.slice(pos + 1).map((qi, k) => ({ track: queue[qi], orderIndex: pos + 1 + k }))

  // ── compact icon rail (sidebar collapsed): cover toggles play + prev/next ──
  if (compact) {
    return (
      <div className="mt-1 flex w-full flex-col items-center gap-1.5 border-t border-edge pt-2">
        <button
          onClick={() => p.toggle()}
          title={`${current.title}${current.artist ? ` — ${current.artist}` : ''}`}
          className="group relative h-10 w-10 overflow-hidden rounded-lg shadow-sm"
        >
          <Cover path={current.cover_path} seed={current.album || current.title} rounded="rounded-lg" size={16} />
          <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-[#fff] opacity-0 transition-opacity group-hover:opacity-100">
            {playing ? <Pause size={16} className="fill-current" /> : <Play size={16} className="fill-current pl-0.5" />}
          </span>
          {playing && (
            <span className="absolute bottom-0.5 right-0.5 rounded bg-black/60 px-0.5 py-px transition-opacity group-hover:opacity-0">
              <Equalizer className="text-accent-bright" />
            </span>
          )}
        </button>
        <div className="h-0.5 w-9 overflow-hidden rounded-full bg-edge">
          <div className="h-full rounded-full bg-accent" style={{ width: `${frac * 100}%` }} />
        </div>
        <div className="flex items-center gap-0.5">
          <button onClick={() => p.prev()} className="flex h-6 w-6 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-highlight hover:text-zinc-100">
            <SkipBack size={13} className="fill-current" />
          </button>
          <button onClick={() => p.next()} className="flex h-6 w-6 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-highlight hover:text-zinc-100">
            <SkipForward size={13} className="fill-current" />
          </button>
        </div>
      </div>
    )
  }

  const tBtn = 'flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-highlight hover:text-zinc-100'

  return (
    <div className="px-2 pb-2 pt-2">
      {/* up-next queue — expands smoothly above the mini player */}
      <div className={`collapse-morph ${qOpen ? 'is-open' : ''}`}>
        <div>
          <div className="mb-1.5 overflow-hidden rounded-xl border border-edge bg-card">
            <div className="flex items-center justify-between px-3 pb-1 pt-2">
              <span className="text-[10.5px] font-semibold uppercase tracking-wider text-zinc-500">{t('music.upNext')}</span>
              <button onClick={() => setQOpen(false)} className="rounded p-0.5 text-zinc-500 transition-colors hover:bg-highlight hover:text-zinc-200">
                <X size={13} />
              </button>
            </div>
            <div className="max-h-56 overflow-y-auto px-1 pb-1">
              {upNext.length === 0 ? (
                <div className="px-2 py-4 text-center text-[12px] text-zinc-500">{t('music.queueEmpty')}</div>
              ) : (
                upNext.map(({ track, orderIndex }) => (
                  <div key={`${track.id}-${orderIndex}`} className="group/q flex items-center gap-2 rounded-lg px-1.5 py-1 transition-colors hover:bg-highlight">
                    <button onClick={() => p.jumpTo(orderIndex)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                      <div className="h-8 w-8 shrink-0"><Cover path={track.cover_path} seed={track.album || track.title} rounded="rounded-md" size={13} /></div>
                      <div className="min-w-0">
                        <div className="truncate text-[12px] font-medium text-zinc-200">{track.title}</div>
                        <div className="truncate text-[11px] text-zinc-500">{track.artist || t('music.unknownArtist')}</div>
                      </div>
                    </button>
                    <button
                      onClick={() => p.removeAt(orderIndex)}
                      className="hidden h-6 w-6 shrink-0 items-center justify-center rounded text-zinc-500 transition-colors hover:bg-highlight hover:text-zinc-200 group-hover/q:flex"
                    >
                      <X size={13} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* mini player card */}
      <div className="rounded-xl border border-edge bg-card p-2.5 shadow-sm">
        {/* cover + title (→ queue) + like */}
        <div className="flex items-center gap-2.5">
          <button onClick={() => setQOpen((v) => !v)} title={t('music.queue')} className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg">
            <Cover path={current.cover_path} seed={current.album || current.title} rounded="rounded-lg" size={16} />
            {playing && (
              <span className="absolute bottom-0.5 right-0.5 rounded bg-black/55 px-0.5 py-px">
                <Equalizer className="text-accent-bright" />
              </span>
            )}
          </button>
          <button onClick={() => setQOpen((v) => !v)} className="min-w-0 flex-1 text-left" title={t('music.queue')}>
            <div className="truncate text-[12.5px] font-semibold text-white">{current.title}</div>
            <div className="truncate text-[11px] text-zinc-500">{current.artist || t('music.unknownArtist')}</div>
          </button>
          <button
            onClick={() => {
              const liked = current.liked ? 0 : 1
              p.patchTrack(current.id, { liked: liked as 0 | 1 })
              window.wist.music.setLiked(current.id, !!liked).catch(() => undefined)
            }}
            className={`${tBtn} shrink-0 ${current.liked ? '!text-accent-bright' : ''}`}
          >
            <Heart size={15} className={current.liked ? 'fill-current' : ''} />
          </button>
        </div>

        {/* seek */}
        <div className="mt-2.5 flex items-center gap-1.5">
          <span className="w-8 shrink-0 text-right text-[10px] tabular-nums text-zinc-500">{fmtTime(currentTime)}</span>
          <Slider value={currentTime} max={dur} onChange={(v) => p.seek(v)} className="flex-1" ariaLabel={t('music.seek')} />
          <span className="w-8 shrink-0 text-[10px] tabular-nums text-zinc-500">{fmtTime(dur)}</span>
        </div>

        {/* transport */}
        <div className="mt-1.5 flex items-center justify-between">
          <Tooltip label={t('music.shuffle')} side="top">
            <button onClick={() => p.toggleShuffle()} className={`${tBtn} ${shuffle ? '!text-accent-bright' : ''}`}>
              <Shuffle size={14} />
            </button>
          </Tooltip>
          <button onClick={() => p.prev()} className={tBtn}>
            <SkipBack size={16} className="fill-current" />
          </button>
          <button
            onClick={() => p.toggle()}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-[#fff] transition-all duration-150 hover:bg-accent-hover active:scale-[0.97]"
          >
            {playing ? <Pause size={16} className="fill-current" /> : <Play size={16} className="fill-current pl-0.5" />}
          </button>
          <button onClick={() => p.next()} className={tBtn}>
            <SkipForward size={16} className="fill-current" />
          </button>
          <Tooltip label={t('music.repeat')} side="top">
            <button onClick={() => p.cycleRepeat()} className={`${tBtn} ${repeat !== 'off' ? '!text-accent-bright' : ''}`}>
              {repeat === 'one' ? <Repeat1 size={14} /> : <Repeat size={14} />}
            </button>
          </Tooltip>
        </div>
      </div>
    </div>
  )
}
