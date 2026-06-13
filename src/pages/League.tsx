import { useEffect, useRef, useState } from 'react'
import { Gamepad2, Lightbulb, RefreshCw, Swords } from 'lucide-react'
import EmptyState from '../components/ui/EmptyState'
import Spinner from '../components/ui/Spinner'
import type { LeaguePoll, LeagueLivePlayer, LeagueRank } from '../types/models'
import { useI18n, type TKey } from '../i18n'

const TIER_COLORS: Record<string, string> = {
  IRON: '#7c6f64',
  BRONZE: '#a05a2c',
  SILVER: '#9aa4b2',
  GOLD: '#e6b34d',
  PLATINUM: '#3bd6c6',
  EMERALD: '#2fbf71',
  DIAMOND: '#6aa6ff',
  MASTER: '#c061f0',
  GRANDMASTER: '#e0566a',
  CHALLENGER: '#f4d35e',
}

const titleCase = (s: string) => (s ? s.charAt(0) + s.slice(1).toLowerCase() : s)

function RankBadge({ rank, label }: { rank?: LeagueRank; label: string }) {
  const { t } = useI18n()
  if (!rank) {
    return (
      <div className="rounded-lg border border-edge bg-raised px-3 py-2">
        <div className="text-[10px] uppercase tracking-wide text-zinc-600">{label}</div>
        <div className="text-sm text-zinc-500">{t('league.unranked')}</div>
      </div>
    )
  }
  const total = rank.wins + rank.losses
  const wr = total ? Math.round((rank.wins / total) * 100) : 0
  const color = TIER_COLORS[rank.tier] ?? '#9aa4b2'
  return (
    <div className="rounded-lg border border-edge bg-raised px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-zinc-600">{label}</div>
      <div className="text-sm font-semibold" style={{ color }}>
        {titleCase(rank.tier)} {rank.division} · {rank.lp} LP
      </div>
      <div className="text-xs text-zinc-500">
        {rank.wins}{t('league.w')} {rank.losses}{t('league.l')} · {wr}% {t('league.wr')}
      </div>
    </div>
  )
}

function PlayerRow({ p }: { p: LeagueLivePlayer }) {
  return (
    <div className={`flex items-center gap-2 rounded-lg px-2 py-1.5 ${p.isSelf ? 'bg-accent/15' : 'hover:bg-raised'}`}>
      {p.championSquareUrl ? (
        <img src={p.championSquareUrl} alt={p.champion} className="h-7 w-7 shrink-0 rounded" />
      ) : (
        <span className="h-7 w-7 shrink-0 rounded bg-raised" />
      )}
      <div className="min-w-0 flex-1">
        <div className={`truncate text-[13px] ${p.isSelf ? 'font-semibold text-accent-bright' : 'text-zinc-200'}`}>{p.name || p.champion}</div>
        <div className="text-[11px] text-zinc-500">{p.champion} · {p.cs} CS · lvl {p.level}</div>
      </div>
      <div className="shrink-0 font-mono text-xs tabular-nums text-zinc-300">
        {p.kills}/{p.deaths}/{p.assists}
      </div>
      <div className="flex shrink-0 gap-0.5">
        {p.items.slice(0, 6).map((url, i) => (
          <img key={i} src={url} alt="" className="h-5 w-5 rounded-sm bg-raised" />
        ))}
      </div>
    </div>
  )
}

const PHASE_KEY: Record<string, TKey> = {
  None: 'league.phase.none',
  Lobby: 'league.phase.lobby',
  Matchmaking: 'league.phase.queue',
  ReadyCheck: 'league.phase.queue',
  ChampSelect: 'league.phase.select',
  InProgress: 'league.phase.ingame',
}

export default function League() {
  const { t } = useI18n()
  const [poll, setPoll] = useState<LeaguePoll | null>(null)
  const [loading, setLoading] = useState(true)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    let alive = true
    const tick = () =>
      window.wist.league
        .poll()
        .then((p) => alive && setPoll(p))
        .catch(() => alive && setPoll({ connected: false, phase: 'None' }))
        .finally(() => alive && setLoading(false))
    tick()
    timer.current = setInterval(tick, 3000)
    return () => {
      alive = false
      if (timer.current) clearInterval(timer.current)
    }
  }, [])

  if (loading && !poll) return <Spinner label={t('league.connecting')} />

  if (!poll?.connected) {
    return (
      <div className="page">
        <h1 className="page-title">{t('nav.league')}</h1>
        <EmptyState icon={Gamepad2} title={t('league.notConnected')} subtitle={t('league.notConnectedHint')} />
      </div>
    )
  }

  const { summoner, ranked, champion, live, phase } = poll
  const phaseKey = PHASE_KEY[phase] ?? 'league.phase.none'

  return (
    <div className="page space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="page-title !mb-0">{t('nav.league')}</h1>
        <span className="flex items-center gap-1.5 text-xs text-zinc-500">
          <RefreshCw size={12} className="animate-spin [animation-duration:3s]" />
          {t(phaseKey)}
        </span>
      </div>

      {/* account */}
      {summoner && (
        <div className="card flex items-center gap-4 p-4">
          {summoner.iconUrl && <img src={summoner.iconUrl} alt="" className="h-14 w-14 rounded-full ring-2 ring-edge" />}
          <div>
            <div className="text-lg font-semibold text-white">
              {summoner.name}
              {summoner.tag && <span className="text-sm text-zinc-500"> #{summoner.tag}</span>}
            </div>
            <div className="text-xs text-zinc-500">{t('league.level')} {summoner.level}</div>
          </div>
          <div className="ml-auto flex gap-2">
            <RankBadge rank={ranked?.solo} label={t('league.solo')} />
            <RankBadge rank={ranked?.flex} label={t('league.flex')} />
          </div>
        </div>
      )}

      {/* champion + build */}
      {champion && (
        <div className="card p-5">
          <div className="mb-4 flex items-center gap-3">
            <img src={champion.squareUrl} alt={champion.name} className="h-14 w-14 rounded-lg" />
            <div>
              <div className="text-lg font-semibold text-white">{champion.name}</div>
              <div className="text-xs text-zinc-500">{champion.title}</div>
            </div>
            <span className="ml-auto rounded-full bg-accent/15 px-3 py-1 text-xs font-medium text-accent-bright">
              {champion.build.role}
            </span>
          </div>

          {/* abilities */}
          <div className="mb-5 flex gap-2">
            {champion.abilities.map((a) => (
              <div key={a.slot} className="text-center" title={a.name}>
                <div className="relative">
                  <img src={a.iconUrl} alt={a.name} className="h-11 w-11 rounded-lg ring-1 ring-edge" />
                  <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded bg-surface text-[9px] font-bold text-accent-bright ring-1 ring-edge">
                    {a.slot}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            {/* build */}
            <div>
              <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                <Swords size={13} /> {t('league.coreBuild')}
              </div>
              <div className="mb-3 flex flex-wrap gap-1.5">
                {champion.build.coreItems.map((it, i) => (
                  <img key={i} src={it.iconUrl} alt={it.name} title={it.name} className="h-9 w-9 rounded ring-1 ring-edge" />
                ))}
              </div>
              <div className="space-y-1 text-xs text-zinc-400">
                <div><span className="text-zinc-600">{t('league.runes')}:</span> {champion.build.keystone} ({champion.build.runes})</div>
                <div><span className="text-zinc-600">{t('league.skillOrder')}:</span> {champion.build.skill}</div>
              </div>
            </div>

            {/* tips */}
            <div>
              <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                <Lightbulb size={13} /> {t('league.tips')}
              </div>
              <ul className="space-y-1.5">
                {champion.build.tips.map((tip, i) => (
                  <li key={i} className="flex gap-2 text-xs text-zinc-400">
                    <span className="text-accent-bright">•</span> {tip}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="mt-4 border-t border-edge/50 pt-2 text-[10px] text-zinc-600">{t('league.autoNote')}</div>
        </div>
      )}

      {/* live scoreboard */}
      {live && (live.order.length > 0 || live.chaos.length > 0) && (
        <div className="card p-4">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">{t('league.scoreboard')}</div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <div className="mb-1.5 text-[11px] font-semibold text-blue-400">{t('league.teamBlue')}</div>
              <div className="space-y-0.5">
                {live.order.map((p, i) => <PlayerRow key={i} p={p} />)}
              </div>
            </div>
            <div>
              <div className="mb-1.5 text-[11px] font-semibold text-red-400">{t('league.teamRed')}</div>
              <div className="space-y-0.5">
                {live.chaos.map((p, i) => <PlayerRow key={i} p={p} />)}
              </div>
            </div>
          </div>
        </div>
      )}

      {!champion && !live && (
        <div className="card px-5 py-8 text-center text-sm text-zinc-600">{t('league.waiting')}</div>
      )}
    </div>
  )
}
