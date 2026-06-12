import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  Bookmark,
  Camera,
  ChevronLeft,
  ChevronRight,
  FastForward,
  Flag,
  Maximize,
  Minimize,
  MonitorUp,
  Pause,
  Play,
  Rewind,
  SkipForward,
  Subtitles,
  Volume2,
  VolumeX,
} from 'lucide-react'
import type { EpisodeBundle } from '../types/api'
import {
  MOMENT_TAGS,
  MOMENT_TAG_COLORS,
  type Moment,
  type MomentTag,
  type SubtitleTrack,
} from '../types/models'
import { useSettingsStore } from '../store/settingsStore'
import { toast } from '../store/toastStore'
import { clamp, formatTimestamp } from '../utils/formatters'
import { useI18n, t as tGlobal } from '../i18n'

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]

interface MomentDraft {
  dataUrl: string | null
  timestamp: number
  note: string
  tag: MomentTag | null
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
  const containerRef = useRef<HTMLDivElement>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveTimer = useRef<number>(0)
  const playedSeconds = useRef(0)
  const lastTime = useRef(0)
  const sessionId = useRef<number | null>(null)
  const watchedMarked = useRef(false)
  const resumed = useRef(false)

  const [bundle, setBundle] = useState<EpisodeBundle | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(() => Number(localStorage.getItem('wist.volume') ?? 1))
  const [muted, setMuted] = useState(false)
  const [rate, setRate] = useState(1)
  const [fullscreen, setFullscreen] = useState(false)
  const [controlsVisible, setControlsVisible] = useState(true)
  const [subtitleTracks, setSubtitleTracks] = useState<SubtitleTrack[]>([])
  const [activeTrack, setActiveTrack] = useState<number>(-1)
  const [subsMenuOpen, setSubsMenuOpen] = useState(false)
  const [speedMenuOpen, setSpeedMenuOpen] = useState(false)
  const [moments, setMoments] = useState<Moment[]>([])
  const [draft, setDraft] = useState<MomentDraft | null>(null)
  const [nextCountdown, setNextCountdown] = useState<number | null>(null)
  const [autoPlayNext, setAutoPlayNext] = useState(true)

  const { episode, title, episodes } = bundle ?? { episode: null, title: null, episodes: [] }

  const sortedEpisodes = useMemo(
    () => episodes.filter((e) => e.file_path && !e.file_path.startsWith('http')),
    [episodes]
  )
  const index = sortedEpisodes.findIndex((e) => e.id === epId)
  const prevEp = index > 0 ? sortedEpisodes[index - 1] : null
  const nextEp = index >= 0 && index < sortedEpisodes.length - 1 ? sortedEpisodes[index + 1] : null

  const subtitleUrls = useMemo(
    () =>
      subtitleTracks.map((t) =>
        URL.createObjectURL(new Blob([t.vtt], { type: 'text/vtt' }))
      ),
    [subtitleTracks]
  )
  useEffect(() => () => subtitleUrls.forEach((u) => URL.revokeObjectURL(u)), [subtitleUrls])

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
      // persist position + close session on unmount / episode switch
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

  // pick default subtitle track once tracks are known
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

  // apply active subtitle track to the <track> elements
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

  // ---- video event handlers ----
  const onLoadedMetadata = () => {
    const v = videoRef.current
    if (!v || !episode) return
    setDuration(v.duration)
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

    // accumulate real watch time (ignore seeks)
    const delta = t - lastTime.current
    if (delta > 0 && delta < 2) playedSeconds.current += delta
    lastTime.current = t

    // throttled position save
    const nowMs = Date.now()
    if (nowMs - saveTimer.current > 5000) {
      saveTimer.current = nowMs
      window.wist.episodes.setProgress(episode.id, t, v.duration || null)
    }

    // auto-mark watched at 85%
    if (!watchedMarked.current && v.duration > 0 && t / v.duration >= 0.85) {
      watchedMarked.current = true
      window.wist.episodes.markWatched(episode.id, true)
    }
  }

  const onEnded = () => {
    if (!watchedMarked.current && episode) {
      watchedMarked.current = true
      window.wist.episodes.markWatched(episode.id, true)
    }
    if (autoPlayNext && nextEp) setNextCountdown(5)
  }

  // next-episode countdown
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

  const setSpeed = (s: number) => {
    setRate(s)
    if (videoRef.current) videoRef.current.playbackRate = s
    setSpeedMenuOpen(false)
  }

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen()
    } else {
      containerRef.current?.requestFullscreen()
    }
  }, [])

  useEffect(() => {
    const onFs = () => setFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])

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
    setDraft({
      dataUrl: captureFrame(),
      timestamp: v.currentTime,
      note: '',
      tag: null,
    })
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

  // ---- keyboard shortcuts ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (draft) return // moment panel has its own inputs
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      switch (e.key) {
        case ' ':
        case 'k':
          e.preventDefault()
          togglePlay()
          break
        case 'ArrowLeft':
          seekBy(-10)
          break
        case 'ArrowRight':
          seekBy(10)
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
        case 'm':
          toggleMute()
          break
        case 's':
          takeScreenshot()
          break
        case 'b':
          openMomentPanel()
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
      }
      pokeControls()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [draft, togglePlay, seekBy, toggleFullscreen, toggleMute, takeScreenshot, openMomentPanel, navigate, nextEp, prevEp, volume, pokeControls])

  // ---- render ----
  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-black">
        <div className="text-zinc-400">{error}</div>
        <button className="btn-ghost" onClick={() => navigate(-1)}>
          <ArrowLeft size={15} /> {t('player.goBack')}
        </button>
      </div>
    )
  }

  const overlayClass = controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'

  return (
    <div
      ref={containerRef}
      className="relative flex h-full select-none items-center justify-center overflow-hidden bg-black"
      onMouseMove={pokeControls}
      onClick={(e) => {
        if (e.target === videoRef.current) togglePlay()
      }}
      onDoubleClick={(e) => {
        if (e.target === videoRef.current) toggleFullscreen()
      }}
      style={{ cursor: controlsVisible ? 'default' : 'none' }}
    >
      {episode?.file_path && (
        <video
          ref={videoRef}
          key={episode.id}
          src={window.wist.media.fileUrl(episode.file_path)}
          crossOrigin="anonymous"
          className="h-full w-full object-contain"
          onLoadedMetadata={onLoadedMetadata}
          onTimeUpdate={onTimeUpdate}
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

      {!bundle && !error && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-zinc-700 border-t-accent" />
        </div>
      )}

      {/* top bar */}
      <div
        className={`absolute inset-x-0 top-0 flex items-center gap-3 bg-gradient-to-b from-black/85 to-transparent px-5 pb-10 pt-4 transition-opacity duration-300 ${overlayClass}`}
      >
        <button
          onClick={() => navigate(-1)}
          className="rounded-lg p-2 text-zinc-300 transition-colors hover:bg-white/10 hover:text-white"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-white">{title?.title}</div>
          <div className="truncate text-xs text-zinc-400">
            {episode && t('player.episodeN', { n: episode.episode_number })}
            {episode?.name ? ` · ${episode.name}` : ''}
          </div>
        </div>
        <button
          onClick={openMomentPanel}
          className="flex items-center gap-2 rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/80"
        >
          <Bookmark size={15} /> {t('player.saveMoment')}
        </button>
      </div>

      {/* skip intro */}
      {skipIntroVisible && (
        <button
          onClick={() => seekTo(title!.intro_end_seconds!)}
          className={`absolute bottom-32 right-6 rounded-lg border border-white/20 bg-black/70 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-accent ${overlayClass}`}
        >
          {t('player.skipIntro')}
        </button>
      )}

      {/* next episode countdown */}
      {nextCountdown !== null && nextEp && (
        <div className="absolute bottom-32 right-6 flex items-center gap-3 rounded-xl border border-edge bg-surface/95 px-4 py-3 animate-slide-up">
          <SkipForward size={16} className="text-accent-bright" />
          <span className="text-sm text-zinc-200">
            {t('player.nextIn', { n: nextCountdown })}
          </span>
          <button className="btn-ghost !px-2.5 !py-1 text-xs" onClick={() => setNextCountdown(null)}>
            {t('common.cancel')}
          </button>
        </div>
      )}

      {/* bottom controls */}
      <div
        className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent px-5 pb-4 pt-12 transition-opacity duration-300 ${overlayClass}`}
      >
        {/* timeline */}
        <div
          className="group/timeline relative mb-3 h-4 cursor-pointer"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect()
            seekTo(((e.clientX - rect.left) / rect.width) * duration)
          }}
        >
          <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-white/20 transition-all group-hover/timeline:h-1.5">
            <div
              className="h-full rounded-full bg-accent"
              style={{ width: duration ? `${(currentTime / duration) * 100}%` : 0 }}
            />
          </div>
          {/* moment dots */}
          {duration > 0 &&
            moments.map((m) => (
              <button
                key={m.id}
                title={`${formatTimestamp(m.timestamp_seconds)}${m.note ? ` — ${m.note}` : ''}`}
                onClick={(e) => {
                  e.stopPropagation()
                  seekTo(m.timestamp_seconds)
                }}
                className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-black/60 transition-transform hover:scale-150"
                style={{
                  left: `${(m.timestamp_seconds / duration) * 100}%`,
                  backgroundColor: m.tag ? MOMENT_TAG_COLORS[m.tag] : '#a888f0',
                }}
              />
            ))}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            className="rounded-lg p-2 text-zinc-300 hover:bg-white/10 hover:text-white disabled:opacity-30"
            disabled={!prevEp}
            title={t('player.prevEp')}
            onClick={() => prevEp && navigate(`/player/${prevEp.id}`, { replace: true })}
          >
            <ChevronLeft size={18} />
          </button>
          <button
            className="rounded-lg p-2 text-zinc-300 hover:bg-white/10 hover:text-white"
            title={t('player.back10')}
            onClick={() => seekBy(-10)}
          >
            <Rewind size={17} />
          </button>
          <button
            onClick={togglePlay}
            className="mx-1 flex h-10 w-10 items-center justify-center rounded-full bg-white text-black transition-transform hover:scale-105"
            title={t('player.playPause')}
          >
            {playing ? <Pause size={18} className="fill-black" /> : <Play size={18} className="ml-0.5 fill-black" />}
          </button>
          <button
            className="rounded-lg p-2 text-zinc-300 hover:bg-white/10 hover:text-white"
            title={t('player.fwd10')}
            onClick={() => seekBy(10)}
          >
            <FastForward size={17} />
          </button>
          <button
            className="rounded-lg p-2 text-zinc-300 hover:bg-white/10 hover:text-white disabled:opacity-30"
            disabled={!nextEp}
            title={t('player.nextEp')}
            onClick={() => nextEp && navigate(`/player/${nextEp.id}`, { replace: true })}
          >
            <ChevronRight size={18} />
          </button>

          <span className="ml-2 font-mono text-xs tabular-nums text-zinc-300">
            {formatTimestamp(currentTime)} <span className="text-zinc-600">/</span> {formatTimestamp(duration)}
          </span>

          <div className="flex-1" />

          {/* autoplay toggle */}
          <button
            className={`rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
              autoPlayNext ? 'bg-accent/25 text-accent-bright' : 'bg-white/5 text-zinc-500 hover:text-zinc-300'
            }`}
            title={t('player.autoTooltip')}
            onClick={() => {
              setAutoPlayNext((v) => !v)
              updateSettings({ autoPlayNext: !autoPlayNext })
            }}
          >
            {t('player.auto')}
          </button>

          {/* set intro end */}
          <button
            className="rounded-lg p-2 text-zinc-300 hover:bg-white/10 hover:text-white"
            title={t('player.markIntro')}
            onClick={markIntroEnd}
          >
            <Flag size={16} />
          </button>

          {/* screenshot */}
          <button
            className="rounded-lg p-2 text-zinc-300 hover:bg-white/10 hover:text-white"
            title={t('player.screenshot')}
            onClick={takeScreenshot}
          >
            <Camera size={16} />
          </button>

          {/* speed */}
          <div className="relative">
            <button
              className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-white/10 hover:text-white"
              onClick={() => {
                setSpeedMenuOpen((v) => !v)
                setSubsMenuOpen(false)
              }}
            >
              {rate}×
            </button>
            {speedMenuOpen && (
              <div className="absolute bottom-full right-0 mb-2 w-24 rounded-lg border border-edge bg-surface py-1">
                {SPEEDS.map((s) => (
                  <button
                    key={s}
                    onClick={() => setSpeed(s)}
                    className={`block w-full px-3 py-1.5 text-left text-xs transition-colors hover:bg-raised ${
                      s === rate ? 'text-accent-bright' : 'text-zinc-300'
                    }`}
                  >
                    {s}×
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* subtitles */}
          <div className="relative">
            <button
              className={`rounded-lg p-2 transition-colors hover:bg-white/10 ${
                activeTrack >= 0 ? 'text-accent-bright' : 'text-zinc-300 hover:text-white'
              }`}
              title={t('player.subtitles')}
              onClick={() => {
                setSubsMenuOpen((v) => !v)
                setSpeedMenuOpen(false)
              }}
            >
              <Subtitles size={16} />
            </button>
            {subsMenuOpen && (
              <div className="absolute bottom-full right-0 mb-2 w-44 rounded-lg border border-edge bg-surface py-1">
                <button
                  onClick={() => {
                    setActiveTrack(-1)
                    setSubsMenuOpen(false)
                  }}
                  className={`block w-full px-3 py-1.5 text-left text-xs hover:bg-raised ${
                    activeTrack === -1 ? 'text-accent-bright' : 'text-zinc-300'
                  }`}
                >
                  {t('common.off')}
                </button>
                {subtitleTracks.map((t, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setActiveTrack(i)
                      setSubsMenuOpen(false)
                    }}
                    className={`block w-full truncate px-3 py-1.5 text-left text-xs hover:bg-raised ${
                      activeTrack === i ? 'text-accent-bright' : 'text-zinc-300'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
                {!subtitleTracks.length && (
                  <div className="px-3 py-1.5 text-xs text-zinc-600">{t('player.noSubs')}</div>
                )}
              </div>
            )}
          </div>

          {/* volume */}
          <button
            className="rounded-lg p-2 text-zinc-300 hover:bg-white/10 hover:text-white"
            title={t('player.mute')}
            onClick={toggleMute}
          >
            {muted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.02}
            value={muted ? 0 : volume}
            onChange={(e) => setVol(Number(e.target.value))}
            className="w-20"
          />

          {/* open in mpv */}
          <button
            className="rounded-lg p-2 text-zinc-300 hover:bg-white/10 hover:text-white"
            title={t('player.openMpv')}
            onClick={async () => {
              if (!episode?.file_path) return
              const res = await window.wist.shell.openInMpv(episode.file_path)
              if (!res.ok) toast(res.error ?? tGlobal('player.mpvFailed'), 'error')
            }}
          >
            <MonitorUp size={16} />
          </button>

          {/* fullscreen */}
          <button
            className="rounded-lg p-2 text-zinc-300 hover:bg-white/10 hover:text-white"
            title={t('player.fullscreen')}
            onClick={toggleFullscreen}
          >
            {fullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
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
  )
}
