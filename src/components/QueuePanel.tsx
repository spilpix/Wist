import { ListMusic, X } from 'lucide-react'
import Cover from './ui/Cover'
import Equalizer from './ui/Equalizer'
import { fmtTime, usePlayerStore } from '../store/playerStore'
import { useI18n } from '../i18n'

/** Docked right-side queue: what's playing + up next (jump / remove). */
export default function QueuePanel() {
  const { t } = useI18n()
  const queueOpen = usePlayerStore((s) => s.queueOpen)
  const barCollapsed = usePlayerStore((s) => s.barCollapsed)
  const queue = usePlayerStore((s) => s.queue)
  const order = usePlayerStore((s) => s.order)
  const pos = usePlayerStore((s) => s.pos)
  const playing = usePlayerStore((s) => s.playing)

  if (!queueOpen || barCollapsed) return null
  const current = queue[order[pos]]
  const upNext = order.slice(pos + 1).map((qi, k) => ({ track: queue[qi], orderIndex: pos + 1 + k }))

  return (
    <aside className="app-no-drag fixed right-0 top-[42px] bottom-[72px] z-[60] flex w-[340px] flex-col border-l border-edge bg-surface animate-slide-up" style={{ boxShadow: 'var(--float-shadow)' }}>
      <div className="flex h-[42px] shrink-0 items-center justify-between border-b border-edge px-4">
        <span className="text-[13px] font-semibold text-white">{t('music.queue')}</span>
        <button onClick={() => usePlayerStore.getState().toggleQueue()} className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-500 hover:bg-highlight hover:text-zinc-200">
          <X size={16} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
        {current && (
          <>
            <div className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-zinc-500">{t('music.nowPlaying')}</div>
            <div className="mb-3 flex items-center gap-3 rounded-lg bg-highlight px-2 py-1.5">
              <div className="h-10 w-10 shrink-0"><Cover path={current.cover_path} seed={current.album || current.title} rounded="rounded-lg" size={16} /></div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium text-accent-bright">{current.title}</div>
                <div className="truncate text-[12px] text-zinc-500">{current.artist || t('music.unknownArtist')}</div>
              </div>
              <Equalizer className="text-accent-bright" paused={!playing} />
            </div>
          </>
        )}
        <div className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-zinc-500">{t('music.upNext')}</div>
        {upNext.length === 0 ? (
          <div className="px-2 py-6 text-center text-[12px] text-zinc-500">{t('music.queueEmpty')}</div>
        ) : (
          upNext.map(({ track, orderIndex }) => (
            <div key={`${track.id}-${orderIndex}`} className="group flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-highlight">
              <button onClick={() => usePlayerStore.getState().jumpTo(orderIndex)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                <div className="h-10 w-10 shrink-0"><Cover path={track.cover_path} seed={track.album || track.title} rounded="rounded-lg" size={16} /></div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium text-zinc-200">{track.title}</div>
                  <div className="truncate text-[12px] text-zinc-500">{track.artist || t('music.unknownArtist')}</div>
                </div>
              </button>
              <span className="text-[11px] tabular-nums text-zinc-600 group-hover:hidden">{fmtTime(track.duration_seconds)}</span>
              <button onClick={() => usePlayerStore.getState().removeAt(orderIndex)} className="hidden h-7 w-7 items-center justify-center rounded-lg text-zinc-500 hover:bg-highlight hover:text-zinc-200 group-hover:flex">
                <X size={15} />
              </button>
            </div>
          ))
        )}
        {upNext.length === 0 && (
          <div className="mt-2 flex flex-col items-center gap-1 py-4 text-zinc-600">
            <ListMusic size={20} />
          </div>
        )}
      </div>
    </aside>
  )
}
