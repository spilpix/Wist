import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  Bookmark,
  Camera,
  Captions,
  Check,
  ChevronLeft,
  ChevronRight,
  Flag,
  Maximize,
  Minimize,
  MonitorUp,
  PictureInPicture2,
  Play,
  Pause,
  RectangleHorizontal,
  Settings,
  SkipForward,
  Sparkles,
  Volume1,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'
import type { EpisodeBundle } from '../types/api'
import CoverImage from '../components/CoverImage'
import {
  MOMENT_TAGS,
  MOMENT_TAG_COLORS,
  type Episode,
  type Moment,
  type MomentTag,
  type SubtitleTrack,
  type TitleType,
} from '../types/models'
import { useSettingsStore } from '../store/settingsStore'
import { toast } from '../store/toastStore'
import { clamp, formatTimestamp } from '../utils/formatters'
import { useI18n, t as tGlobal, type TKey, type TParams } from '../i18n'

type TFn = (key: TKey, params?: TParams) => string

const SPEED_PRESETS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]
const SPEED_MIN = 0.25
const SPEED_MAX = 2
const CAPTION_SIZES = { sm: 0.75, md: 1, lg: 1.4 } as const
type CaptionSize = keyof typeof CAPTION_SIZES
type SettingsView = 'main' | 'speed' | 'quality' | 'subs' | 'audio'

interface MomentDraft {
  dataUrl: string | null
  timestamp: number
  note: string
  tag: MomentTag | null
}

interface SeekFlash {
  dir: 'fwd' | 'back'
  key: number
}

/** Builds a smooth "most-replayed" area path from the user's saved moments. */
function heatmapPath(moments: Moment[], duration: number, w: number, h: number): string | null {
  if (!duration || moments.length === 0) return null
  const N = 96
  const sigma = Math.max(duration * 0.03, 8)
  const ys: number[] = []
  let max = 0
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * duration
    let v = 0.12 // gentle baseline so the curve always reads
    for (const m of moments) {
      const d = (t - m.timestamp_seconds) / sigma
      v += Math.exp(-d * d)
    }
    ys.push(v)
    if (v > max) max = v
  }
  const pts = ys.map((v, i) => {
    const x = (i / N) * w
    const y = h - (v / max) * h
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  return `M0,${h} L${pts.join(' L')} L${w},${h} Z`
}

export default function Player() {
  const { episodeId } = useParams()
  const epId = Number(episodeId)
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { t } = useI18n()
  const settings = useSettingsStore((s) => s.settings)
  const updateSettings = useSettingsStore((s) => s.update)

  const videoRef = useRef<HTMLVideoElement>(null)
  const previewVideoRef = useRef<HTMLVideoElement>(null)
  const previewCanvasRef = useRef<HTMLCanvasElement>(null)
  const ambientCanvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveTimer = useRef<number>(0)
  const playedSeconds = useRef(0)
  const lastTime = useRef(0)
  const sessionId = useRef<number | null>(null)
  const watchedMarked = useRef(false)
  const resumed = useRef(false)
  const lastPreviewSeek = useRef(0)
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const holdActivated = useRef(false)
  const suppressClick = useRef(false)
  const rateBeforeHold = useRef(1)
  // Web Audio graph for Stable Volume
  const audioCtxRef = useRef<AudioContext | null>(null)
  const compRef = useRef<DynamicsCompressorNode | null>(null)
  const srcNodeRef = useRef<MediaElementAudioSourceNode | null>(null)

  const [bundle, setBundle] = useState<EpisodeBundle | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [buffered, setBuffered] = useState(0)
  const [volume, setVolume] = useState(() => Number(localStorage.getItem('wist.volume') ?? 1))
  const [muted, setMuted] = useState(false)
  const [rate, setRate] = useState(1)
  const [fullscreen, setFullscreen] = useState(false)
  const [controlsVisible, setControlsVisible] = useState(true)
  const [subtitleTracks, setSubtitleTracks] = useState<SubtitleTrack[]>([])
  const [activeTrack, setActiveTrack] = useState<number>(-1)
  const [captionSize, setCaptionSize] = useState<CaptionSize>('md')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsView, setSettingsView] = useState<SettingsView>('main')
  const [moments, setMoments] = useState<Moment[]>([])
  const [draft, setDraft] = useState<MomentDraft | null>(null)
  const [nextCountdown, setNextCountdown] = useState<number | null>(null)
  const [autoPlayNext, setAutoPlayNext] = useState(true)
  const [panelOpen, setPanelOpen] = useState(true)
  const [ambient, setAmbient] = useState(true)
  const [stableVolume, setStableVolume] = useState(false)
  const [countdownMode, setCountdownMode] = useState(false)
  const [hover, setHover] = useState<{ t: number; x: number } | null>(null)
  const [videoSize, setVideoSize] = useState<{ w: number; h: number } | null>(null)
  const [pip, setPip] = useState(false)
  const [seekFlash, setSeekFlash] = useState<SeekFlash | null>(null)
  const [holdSpeed, setHoldSpeed] = useState(false)

  const { episode, title, episodes } = bundle ?? { episode: null, title: null, episodes: [] }

  const sortedEpisodes = useMemo(
    () => episodes.filter((e) => e.file_path && !e.file_path.startsWith('http')),
    [episodes]
  )
  const index = sortedEpisodes.findIndex((e) => e.id === epId)
  const prevEp = index > 0 ? sortedEpisodes[index - 1] : null
  const nextEp = index >= 0 && index < sortedEpisodes.length - 1 ? sortedEpisodes[index + 1] : null
  const isSeries = sortedEpisodes.length > 1
  const showPanel = isSeries && panelOpen && !fullscreen

  const subtitleUrls = useMemo(
    () =>
      subtitleTracks.map((t) =>
        URL.createObjectURL(new Blob([t.vtt], { type: 'text/vtt' }))
      ),
    [subtitleTracks]
  )
  useEffect(() => () => subtitleUrls.forEach((u) => URL.revokeObjectURL(u)), [subtitleUrls])

  const heatmap = useMemo(
    () => heatmapPath(moments, duration, 1000, 100),
    [moments, duration]
  )

  // ---- load episode ----
  useEffect(() => {
    watchedMarked.current = false
    resumed.current = false
    playedSeconds.current = 0
    setBundle(null)
    setError(null)
    setMoments([])
    setSubtitleTracks([])
    setNextCountdown(null)
    setDraft(null)
    setBuffered(0)
    setVideoSize(null)

    window.wist.episodes.get(epId).then(async (b) => {
      if (!b) {
        setError(tGlobal('player.notFound'))
        return
      }
      if (!b.episode.file_path || b.episode.file_path.startsWith('http')) {
        setError(tGlobal('player.noLocalFile'))
        return
      }
      setBundle(b)
      watchedMarked.current = !!b.episode.watched
      sessionId.current = await window.wist.sessions.start(b.title.id, b.episode.id)
      window.wist.moments.list({ titleId: b.title.id }).then((ms) =>
        setMoments(ms.filter((m) => m.episode_id === epId))
      )
      window.wist.media.subtitles(b.episode.file_path).then(setSubtitleTracks)
    })

    return () => {
      const v = videoRef.current
      if (v && !Number.isNaN(v.currentTime) && v.currentTime > 0) {
        window.wist.episodes.setProgress(epId, v.currentTime, v.duration || null)
      }
      if (sessionId.current) {
        window.wist.sessions.end(sessionId.current, playedSeconds.current)
        sessionId.current = null
      }
    }
  }, [epId])

  // default subtitle track + autoplay setting + series panel default
  useEffect(() => {
    if (!settings || !subtitleTracks.length) return
    const lang = settings.defaultSubtitleLang
    if (lang === 'off') {
      setActiveTrack(-1)
      return
    }
    const idx = subtitleTracks.findIndex((t) => t.lang === lang)
    setActiveTrack(idx >= 0 ? idx : -1)
  }, [subtitleTracks, settings])

  useEffect(() => {
    if (settings) setAutoPlayNext(settings.autoPlayNext)
  }, [settings])

  // apply active subtitle track + font size to the <track> cues
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const tracks = v.textTracks
    for (let i = 0; i < tracks.length; i++) {
      tracks[i].mode = i === activeTrack ? 'showing' : 'hidden'
    }
  }, [activeTrack, subtitleUrls, bundle])

  // ---- controls auto-hide ----
  const pokeControls = useCallback(() => {
    setControlsVisible(true)
    if (hideTimer.current) clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) setControlsVisible(false)
    }, 2800)
  }, [])

  useEffect(() => {
    pokeControls()
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current)
    }
  }, [pokeControls])

  // ---- ambient backdrop loop ----
  useEffect(() => {
    if (!ambient) return
    let raf = 0
    let last = 0
    const draw = (ts: number) => {
      raf = requestAnimationFrame(draw)
      if (ts - last < 140) return // ~7fps is plenty for a blurred backdrop
      last = ts
      const v = videoRef.current
      const c = ambientCanvasRef.current
      if (!v || !c || v.paused || !v.videoWidth) return
      const ctx = c.getContext('2d')
      if (!ctx) return
      try {
        ctx.drawImage(v, 0, 0, c.width, c.height)
      } catch {
        /* frame not ready */
      }
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [ambient, bundle])

  // ---- stable volume (Web Audio compressor) ----
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    if (!stableVolume) {
      // neutralise the compressor if the graph already exists
      const comp = compRef.current
      if (comp) {
        comp.threshold.value = 0
        comp.ratio.value = 1
        comp.knee.value = 0
      }
      return
    }
    try {
      if (!srcNodeRef.current) {
        const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        const ctx = new Ctx()
        const src = ctx.createMediaElementSource(v)
        const comp = ctx.createDynamicsCompressor()
        src.connect(comp)
        comp.connect(ctx.destination)
        audioCtxRef.current = ctx
        srcNodeRef.current = src
        compRef.current = comp
      }
      audioCtxRef.current?.resume().catch(() => undefined)
      const comp = compRef.current!
      comp.threshold.value = -30
      comp.knee.value = 30
      comp.ratio.value = 6
      comp.attack.value = 0.01
      comp.release.value = 0.25
    } catch {
      setStableVolume(false)
    }
  }, [stableVolume])

  // ---- video event handlers ----
  const onLoadedMetadata = () => {
    const v = videoRef.current
    if (!v || !episode) return
    setDuration(v.duration)
    setVideoSize({ w: v.videoWidth, h: v.videoHeight })
    v.volume = volume
    v.playbackRate = rate
    const t = searchParams.get('t')
    if (t && !resumed.current) {
      v.currentTime = clamp(Number(t), 0, v.duration - 1)
    } else if (
      !resumed.current &&
      episode.watch_position_seconds > 5 &&
      episode.watch_position_seconds < v.duration - 15
    ) {
      v.currentTime = episode.watch_position_seconds
    }
    resumed.current = true
    lastTime.current = v.currentTime
    v.play().catch(() => undefined)
  }

  const onTimeUpdate = () => {
    const v = videoRef.current
    if (!v || !episode) return
    const t = v.currentTime
    setCurrentTime(t)

    const delta = t - lastTime.current
    if (delta > 0 && delta < 2) playedSeconds.current += delta
    lastTime.current = t

    const nowMs = Date.now()
    if (nowMs - saveTimer.current > 5000) {
      saveTimer.current = nowMs
      window.wist.episodes.setProgress(episode.id, t, v.duration || null)
    }

    if (!watchedMarked.current && v.duration > 0 && t / v.duration >= 0.85) {
      watchedMarked.current = true
      window.wist.episodes.markWatched(episode.id, true)
    }
  }

  const onProgress = () => {
    const v = videoRef.current
    if (!v || !v.duration) return
    for (let i = v.buffered.length - 1; i >= 0; i--) {
      if (v.buffered.start(i) <= v.currentTime) {
        setBuffered(v.buffered.end(i) / v.duration)
        return
      }
    }
  }

  const onEnded = () => {
    if (!watchedMarked.current && episode) {
      watchedMarked.current = true
      window.wist.episodes.markWatched(episode.id, true)
    }
    if (autoPlayNext && nextEp) setNextCountdown(5)
  }

  useEffect(() => {
    if (nextCountdown === null) return
    if (nextCountdown <= 0) {
      setNextCountdown(null)
      if (nextEp) navigate(`/player/${nextEp.id}`, { replace: true })
      return
    }
    const t = setTimeout(() => setNextCountdown((c) => (c === null ? null : c - 1)), 1000)
    return () => clearTimeout(t)
  }, [nextCountdown, nextEp, navigate])

  // ---- actions ----
  const togglePlay = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) v.play().catch(() => undefined)
    else v.pause()
  }, [])

  const seekBy = useCallback((delta: number) => {
    const v = videoRef.current
    if (!v) return
    v.currentTime = clamp(v.currentTime + delta, 0, v.duration || 0)
    lastTime.current = v.currentTime
  }, [])

  const seekTo = useCallback((t: number) => {
    const v = videoRef.current
    if (!v) return
    v.currentTime = clamp(t, 0, v.duration || 0)
    lastTime.current = v.currentTime
  }, [])

  const setVol = (val: number) => {
    const v = clamp(val, 0, 1)
    setVolume(v)
    setMuted(false)
    if (videoRef.current) {
      videoRef.current.volume = v
      videoRef.current.muted = false
    }
    localStorage.setItem('wist.volume', String(v))
  }

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      if (videoRef.current) videoRef.current.muted = !m
      return !m
    })
  }, [])

  const setSpeed = useCallback((s: number) => {
    const v = clamp(s, SPEED_MIN, SPEED_MAX)
    setRate(v)
    if (videoRef.current) videoRef.current.playbackRate = v
  }, [])

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen()
    else containerRef.current?.requestFullscreen()
  }, [])

  useEffect(() => {
    const onFs = () => setFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])

  const togglePip = useCallback(async () => {
    const v = videoRef.current
    if (!v) return
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture()
      else await v.requestPictureInPicture()
    } catch {
      /* PiP unavailable */
    }
  }, [])

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const onEnter = () => setPip(true)
    const onLeave = () => setPip(false)
    v.addEventListener('enterpictureinpicture', onEnter)
    v.addEventListener('leavepictureinpicture', onLeave)
    return () => {
      v.removeEventListener('enterpictureinpicture', onEnter)
      v.removeEventListener('leavepictureinpicture', onLeave)
    }
  }, [bundle])

  const captureFrame = useCallback((): string | null => {
    const v = videoRef.current
    if (!v || !v.videoWidth) return null
    const canvas = document.createElement('canvas')
    canvas.width = v.videoWidth
    canvas.height = v.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    try {
      ctx.drawImage(v, 0, 0)
      return canvas.toDataURL('image/png')
    } catch {
      return null
    }
  }, [])

  const takeScreenshot = useCallback(async () => {
    if (!title || !episode) return
    const dataUrl = captureFrame()
    if (!dataUrl) {
      toast(tGlobal('player.captureFailed'), 'error')
      return
    }
    const path = await window.wist.screenshots.saveDataUrl(
      dataUrl,
      `${title.title} E${episode.episode_number}`
    )
    toast(tGlobal('player.screenshotSaved', { file: path.split(/[\\/]/).pop() ?? path }), 'success')
  }, [captureFrame, title, episode])

  const openMomentPanel = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    v.pause()
    setDraft({ dataUrl: captureFrame(), timestamp: v.currentTime, note: '', tag: null })
  }, [captureFrame])

  const saveMoment = async () => {
    if (!draft || !title || !episode) return
    const moment = await window.wist.moments.create({
      title_id: title.id,
      episode_id: episode.id,
      timestamp_seconds: draft.timestamp,
      note: draft.note.trim() || null,
      tag: draft.tag,
      screenshotDataUrl: draft.dataUrl,
      baseName: `${title.title} E${episode.episode_number} moment`,
    })
    setMoments((ms) => [moment, ...ms])
    setDraft(null)
    toast(tGlobal('player.momentSaved'), 'success')
    videoRef.current?.play().catch(() => undefined)
  }

  const cancelMoment = () => {
    setDraft(null)
    videoRef.current?.play().catch(() => undefined)
  }

  const markIntroEnd = async () => {
    if (!title || !videoRef.current) return
    const t = Math.floor(videoRef.current.currentTime)
    await window.wist.titles.setIntroEnd(title.id, t)
    setBundle((b) => (b ? { ...b, title: { ...b.title, intro_end_seconds: t } } : b))
    toast(tGlobal('player.introSet', { time: formatTimestamp(t) }), 'success')
  }

  const skipIntroVisible =
    !!settings?.skipIntroEnabled &&
    !!title?.intro_end_seconds &&
    currentTime < (title.intro_end_seconds ?? 0) &&
    currentTime > 0.5

  // ---- timeline scrubbing + hover preview ----
  const seekFromEvent = (clientX: number, el: HTMLElement) => {
    const rect = el.getBoundingClientRect()
    const ratio = clamp((clientX - rect.left) / rect.width, 0, 1)
    seekTo(ratio * duration)
  }

  const onTimelineHover = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = clamp((e.clientX - rect.left) / rect.width, 0, 1)
    const t = ratio * duration
    setHover({ t, x: e.clientX - rect.left })
    // throttle preview-frame seeking
    const pv = previewVideoRef.current
    if (pv && duration && Date.now() - lastPreviewSeek.current > 60) {
      lastPreviewSeek.current = Date.now()
      try {
        pv.currentTime = t
      } catch {
        /* not ready */
      }
    }
  }

  const onPreviewSeeked = () => {
    const pv = previewVideoRef.current
    const c = previewCanvasRef.current
    if (!pv || !c || !pv.videoWidth) return
    const ctx = c.getContext('2d')
    if (ctx) {
      try {
        ctx.drawImage(pv, 0, 0, c.width, c.height)
      } catch {
        /* frame not ready */
      }
    }
  }

  // ---- double-tap seek + hold-to-speed on the stage ----
  const flashSeek = (dir: 'fwd' | 'back') => {
    setSeekFlash({ dir, key: Date.now() })
    setTimeout(() => setSeekFlash((f) => (f && Date.now() - f.key >= 500 ? null : f)), 560)
  }

  const onStageClick = (e: React.MouseEvent) => {
    if (suppressClick.current) {
      suppressClick.current = false
      return
    }
    if (e.target !== videoRef.current) return
    if (settingsOpen) {
      setSettingsOpen(false)
      return
    }
    if (clickTimer.current) clearTimeout(clickTimer.current)
    clickTimer.current = setTimeout(() => togglePlay(), 220)
  }

  const onStageDoubleClick = (e: React.MouseEvent) => {
    if (e.target !== videoRef.current) return
    if (clickTimer.current) clearTimeout(clickTimer.current)
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const ratio = (e.clientX - rect.left) / rect.width
    if (ratio < 0.35) {
      seekBy(-10)
      flashSeek('back')
    } else if (ratio > 0.65) {
      seekBy(10)
      flashSeek('fwd')
    } else {
      toggleFullscreen()
    }
  }

  const onStagePointerDown = (e: React.PointerEvent) => {
    if (e.target !== videoRef.current || e.button !== 0) return
    holdActivated.current = false
    holdTimer.current = setTimeout(() => {
      holdActivated.current = true
      suppressClick.current = true
      rateBeforeHold.current = rate
      setSpeed(2)
      setHoldSpeed(true)
    }, 450)
  }

  const endHold = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current)
    if (holdActivated.current) {
      setSpeed(rateBeforeHold.current)
      setHoldSpeed(false)
      holdActivated.current = false
    }
  }

  // ---- keyboard shortcuts ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (draft) return
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      switch (e.key) {
        case ' ':
        case 'k':
          e.preventDefault()
          togglePlay()
          break
        case 'ArrowLeft':
          seekBy(-5)
          break
        case 'ArrowRight':
          seekBy(5)
          break
        case 'j':
          seekBy(-10)
          flashSeek('back')
          break
        case 'l':
          seekBy(10)
          flashSeek('fwd')
          break
        case 'ArrowUp':
          e.preventDefault()
          setVol(volume + 0.05)
          break
        case 'ArrowDown':
          e.preventDefault()
          setVol(volume - 0.05)
          break
        case 'f':
          toggleFullscreen()
          break
        case 'i':
          togglePip()
          break
        case 't':
          setPanelOpen((p) => !p)
          break
        case 'm':
          toggleMute()
          break
        case 'c':
          setActiveTrack((a) => (a >= 0 ? -1 : subtitleTracks.length ? 0 : -1))
          break
        case 's':
          takeScreenshot()
          break
        case 'b':
          openMomentPanel()
          break
        case '>':
          setSpeed(Math.round((rate + 0.25) * 100) / 100)
          break
        case '<':
          setSpeed(Math.round((rate - 0.25) * 100) / 100)
          break
        case 'n':
          if (nextEp) navigate(`/player/${nextEp.id}`, { replace: true })
          break
        case 'p':
          if (prevEp) navigate(`/player/${prevEp.id}`, { replace: true })
          break
        case 'Escape':
          if (!document.fullscreenElement) navigate(-1)
          break
        default:
          if (/^[0-9]$/.test(e.key) && duration) seekTo((Number(e.key) / 10) * duration)
      }
      pokeControls()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [draft, togglePlay, seekBy, seekTo, toggleFullscreen, togglePip, toggleMute, takeScreenshot, openMomentPanel, setSpeed, navigate, nextEp, prevEp, volume, rate, duration, subtitleTracks.length, pokeControls])

  // ---- render ----
  if (error) {
    return (
      <div className="force-dark flex h-full flex-col items-center justify-center gap-4 bg-black">
        <div className="text-zinc-400">{error}</div>
        <button className="btn-ghost" onClick={() => navigate(-1)}>
          <ArrowLeft size={15} /> {t('player.goBack')}
        </button>
      </div>
    )
  }

  const overlayClass = controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
  const VolIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2
  const qualityLabel = videoSize ? `${videoSize.h}p` : tGlobal('player.qualityAuto')
  const displayedTime = countdownMode
    ? `-${formatTimestamp(Math.max(0, duration - currentTime))}`
    : formatTimestamp(currentTime)

  return (
    <div className="force-dark flex h-full bg-black">
      {/* ===== video stage ===== */}
      <div
        ref={containerRef}
        className="relative flex min-w-0 flex-1 select-none items-center justify-center overflow-hidden bg-black"
        onMouseMove={pokeControls}
        onClick={onStageClick}
        onDoubleClick={onStageDoubleClick}
        onPointerDown={onStagePointerDown}
        onPointerUp={endHold}
        onPointerLeave={endHold}
        style={{ cursor: controlsVisible ? 'default' : 'none' }}
      >
        {/* ambient backdrop */}
        {ambient && (
          <canvas
            ref={ambientCanvasRef}
            width={48}
            height={27}
            className="yt-ambient pointer-events-none absolute inset-0 h-full w-full"
          />
        )}

        {episode?.file_path && (
          <video
            ref={videoRef}
            key={episode.id}
            src={window.wist.media.fileUrl(episode.file_path)}
            crossOrigin="anonymous"
            className={`relative z-[1] h-full w-full object-contain cap-${captionSize}`}
            onLoadedMetadata={onLoadedMetadata}
            onTimeUpdate={onTimeUpdate}
            onProgress={onProgress}
            onPlay={() => {
              setPlaying(true)
              pokeControls()
            }}
            onPause={() => {
              setPlaying(false)
              setControlsVisible(true)
            }}
            onEnded={onEnded}
            onError={() => setError(tGlobal('player.codecError'))}
          >
            {subtitleTracks.map((t, i) => (
              <track key={i} kind="subtitles" label={t.label} srcLang={t.lang} src={subtitleUrls[i]} />
            ))}
          </video>
        )}

        {/* hidden preview decoder for fine-scrubbing thumbnails */}
        {episode?.file_path && (
          <video
            ref={previewVideoRef}
            src={window.wist.media.fileUrl(episode.file_path)}
            crossOrigin="anonymous"
            muted
            preload="auto"
            className="pointer-events-none absolute h-px w-px opacity-0"
            onSeeked={onPreviewSeeked}
          />
        )}

        {!bundle && !error && (
          <div className="absolute inset-0 z-[2] flex items-center justify-center">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-zinc-700 border-t-accent" />
          </div>
        )}

        {/* double-tap seek ripple */}
        {seekFlash && (
          <div
            key={seekFlash.key}
            className={`animate-seek pointer-events-none absolute top-1/2 z-[3] flex h-24 w-24 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 ${
              seekFlash.dir === 'back' ? 'left-[12%]' : 'right-[12%]'
            }`}
          >
            <div className="flex flex-col items-center text-white">
              {seekFlash.dir === 'back' ? <ChevronLeft size={26} /> : <ChevronRight size={26} />}
              <span className="text-xs font-semibold">10</span>
            </div>
          </div>
        )}

        {/* hold-to-speed pill */}
        {holdSpeed && (
          <div className="pointer-events-none absolute top-6 left-1/2 z-[5] -translate-x-1/2 rounded-full bg-black/70 px-3.5 py-1.5 text-xs font-semibold text-white">
            {t('player.holdSpeed')} ▶▶
          </div>
        )}

        {/* top bar */}
        <div
          className={`pointer-events-none absolute inset-x-0 top-0 z-[4] flex items-center gap-3 bg-gradient-to-b from-black/80 to-transparent py-2 pb-10 pl-4 pr-[150px] pt-3 transition-opacity duration-300 ${overlayClass}`}
        >
          <button
            onClick={() => navigate(-1)}
            className="pointer-events-auto rounded-full p-2 text-zinc-200 transition-colors hover:bg-white/10 hover:text-white"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-semibold text-white">{title?.title}</div>
            <div className="truncate text-xs text-zinc-300">
              {episode && t('player.episodeN', { n: episode.episode_number })}
              {episode?.name ? ` · ${episode.name}` : ''}
            </div>
          </div>
        </div>

        {/* skip intro */}
        {skipIntroVisible && (
          <button
            onClick={() => seekTo(title!.intro_end_seconds!)}
            className={`absolute bottom-28 right-6 z-[5] rounded-lg border border-white/20 bg-black/70 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-accent ${overlayClass}`}
          >
            {t('player.skipIntro')}
          </button>
        )}

        {/* next episode countdown */}
        {nextCountdown !== null && nextEp && (
          <div className="absolute bottom-28 right-6 z-[5] flex items-center gap-3 rounded-xl border border-edge bg-surface/95 px-4 py-3 animate-slide-up">
            <SkipForward size={16} className="text-accent-bright" />
            <span className="text-sm text-zinc-200">{t('player.nextIn', { n: nextCountdown })}</span>
            <button className="btn-ghost !px-2.5 !py-1 text-xs" onClick={() => setNextCountdown(null)}>
              {t('common.cancel')}
            </button>
          </div>
        )}

        {/* ===== bottom controls ===== */}
        <div
          className={`absolute inset-x-0 bottom-0 z-[6] px-3 pb-2 pt-12 transition-opacity duration-300 ${overlayClass}`}
        >
          <div className="bg-gradient-to-t from-black/85 via-black/40 to-transparent absolute inset-x-0 bottom-0 -z-[1] h-32" />

          {/* timeline */}
          <div
            className="group/timeline relative mx-1 mb-1 flex h-5 cursor-pointer items-center"
            onMouseMove={onTimelineHover}
            onMouseLeave={() => setHover(null)}
            onClick={(e) => seekFromEvent(e.clientX, e.currentTarget)}
          >
            {/* heatmap — most replayed */}
            {heatmap && (
              <svg
                viewBox="0 0 1000 100"
                preserveAspectRatio="none"
                className="pointer-events-none absolute bottom-1/2 left-0 h-6 w-full opacity-0 transition-opacity duration-150 group-hover/timeline:opacity-100"
              >
                <path d={heatmap} fill="rgba(255,255,255,0.35)" />
              </svg>
            )}

            <div className="relative h-[3px] w-full rounded-full bg-white/25 transition-all group-hover/timeline:h-[5px]">
              {/* buffered */}
              <div className="absolute inset-y-0 left-0 rounded-full bg-white/35" style={{ width: `${buffered * 100}%` }} />
              {/* played */}
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-[#f00]"
                style={{ width: duration ? `${(currentTime / duration) * 100}%` : 0 }}
              />
              {/* scrubber thumb */}
              <div
                className="yt-thumb absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 scale-0 rounded-full bg-[#f00] transition-transform group-hover/timeline:scale-100"
                style={{ left: duration ? `${(currentTime / duration) * 100}%` : 0 }}
              />
              {/* moment markers */}
              {duration > 0 &&
                moments.map((m) => (
                  <button
                    key={m.id}
                    title={`${formatTimestamp(m.timestamp_seconds)}${m.note ? ` — ${m.note}` : ''}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      seekTo(m.timestamp_seconds)
                    }}
                    className="absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-1 ring-black/60"
                    style={{
                      left: `${(m.timestamp_seconds / duration) * 100}%`,
                      backgroundColor: m.tag ? MOMENT_TAG_COLORS[m.tag] : '#a888f0',
                    }}
                  />
                ))}
            </div>

            {/* fine-tuning preview tooltip */}
            {hover && duration > 0 && (
              <div
                className="pointer-events-none absolute bottom-7 z-10 -translate-x-1/2 flex flex-col items-center"
                style={{ left: clamp(hover.x, 80, (containerRef.current?.clientWidth ?? 9999) - 80) }}
              >
                <canvas
                  ref={previewCanvasRef}
                  width={160}
                  height={90}
                  className="rounded-lg border border-white/20 bg-black shadow-xl"
                />
                <span className="mt-1 rounded bg-black/80 px-1.5 py-0.5 font-mono text-[11px] text-white">
                  {formatTimestamp(hover.t)}
                </span>
              </div>
            )}
          </div>

          {/* control row */}
          <div className="flex items-center gap-1 px-1">
            {/* left cluster */}
            <button
              onClick={togglePlay}
              className="rounded-full p-2 text-white transition-transform hover:scale-110"
              title={t('player.playPause')}
            >
              {playing ? <Pause size={22} className="fill-white" /> : <Play size={22} className="fill-white" />}
            </button>
            <button
              className="rounded-full p-2 text-zinc-200 hover:text-white disabled:opacity-30"
              disabled={!nextEp}
              title={t('player.nextEp')}
              onClick={() => nextEp && navigate(`/player/${nextEp.id}`, { replace: true })}
            >
              <SkipForward size={20} className="fill-current" />
            </button>

            {/* volume — slider expands on hover */}
            <div className="group/vol flex items-center">
              <button
                className="rounded-full p-2 text-zinc-200 hover:text-white"
                title={t('player.mute')}
                onClick={toggleMute}
              >
                <VolIcon size={20} />
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.02}
                value={muted ? 0 : volume}
                onChange={(e) => setVol(Number(e.target.value))}
                title={t('player.volumeTooltip')}
                className="w-0 opacity-0 transition-all duration-200 group-hover/vol:mr-2 group-hover/vol:w-20 group-hover/vol:opacity-100"
              />
            </div>

            {/* time — click to toggle elapsed/remaining */}
            <button
              onClick={() => setCountdownMode((c) => !c)}
              className="ml-1 font-mono text-[13px] tabular-nums text-zinc-100"
            >
              {displayedTime} <span className="text-zinc-500">/</span> {formatTimestamp(duration)}
            </button>

            <div className="flex-1" />

            {/* right cluster */}
            <button
              className="rounded-full p-2 text-zinc-200 hover:text-white"
              title={t('player.saveMomentShort')}
              onClick={openMomentPanel}
            >
              <Bookmark size={19} />
            </button>
            <button
              className="rounded-full p-2 text-zinc-200 hover:text-white"
              title={t('player.screenshot')}
              onClick={takeScreenshot}
            >
              <Camera size={19} />
            </button>
            <button
              className="rounded-full p-2 text-zinc-200 hover:text-white"
              title={t('player.markIntro')}
              onClick={markIntroEnd}
            >
              <Flag size={18} />
            </button>

            {/* autoplay toggle switch */}
            <button
              className="flex items-center px-2"
              title={t('player.autoTooltip')}
              onClick={() => {
                setAutoPlayNext((v) => !v)
                updateSettings({ autoPlayNext: !autoPlayNext })
              }}
            >
              <span
                className={`relative h-3.5 w-7 rounded-full transition-colors ${autoPlayNext ? 'bg-white' : 'bg-white/30'}`}
              >
                <span
                  className={`absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-black transition-all ${autoPlayNext ? 'left-[15px]' : 'left-0.5'}`}
                />
              </span>
            </button>

            {/* captions */}
            <button
              className={`rounded-full p-2 transition-colors hover:text-white ${activeTrack >= 0 ? 'text-white' : 'text-zinc-200'}`}
              title={t('player.captions')}
              onClick={() => setActiveTrack((a) => (a >= 0 ? -1 : subtitleTracks.length ? 0 : -1))}
            >
              <Captions size={20} />
              {activeTrack >= 0 && <span className="mx-auto mt-0.5 block h-0.5 w-4 rounded-full bg-[#f00]" />}
            </button>

            {/* settings gear + nested menu */}
            <div className="relative">
              <button
                className="rounded-full p-2 text-zinc-200 hover:text-white"
                title={t('player.settings')}
                onClick={() => {
                  setSettingsOpen((v) => !v)
                  setSettingsView('main')
                }}
              >
                <Settings size={20} className="transition-transform" style={{ transform: settingsOpen ? 'rotate(30deg)' : 'none' }} />
              </button>
              {settingsOpen && (
                <SettingsMenu
                  view={settingsView}
                  setView={setSettingsView}
                  rate={rate}
                  setSpeed={setSpeed}
                  qualityLabel={qualityLabel}
                  ambient={ambient}
                  setAmbient={setAmbient}
                  stableVolume={stableVolume}
                  setStableVolume={setStableVolume}
                  subtitleTracks={subtitleTracks}
                  activeTrack={activeTrack}
                  setActiveTrack={setActiveTrack}
                  captionSize={captionSize}
                  setCaptionSize={setCaptionSize}
                  onClose={() => setSettingsOpen(false)}
                  t={t}
                />
              )}
            </div>

            {/* picture-in-picture */}
            <button
              className={`rounded-full p-2 hover:text-white ${pip ? 'text-white' : 'text-zinc-200'}`}
              title={t('player.pip')}
              onClick={togglePip}
            >
              <PictureInPicture2 size={20} />
            </button>

            {/* theater / episodes panel toggle (series only) */}
            {isSeries && (
              <button
                className={`rounded-full p-2 hover:text-white ${panelOpen ? 'text-white' : 'text-zinc-200'}`}
                title={panelOpen ? t('player.theater') : t('player.defaultView')}
                onClick={() => setPanelOpen((p) => !p)}
              >
                <RectangleHorizontal size={20} />
              </button>
            )}

            {/* open in mpv */}
            <button
              className="rounded-full p-2 text-zinc-200 hover:text-white"
              title={t('player.openMpv')}
              onClick={async () => {
                if (!episode?.file_path) return
                const res = await window.wist.shell.openInMpv(episode.file_path)
                if (!res.ok) toast(res.error ?? tGlobal('player.mpvFailed'), 'error')
              }}
            >
              <MonitorUp size={18} />
            </button>

            {/* fullscreen */}
            <button
              className="rounded-full p-2 text-zinc-200 hover:text-white"
              title={t('player.fullscreen')}
              onClick={toggleFullscreen}
            >
              {fullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
            </button>
          </div>
        </div>

        {/* moment panel */}
        {draft && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/75 animate-fade-in">
            <div className="w-full max-w-lg rounded-2xl border border-edge bg-surface p-5 animate-slide-up">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-base font-semibold text-white">{t('player.saveMoment')}</h3>
                <span className="font-mono text-sm text-accent-bright">{formatTimestamp(draft.timestamp)}</span>
              </div>
              {draft.dataUrl ? (
                <img src={draft.dataUrl} alt="frame" className="mb-4 w-full rounded-xl" />
              ) : (
                <div className="mb-4 flex aspect-video items-center justify-center rounded-xl bg-raised text-xs text-zinc-600">
                  {t('player.noFrame')}
                </div>
              )}
              <input
                autoFocus
                className="input mb-3"
                placeholder={t('player.momentPlaceholder')}
                value={draft.note}
                onChange={(e) => setDraft({ ...draft, note: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveMoment()
                  if (e.key === 'Escape') cancelMoment()
                }}
              />
              <div className="mb-5 flex gap-1.5">
                {MOMENT_TAGS.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => setDraft({ ...draft, tag: draft.tag === tag ? null : tag })}
                    className={`flex-1 rounded-full px-2 py-1.5 text-xs font-medium transition-colors ${
                      draft.tag === tag ? 'text-black' : 'bg-raised text-zinc-400 hover:text-zinc-200'
                    }`}
                    style={draft.tag === tag ? { backgroundColor: MOMENT_TAG_COLORS[tag] } : undefined}
                  >
                    {t(`tag.${tag}`)}
                  </button>
                ))}
              </div>
              <div className="flex justify-end gap-2">
                <button className="btn-ghost" onClick={cancelMoment}>
                  {t('common.cancel')}
                </button>
                <button className="btn-accent" onClick={saveMoment}>
                  <Bookmark size={14} /> {t('player.saveResume')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ===== episodes side panel (YouTube playlist style) ===== */}
      {showPanel && title && (
        <EpisodesPanel
          title={title.title}
          coverPath={title.cover_path}
          type={title.type}
          episodes={sortedEpisodes}
          currentId={epId}
          index={index}
          total={sortedEpisodes.length}
          onPick={(id) => navigate(`/player/${id}`, { replace: true })}
          onClose={() => setPanelOpen(false)}
          t={t}
        />
      )}
    </div>
  )
}

// ---------- episodes side panel ----------
interface PanelProps {
  title: string
  coverPath: string | null
  type: TitleType
  episodes: Episode[]
  currentId: number
  index: number
  total: number
  onPick: (id: number) => void
  onClose: () => void
  t: TFn
}

function EpisodesPanel({ title, coverPath, type, episodes, currentId, index, total, onPick, onClose, t }: PanelProps) {
  return (
    <aside className="flex w-[400px] shrink-0 flex-col border-l border-edge/60 bg-surface">
      <div className="flex items-start justify-between gap-2 border-b border-edge/60 p-4">
        <div className="min-w-0">
          <div className="truncate text-[15px] font-semibold text-white">{title}</div>
          <div className="mt-0.5 text-xs text-zinc-400">
            {t('player.nowPlaying')} · {index + 1} / {total}
          </div>
        </div>
        <button
          onClick={onClose}
          className="shrink-0 rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-raised hover:text-zinc-200"
          title={t('player.hideEpisodes')}
        >
          <X size={16} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {episodes.map((ep, i) => {
          const active = ep.id === currentId
          return (
            <button
              key={ep.id}
              onClick={() => onPick(ep.id)}
              className={`group flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors ${
                active ? 'bg-accent/15' : 'hover:bg-raised'
              }`}
            >
              <span className="w-5 shrink-0 text-center text-xs tabular-nums text-zinc-500">
                {active ? <Sparkles size={13} className="mx-auto text-accent-bright" /> : i + 1}
              </span>
              <div className="relative h-[52px] w-[92px] shrink-0 overflow-hidden rounded-lg bg-raised">
                <CoverImage
                  coverPath={coverPath}
                  title={title}
                  type={type}
                  className="h-full w-full"
                  iconSize={20}
                />
                {ep.duration_seconds ? (
                  <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1 text-[10px] font-medium text-white">
                    {formatTimestamp(ep.duration_seconds)}
                  </span>
                ) : null}
                {ep.watched ? (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/40">
                    <Check size={18} className="text-white" />
                  </span>
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <div className={`truncate text-[13px] font-medium ${active ? 'text-accent-bright' : 'text-zinc-200'}`}>
                  {ep.name || t('player.episodeN', { n: ep.episode_number })}
                </div>
                <div className="truncate text-[11px] text-zinc-500">
                  {t('player.episodeN', { n: ep.episode_number })}
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </aside>
  )
}

// ---------- settings menu ----------
interface MenuProps {
  view: SettingsView
  setView: (v: SettingsView) => void
  rate: number
  setSpeed: (n: number) => void
  qualityLabel: string
  ambient: boolean
  setAmbient: (v: boolean) => void
  stableVolume: boolean
  setStableVolume: (v: boolean) => void
  subtitleTracks: SubtitleTrack[]
  activeTrack: number
  setActiveTrack: (i: number) => void
  captionSize: CaptionSize
  setCaptionSize: (s: CaptionSize) => void
  onClose: () => void
  t: TFn
}

function MenuRow({
  label,
  value,
  onClick,
  arrow,
}: {
  label: string
  value?: string
  onClick: () => void
  arrow?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center justify-between gap-4 rounded-lg px-3 py-2 text-left text-[13px] text-zinc-200 transition-colors hover:bg-white/10"
    >
      <span>{label}</span>
      <span className="flex items-center gap-1.5 text-zinc-400">
        {value}
        {arrow && <ChevronRight size={14} />}
      </span>
    </button>
  )
}

function Toggle({ on }: { on: boolean }) {
  return (
    <span className={`relative h-3.5 w-7 rounded-full transition-colors ${on ? 'bg-accent' : 'bg-white/25'}`}>
      <span
        className={`absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-white transition-all ${on ? 'left-[15px]' : 'left-0.5'}`}
      />
    </span>
  )
}

function SettingsMenu(props: MenuProps) {
  const { view, setView, rate, setSpeed, qualityLabel, ambient, setAmbient, stableVolume, setStableVolume, subtitleTracks, activeTrack, setActiveTrack, captionSize, setCaptionSize, t } = props
  const speedLabel = rate === 1 ? t('player.normal') : `${rate}×`
  const subLabel = activeTrack >= 0 ? subtitleTracks[activeTrack]?.label ?? '' : t('common.off')

  return (
    <div className="yt-menu absolute bottom-full right-0 mb-3 w-64 overflow-hidden rounded-xl py-1.5 text-white shadow-2xl animate-scale-in">
      {view === 'main' && (
        <div className="px-1.5">
          <button
            onClick={() => setAmbient(!ambient)}
            className="flex w-full items-center justify-between gap-4 rounded-lg px-3 py-2 text-left text-[13px] text-zinc-200 transition-colors hover:bg-white/10"
          >
            <span>{t('player.ambient')}</span>
            <Toggle on={ambient} />
          </button>
          <button
            onClick={() => setStableVolume(!stableVolume)}
            className="flex w-full items-center justify-between gap-4 rounded-lg px-3 py-2 text-left text-[13px] text-zinc-200 transition-colors hover:bg-white/10"
          >
            <span>{t('player.stableVolume')}</span>
            <Toggle on={stableVolume} />
          </button>
          <div className="my-1 h-px bg-white/10" />
          <MenuRow label={t('player.playbackSpeed')} value={speedLabel} arrow onClick={() => setView('speed')} />
          <MenuRow label={t('player.quality')} value={qualityLabel} arrow onClick={() => setView('quality')} />
          <MenuRow label={t('player.captions')} value={subLabel} arrow onClick={() => setView('subs')} />
        </div>
      )}

      {view === 'speed' && (
        <div className="px-1.5">
          <button onClick={() => setView('main')} className="mb-1 flex w-full items-center gap-2 border-b border-white/10 px-2 py-1.5 text-[13px] font-medium">
            <ChevronLeft size={15} /> {t('player.playbackSpeed')}
          </button>
          <div className="px-3 py-2">
            <input
              type="range"
              min={SPEED_MIN}
              max={SPEED_MAX}
              step={0.05}
              value={rate}
              onChange={(e) => setSpeed(Number(e.target.value))}
              className="w-full"
            />
            <div className="mt-1 text-center font-mono text-sm">{rate}×</div>
          </div>
          <div className="grid grid-cols-4 gap-1 px-2 pb-1">
            {SPEED_PRESETS.map((s) => (
              <button
                key={s}
                onClick={() => setSpeed(s)}
                className={`rounded-md py-1 text-xs transition-colors ${s === rate ? 'bg-accent text-white' : 'bg-white/10 hover:bg-white/20'}`}
              >
                {s === 1 ? t('player.normal') : `${s}×`}
              </button>
            ))}
          </div>
        </div>
      )}

      {view === 'quality' && (
        <div className="px-1.5">
          <button onClick={() => setView('main')} className="mb-1 flex w-full items-center gap-2 border-b border-white/10 px-2 py-1.5 text-[13px] font-medium">
            <ChevronLeft size={15} /> {t('player.quality')}
          </button>
          {[t('player.qualityAuto'), `${qualityLabel} (${t('player.source')})`].map((label, i) => (
            <button
              key={label}
              onClick={() => props.onClose()}
              className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[13px] hover:bg-white/10"
            >
              {label}
              {i === 0 && <Check size={15} className="text-accent-bright" />}
            </button>
          ))}
        </div>
      )}

      {view === 'subs' && (
        <div className="px-1.5">
          <button onClick={() => setView('main')} className="mb-1 flex w-full items-center gap-2 border-b border-white/10 px-2 py-1.5 text-[13px] font-medium">
            <ChevronLeft size={15} /> {t('player.captions')}
          </button>
          <button
            onClick={() => setActiveTrack(-1)}
            className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[13px] hover:bg-white/10"
          >
            {t('common.off')}
            {activeTrack === -1 && <Check size={15} className="text-accent-bright" />}
          </button>
          {subtitleTracks.map((tr, i) => (
            <button
              key={i}
              onClick={() => setActiveTrack(i)}
              className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-[13px] hover:bg-white/10"
            >
              <span className="truncate">{tr.label}</span>
              {activeTrack === i && <Check size={15} className="shrink-0 text-accent-bright" />}
            </button>
          ))}
          {!subtitleTracks.length && (
            <div className="px-3 py-2 text-xs text-zinc-500">{t('player.noSubs')}</div>
          )}
          <div className="my-1 h-px bg-white/10" />
          <div className="px-3 py-1 text-[11px] uppercase tracking-wide text-zinc-500">{t('player.fontSize')}</div>
          <div className="grid grid-cols-3 gap-1 px-2 pb-1">
            {(['sm', 'md', 'lg'] as CaptionSize[]).map((s) => (
              <button
                key={s}
                onClick={() => setCaptionSize(s)}
                className={`rounded-md py-1 text-xs transition-colors ${s === captionSize ? 'bg-accent text-white' : 'bg-white/10 hover:bg-white/20'}`}
              >
                {s === 'sm' ? t('player.fontSmall') : s === 'md' ? t('player.fontNormal') : t('player.fontLarge')}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
