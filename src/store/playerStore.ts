import { create } from 'zustand'
import type { Track } from '../types/models'

export type RepeatMode = 'off' | 'all' | 'one'

// one shared audio element for the whole app (created in the renderer)
const audio = typeof Audio !== 'undefined' ? new Audio() : (null as unknown as HTMLAudioElement)

function loadVolume(): number {
  const v = Number(localStorage.getItem('wist.music.volume'))
  return Number.isFinite(v) && v >= 0 && v <= 1 ? v : 0.8
}

interface PlayerState {
  queue: Track[] // tracks in their natural order
  order: number[] // playback order (indices into queue) — shuffled when shuffle is on
  pos: number // position within `order`
  current: Track | null
  playing: boolean
  shuffle: boolean
  repeat: RepeatMode
  volume: number
  muted: boolean
  currentTime: number
  duration: number
  // actions
  playTracks: (tracks: Track[], startIndex?: number) => void
  toggle: () => void
  next: (auto?: boolean) => void
  prev: () => void
  seek: (t: number) => void
  setVolume: (v: number) => void
  toggleMute: () => void
  toggleShuffle: () => void
  cycleRepeat: () => void
  /** reflect an updated track (e.g. like toggled) into the queue + now-playing */
  patchTrack: (id: number, patch: Partial<Track>) => void
  // up-next queue management
  jumpTo: (orderIndex: number) => void
  removeAt: (orderIndex: number) => void
  addToQueue: (track: Track) => void
  playNext: (track: Track) => void
  // UI surfaces
  npOpen: boolean
  queueOpen: boolean
  barCollapsed: boolean // the docked bottom bar minimized to a small pill
  setNpOpen: (b: boolean) => void
  toggleQueue: () => void
  setBarCollapsed: (b: boolean) => void
  toggleBarCollapsed: () => void
}

function buildOrder(n: number, shuffle: boolean, startIndex: number): { order: number[]; pos: number } {
  const idx = Array.from({ length: n }, (_, i) => i)
  if (!shuffle || n <= 1) return { order: idx, pos: Math.max(0, Math.min(startIndex, n - 1)) }
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[idx[i], idx[j]] = [idx[j], idx[i]]
  }
  const p = idx.indexOf(startIndex)
  ;[idx[0], idx[p]] = [idx[p], idx[0]] // the chosen track plays first
  return { order: idx, pos: 0 }
}

// keep the OS "now playing" overlay + media keys in sync with the current track
function syncMediaSession(track: Track | null) {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
  if (!track) {
    navigator.mediaSession.metadata = null
    return
  }
  try {
    const art = track.cover_path ? [{ src: window.wist.media.fileUrl(track.cover_path), sizes: '512x512', type: 'image/png' }] : []
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist ?? '',
      album: track.album ?? '',
      artwork: art,
    })
  } catch {
    /* MediaMetadata unsupported */
  }
}

export const usePlayerStore = create<PlayerState>((set, get) => {
  function load(track: Track, play: boolean) {
    if (!audio) return
    audio.src = window.wist.media.fileUrl(track.path)
    audio.currentTime = 0
    // re-assert volume/mute so playback always matches the store (defends against drift)
    audio.muted = get().muted
    audio.volume = get().volume
    set({ current: track, currentTime: 0, duration: track.duration_seconds ?? 0 })
    if (play) audio.play().catch(() => undefined)
    window.wist.music.recordPlay(track.id).catch(() => undefined)
    syncMediaSession(track)
  }

  return {
    queue: [],
    order: [],
    pos: 0,
    current: null,
    playing: false,
    shuffle: false,
    repeat: 'off',
    volume: loadVolume(),
    muted: false,
    currentTime: 0,
    duration: 0,
    npOpen: false,
    queueOpen: false,
    barCollapsed: false,

    playTracks: (tracks, startIndex = 0) => {
      if (!tracks.length) return
      const { order, pos } = buildOrder(tracks.length, get().shuffle, startIndex)
      set({ queue: tracks, order, pos })
      load(tracks[order[pos]], true)
    },

    toggle: () => {
      const { current, playing } = get()
      if (!current || !audio) return
      if (playing) audio.pause()
      else audio.play().catch(() => undefined)
    },

    next: (auto = false) => {
      const { order, pos, queue, repeat } = get()
      if (!queue.length) return
      if (auto && repeat === 'one') {
        if (audio) {
          audio.currentTime = 0
          audio.play().catch(() => undefined)
        }
        return
      }
      let np = pos + 1
      if (np >= order.length) {
        if (repeat === 'all' || !auto) np = 0
        else {
          // reached the end of the queue on auto-advance — stop at the last track
          if (audio) audio.pause()
          set({ playing: false })
          return
        }
      }
      set({ pos: np })
      load(queue[order[np]], true)
    },

    prev: () => {
      const { order, pos, queue, repeat } = get()
      if (!queue.length || !audio) return
      if (audio.currentTime > 3) {
        audio.currentTime = 0
        return
      }
      let np = pos - 1
      if (np < 0) np = repeat === 'all' ? order.length - 1 : 0
      set({ pos: np })
      load(queue[order[np]], true)
    },

    seek: (t) => {
      if (!audio) return
      audio.currentTime = t
      set({ currentTime: t })
    },

    setVolume: (v) => {
      const vol = Math.max(0, Math.min(1, v))
      if (audio) audio.volume = vol
      try {
        localStorage.setItem('wist.music.volume', String(vol))
      } catch {
        /* storage unavailable */
      }
      set({ volume: vol, muted: vol === 0 })
    },

    toggleMute: () => {
      if (!audio) return
      const m = !get().muted
      audio.muted = m
      set({ muted: m })
    },

    toggleShuffle: () => {
      const { shuffle, order, pos, queue } = get()
      const nextShuffle = !shuffle
      if (!queue.length) {
        set({ shuffle: nextShuffle })
        return
      }
      const currentIndex = order[pos] // keep the current track playing
      const rebuilt = buildOrder(queue.length, nextShuffle, currentIndex)
      set({ shuffle: nextShuffle, order: rebuilt.order, pos: rebuilt.pos })
    },

    cycleRepeat: () => {
      const map: Record<RepeatMode, RepeatMode> = { off: 'all', all: 'one', one: 'off' }
      set({ repeat: map[get().repeat] })
    },

    patchTrack: (id, patch) => {
      set((s) => ({
        queue: s.queue.map((t) => (t.id === id ? { ...t, ...patch } : t)),
        current: s.current && s.current.id === id ? { ...s.current, ...patch } : s.current,
      }))
    },

    jumpTo: (orderIndex) => {
      const { order, queue } = get()
      if (orderIndex < 0 || orderIndex >= order.length) return
      set({ pos: orderIndex })
      load(queue[order[orderIndex]], true)
    },

    removeAt: (orderIndex) => {
      const { order, pos } = get()
      if (orderIndex === pos || orderIndex < 0 || orderIndex >= order.length) return // never drop what's playing
      const next = order.slice(0, orderIndex).concat(order.slice(orderIndex + 1))
      set({ order: next, pos: orderIndex < pos ? pos - 1 : pos })
    },

    addToQueue: (track) => {
      const { queue, order } = get()
      if (!queue.length) return get().playTracks([track], 0)
      const qi = queue.length // duplicates are fine — order references queue by index
      set({ queue: [...queue, track], order: [...order, qi] })
    },

    playNext: (track) => {
      const { queue, order, pos } = get()
      if (!queue.length) return get().playTracks([track], 0)
      const qi = queue.length
      const newOrder = order.slice()
      newOrder.splice(pos + 1, 0, qi) // inserts right after the current track
      set({ queue: [...queue, track], order: newOrder })
    },

    setNpOpen: (npOpen) => set({ npOpen }),
    toggleQueue: () => set((s) => ({ queueOpen: !s.queueOpen })),
    setBarCollapsed: (barCollapsed) => set({ barCollapsed }),
    toggleBarCollapsed: () => set((s) => ({ barCollapsed: !s.barCollapsed })),
  }
})

// wire the audio element to the store (once)
if (audio) {
  audio.volume = usePlayerStore.getState().volume
  audio.addEventListener('timeupdate', () => {
    usePlayerStore.setState({ currentTime: audio.currentTime })
    if ('mediaSession' in navigator && Number.isFinite(audio.duration)) {
      try {
        navigator.mediaSession.setPositionState({ duration: audio.duration, position: audio.currentTime, playbackRate: audio.playbackRate || 1 })
      } catch {
        /* setPositionState unsupported / bad values */
      }
    }
  })
  audio.addEventListener('play', () => {
    usePlayerStore.setState({ playing: true })
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing'
  })
  audio.addEventListener('pause', () => {
    usePlayerStore.setState({ playing: false })
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused'
  })
  audio.addEventListener('ended', () => usePlayerStore.getState().next(true))
  audio.addEventListener('loadedmetadata', () => {
    const d = audio.duration
    if (!Number.isFinite(d)) return
    usePlayerStore.setState({ duration: d })
    const cur = usePlayerStore.getState().current
    if (cur && (cur.duration_seconds == null || cur.duration_seconds === 0)) {
      usePlayerStore.getState().patchTrack(cur.id, { duration_seconds: d })
      window.wist.music.setDuration(cur.id, d).catch(() => undefined)
    }
  })

  // OS media keys + Windows "now playing" overlay
  if ('mediaSession' in navigator) {
    const ms = navigator.mediaSession
    const set = (action: MediaSessionAction, handler: (() => void) | ((d: MediaSessionActionDetails) => void)) => {
      try {
        ms.setActionHandler(action, handler as MediaSessionActionHandler)
      } catch {
        /* action unsupported on this platform */
      }
    }
    set('play', () => usePlayerStore.getState().toggle())
    set('pause', () => usePlayerStore.getState().toggle())
    set('previoustrack', () => usePlayerStore.getState().prev())
    set('nexttrack', () => usePlayerStore.getState().next())
    set('seekto', (d) => {
      const det = d as MediaSessionActionDetails
      if (det.seekTime != null) usePlayerStore.getState().seek(det.seekTime)
    })
    set('seekforward', () => usePlayerStore.getState().seek(Math.min(audio.duration || 0, audio.currentTime + 10)))
    set('seekbackward', () => usePlayerStore.getState().seek(Math.max(0, audio.currentTime - 10)))
  }
}

/** mm:ss formatter shared by the player + track lists */
export function fmtTime(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '0:00'
  const s = Math.floor(seconds)
  const m = Math.floor(s / 60)
  const r = s % 60
  if (m >= 60) {
    const h = Math.floor(m / 60)
    return `${h}:${String(m % 60).padStart(2, '0')}:${String(r).padStart(2, '0')}`
  }
  return `${m}:${String(r).padStart(2, '0')}`
}
