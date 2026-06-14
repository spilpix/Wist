import https from 'node:https'
import fs from 'node:fs'
import { execFile } from 'node:child_process'
import type { LeaguePoll, LeagueRank, LeagueChampion, LeagueLivePlayer } from '../../src/types/models'

/**
 * League of Legends companion — op.gg / Porofessor style, but local & key-less.
 *  - LCU API  : the local League Client (auth from the LeagueClientUx process /
 *               lockfile) → your account, rank, game phase, champ select pick.
 *  - 2999 API : the Live Client Data API during an active game → all 10 players,
 *               KDA, items, gold (the Porofessor live scoreboard).
 *  - ddragon  : Riot's static data → champions, abilities, items, runes, icons.
 * No Riot API key, no setup. Works while the League client runs on this PC.
 */

// ---------- low-level HTTPS (self-signed certs on localhost) ----------

function httpsJson(options: https.RequestOptions, timeout = 4000): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = https.request({ ...options, rejectUnauthorized: false, timeout }, (res) => {
      let data = ''
      res.on('data', (c) => (data += c))
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(data ? JSON.parse(data) : null)
          } catch {
            resolve(data) // gameflow-phase is a bare quoted string
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}`))
        }
      })
    })
    req.on('timeout', () => req.destroy(new Error('timeout')))
    req.on('error', reject)
    req.end()
  })
}

function publicJson(url: string, timeout = 8000): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout }, (res) => {
      if (res.statusCode !== 200) {
        res.resume()
        reject(new Error(`HTTP ${res.statusCode}`))
        return
      }
      let data = ''
      res.on('data', (c) => (data += c))
      res.on('end', () => {
        try {
          resolve(JSON.parse(data))
        } catch (e) {
          reject(e)
        }
      })
    })
    req.on('timeout', () => req.destroy(new Error('timeout')))
    req.on('error', reject)
  })
}

// ---------- LCU credentials ----------

interface Creds {
  port: number
  token: string
}
let cachedCreds: Creds | null = null

const LOCKFILE_PATHS = [
  'C:\\Riot Games\\League of Legends\\lockfile',
  'C:\\Program Files\\Riot Games\\League of Legends\\lockfile',
  'C:\\Program Files (x86)\\Riot Games\\League of Legends\\lockfile',
]

function credsFromLockfile(): Creds | null {
  for (const p of LOCKFILE_PATHS) {
    try {
      const raw = fs.readFileSync(p, 'utf8')
      // LeagueClient:<pid>:<port>:<password>:<protocol>
      const parts = raw.split(':')
      if (parts.length >= 5) return { port: Number(parts[2]), token: parts[3] }
    } catch {
      /* not here */
    }
  }
  return null
}

function credsFromProcess(): Promise<Creds | null> {
  // most reliable: the LeagueClientUx command line carries port + auth token.
  // execFile with an args array avoids cmd.exe nested-quote escaping entirely.
  return new Promise((resolve) => {
    const script =
      'Get-CimInstance Win32_Process -Filter "name = \'LeagueClientUx.exe\'" | Select-Object -ExpandProperty CommandLine'
    execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], { timeout: 6000, windowsHide: true }, (err, stdout) => {
      if (err || !stdout) return resolve(null)
      const port = /--app-port=(\d+)/.exec(stdout)
      const token = /--remoting-auth-token=([\w-]+)/.exec(stdout)
      if (port && token) resolve({ port: Number(port[1]), token: token[1] })
      else resolve(null)
    })
  })
}

// when the client is closed the process scan is the slow part — throttle it so
// sitting on the League page doesn't spawn PowerShell on every 3s poll
let lastProcessScanAt = 0

async function getCreds(): Promise<Creds | null> {
  if (cachedCreds) return cachedCreds
  const fromLock = credsFromLockfile()
  if (fromLock) {
    cachedCreds = fromLock
    return cachedCreds
  }
  const now = Date.now()
  if (now - lastProcessScanAt < 12000) return null
  lastProcessScanAt = now
  cachedCreds = await credsFromProcess()
  return cachedCreds
}

async function lcu(path: string): Promise<any> {
  const creds = await getCreds()
  if (!creds) throw new Error('League client not found')
  try {
    return await httpsJson({
      hostname: '127.0.0.1',
      port: creds.port,
      path,
      method: 'GET',
      headers: { Authorization: 'Basic ' + Buffer.from(`riot:${creds.token}`).toString('base64') },
    })
  } catch (err) {
    cachedCreds = null // client likely restarted — re-discover next time
    throw err
  }
}

// ---------- Data Dragon (cached) ----------

let ddVersion = ''
let champByKey: Map<number, any> | null = null // numeric championId → summary
let champByName = new Map<string, any>() // id (e.g. "Aatrox") → full detail
let itemMap: Map<string, any> | null = null

async function ddragon() {
  if (champByKey && itemMap && ddVersion) return
  const versions = await publicJson('https://ddragon.leagueoflegends.com/api/versions.json')
  ddVersion = versions[0]
  const champs = await publicJson(`https://ddragon.leagueoflegends.com/cdn/${ddVersion}/data/en_US/champion.json`)
  champByKey = new Map()
  for (const id of Object.keys(champs.data)) {
    const c = champs.data[id]
    champByKey.set(Number(c.key), c)
  }
  const items = await publicJson(`https://ddragon.leagueoflegends.com/cdn/${ddVersion}/data/en_US/item.json`)
  itemMap = new Map()
  for (const id of Object.keys(items.data)) itemMap.set(id, items.data[id])
}

const img = {
  champSquare: (file: string) => `https://ddragon.leagueoflegends.com/cdn/${ddVersion}/img/champion/${file}`,
  spell: (file: string) => `https://ddragon.leagueoflegends.com/cdn/${ddVersion}/img/spell/${file}`,
  passive: (file: string) => `https://ddragon.leagueoflegends.com/cdn/${ddVersion}/img/passive/${file}`,
  item: (id: number | string) => `https://ddragon.leagueoflegends.com/cdn/${ddVersion}/img/item/${id}.png`,
  profileIcon: (id: number) => `https://ddragon.leagueoflegends.com/cdn/${ddVersion}/img/profileicon/${id}.png`,
}

async function champDetail(id: string): Promise<any | null> {
  if (champByName.has(id)) return champByName.get(id)
  try {
    const d = await publicJson(`https://ddragon.leagueoflegends.com/cdn/${ddVersion}/data/en_US/champion/${id}.json`)
    const detail = d.data[id]
    champByName.set(id, detail)
    return detail
  } catch {
    return null
  }
}

// ---------- heuristic build / runes / tips by champion role ----------
// Honest: not op.gg's aggregated optimal — a sane starting guide from champ tags.

const ITEM_IDS_BY_NAME: Record<string, number> = {}
function itemByName(name: string): { name: string; iconUrl: string } | null {
  if (!itemMap) return null
  if (!Object.keys(ITEM_IDS_BY_NAME).length) {
    for (const [id, it] of itemMap) if (it.name) ITEM_IDS_BY_NAME[it.name.toLowerCase()] = Number(id)
  }
  const id = ITEM_IDS_BY_NAME[name.toLowerCase()]
  return id ? { name, iconUrl: img.item(id) } : null
}

interface RoleGuide {
  coreItems: string[]
  runes: string
  keystone: string
  skill: string
  tips: string[]
}

const ROLE_GUIDES: Record<string, RoleGuide> = {
  Marksman: {
    coreItems: ["Berserker's Greaves", 'Kraken Slayer', 'Infinity Edge', "Lord Dominik's Regards"],
    runes: 'Precision',
    keystone: 'Lethal Tempo / Press the Attack',
    skill: 'Q → W → E',
    tips: ['Stay behind your frontline in fights', 'Last-hit minions, don’t push blindly', 'Buy control wards on resets'],
  },
  Mage: {
    coreItems: ["Sorcerer's Shoes", 'Luden’s Companion', 'Shadowflame', 'Rabadon’s Deathcap'],
    runes: 'Sorcery / Domination',
    keystone: 'Electrocute / Arcane Comet',
    skill: 'Q → E → W',
    tips: ['Poke before committing', 'Respect assassins — buy Zhonya’s if dove', 'Ward river to avoid ganks'],
  },
  Assassin: {
    coreItems: ['Ionian Boots of Lucidity', 'Duskblade / Night Harvester', 'Youmuu’s Ghostblade', 'Edge of Night'],
    runes: 'Domination',
    keystone: 'Electrocute',
    skill: 'Q → E → W',
    tips: ['Roam after pushing the wave', 'Wait for a cooldown before all-in', 'Track enemy summoner spells'],
  },
  Tank: {
    coreItems: ['Plated Steelcaps / Mercury’s Treads', 'Sunfire Aegis', 'Thornmail', 'Spirit Visage'],
    runes: 'Resolve',
    keystone: 'Grasp / Aftershock',
    skill: 'Q → W → E',
    tips: ['Engage only when your team can follow', 'Build resist vs their main damage type', 'Peel for your carries'],
  },
  Fighter: {
    coreItems: ['Plated Steelcaps', 'Goredrinker / Stridebreaker', 'Death’s Dance', 'Sterak’s Gage'],
    runes: 'Precision',
    keystone: 'Conqueror',
    skill: 'Q → E → W',
    tips: ['Trade when your passive/abilities are up', 'Freeze the wave when ahead', 'Split-push side lanes'],
  },
  Support: {
    coreItems: ['Ionian Boots of Lucidity', 'Locket / Shurelya’s', 'Knight’s Vow / Redemption'],
    runes: 'Resolve / Sorcery',
    keystone: 'Guardian / Aery',
    skill: 'Q → E → W',
    tips: ['Ward enemy jungle entrances', 'Track the enemy jungler', 'Don’t take your ADC’s farm'],
  },
}

function buildFor(tags: string[]) {
  const tag = tags.find((t) => ROLE_GUIDES[t]) ?? 'Fighter'
  const g = ROLE_GUIDES[tag]
  const coreItems = g.coreItems.map((n) => itemByName(n)).filter(Boolean) as Array<{ name: string; iconUrl: string }>
  return { role: tag, coreItems, runes: g.runes, keystone: g.keystone, skill: g.skill, tips: g.tips }
}

async function championBlock(numericId: number): Promise<LeagueChampion | null> {
  await ddragon()
  const summary = champByKey?.get(numericId)
  if (!summary) return null
  const detail = await champDetail(summary.id)
  const abilities: LeagueChampion['abilities'] = []
  if (detail) {
    if (detail.passive) abilities.push({ slot: 'P', name: detail.passive.name, iconUrl: img.passive(detail.passive.image.full) })
    const slots = ['Q', 'W', 'E', 'R'] as const
    detail.spells?.forEach((s: any, i: number) => {
      if (slots[i]) abilities.push({ slot: slots[i], name: s.name, iconUrl: img.spell(s.image.full) })
    })
  }
  return {
    id: summary.id,
    name: summary.name,
    title: detail?.title ?? summary.title ?? '',
    tags: summary.tags ?? [],
    squareUrl: img.champSquare(summary.image.full),
    abilities,
    build: buildFor(summary.tags ?? []),
  }
}

// ---------- public poll ----------

function parseRank(entry: any): LeagueRank | undefined {
  if (!entry || !entry.tier || entry.tier === 'NONE' || entry.tier === '') return undefined
  return {
    tier: entry.tier,
    division: entry.division && entry.division !== 'NA' ? entry.division : '',
    lp: entry.leaguePoints ?? 0,
    wins: entry.wins ?? 0,
    losses: entry.losses ?? 0,
  }
}

async function liveGame(selfName: string): Promise<LeaguePoll['live'] | undefined> {
  try {
    const data = await httpsJson({ hostname: '127.0.0.1', port: 2999, path: '/liveclientdata/allgamedata', method: 'GET' }, 3000)
    if (!data?.allPlayers) return undefined
    await ddragon().catch(() => undefined)
    // Live API gives the display name; ddragon squares use the champion id → match by name
    const idByName = new Map<string, string>()
    if (champByKey) for (const c of champByKey.values()) idByName.set(c.name, c.id)
    // names may carry a #tag and activePlayer.summonerName can be "" on Riot-ID accounts —
    // normalise to the no-tag game name, lower-cased, before comparing
    const stripTag = (s: string) => (s || '').split('#')[0].trim().toLowerCase()
    const active = stripTag(data.activePlayer?.riotIdGameName || data.activePlayer?.summonerName || selfName)
    const order: LeagueLivePlayer[] = []
    const chaos: LeagueLivePlayer[] = []
    for (const p of data.allPlayers) {
      const champId = idByName.get(p.championName) ?? p.championName
      const name = p.riotIdGameName || p.summonerName || ''
      const player: LeagueLivePlayer = {
        name: name.split('#')[0],
        champion: p.championName,
        championSquareUrl: ddVersion ? img.champSquare(`${champId}.png`) : '',
        kills: p.scores?.kills ?? 0,
        deaths: p.scores?.deaths ?? 0,
        assists: p.scores?.assists ?? 0,
        cs: p.scores?.creepScore ?? 0,
        level: p.level ?? 0,
        items: (p.items ?? []).map((it: any) => img.item(it.itemID)).filter(() => ddVersion),
        isSelf: !!active && stripTag(name) === active,
      }
      ;(p.team === 'ORDER' ? order : chaos).push(player)
    }
    return { activePlayer: active, order, chaos }
  } catch {
    return undefined
  }
}

export async function leaguePoll(): Promise<LeaguePoll> {
  const creds = await getCreds()
  if (!creds) return { connected: false, phase: 'None' }

  try {
    const [summonerRaw, phaseRaw] = await Promise.all([
      lcu('/lol-summoner/v1/current-summoner').catch(() => null),
      lcu('/lol-gameflow/v1/gameflow-phase').catch(() => 'None'),
    ])
    const phase = String(phaseRaw).replace(/"/g, '') || 'None'
    if (!summonerRaw) return { connected: false, phase: 'None' }

    await ddragon().catch(() => undefined)
    const summoner = {
      name: summonerRaw.gameName || summonerRaw.displayName || '',
      tag: summonerRaw.tagLine || '',
      level: summonerRaw.summonerLevel ?? 0,
      iconUrl: ddVersion ? img.profileIcon(summonerRaw.profileIconId) : '',
    }

    const rankedRaw = await lcu('/lol-ranked/v1/current-ranked-stats').catch(() => null)
    const ranked = rankedRaw?.queueMap
      ? { solo: parseRank(rankedRaw.queueMap.RANKED_SOLO_5x5), flex: parseRank(rankedRaw.queueMap.RANKED_FLEX_SR) }
      : undefined

    const result: LeaguePoll = { connected: true, phase, summoner, ranked }

    // champion you're on (champ select pick, or your live champ)
    let myChampId = 0
    if (phase === 'ChampSelect') {
      const session = await lcu('/lol-champ-select/v1/session').catch(() => null)
      if (session) {
        const me = session.myTeam?.find((m: any) => m.cellId === session.localPlayerCellId)
        myChampId = me?.championId || 0
        // a hovered (not yet locked) pick lives in actions
        if (!myChampId && session.actions) {
          for (const group of session.actions) {
            for (const a of group) {
              if (a.actorCellId === session.localPlayerCellId && a.type === 'pick' && a.championId) myChampId = a.championId
            }
          }
        }
      }
    }
    if (myChampId) result.champion = (await championBlock(myChampId).catch(() => null)) ?? undefined

    // live scoreboard during an active game (port 2999)
    if (phase === 'InProgress') {
      result.live = await liveGame(summoner.name)
      // your champion from the live data if champ-select already gone
      if (!result.champion && result.live) {
        const self = [...result.live.order, ...result.live.chaos].find((p) => p.isSelf)
        if (self && champByKey) {
          const entry = [...champByKey.values()].find((c) => c.id === self.champion || c.name === self.champion)
          if (entry) result.champion = (await championBlock(Number(entry.key)).catch(() => null)) ?? undefined
        }
      }
    }

    return result
  } catch {
    cachedCreds = null
    return { connected: false, phase: 'None' }
  }
}
