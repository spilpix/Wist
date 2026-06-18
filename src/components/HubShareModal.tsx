import { useEffect, useMemo, useState } from 'react'
import { Check, Copy, Download, FileIcon, FolderInput, Loader2, Plus, Users, Wifi, WifiOff } from 'lucide-react'
import Modal from './ui/Modal'
import Avatar from './ui/Avatar'
import Button from './ui/Button'
import { useHubRoom } from '../p2p/hubRoom'
import { useSettingsStore } from '../store/settingsStore'
import type { ProjectAsset } from '../types/models'
import { useI18n } from '../i18n'

// strings kept local (lang-keyed) so this new module touches no shared i18n files
const STR = {
  ru: {
    title: (n: string) => `Поделиться хабом «${n}»`,
    intro: 'Подключите участников по коду — файлы передаются напрямую между вами (P2P), бесплатно и зашифрованно. Все должны быть онлайн одновременно.',
    create: 'Создать комнату',
    joinPh: 'Вставьте код приглашения…',
    join: 'Подключиться',
    badCode: 'Неверный код',
    invite: 'Код приглашения',
    copied: 'Скопировано',
    copy: 'Копировать',
    connecting: 'Подключение…',
    connected: 'В сети',
    error: 'Ошибка сети',
    members: 'Участники',
    you: 'Вы',
    files: 'Файлы',
    indexing: 'Индексирую файлы…',
    noFiles: 'В хабе нет файлов для обмена',
    have: 'У вас есть',
    downloaded: 'Скачано',
    get: 'Скачать',
    offline: 'Владелец не в сети',
    leave: 'Покинуть комнату',
  },
  en: {
    title: (n: string) => `Share hub "${n}"`,
    intro: 'Invite members with a code — files transfer directly between you (P2P), free and encrypted. Everyone must be online at the same time.',
    create: 'Create room',
    joinPh: 'Paste an invite code…',
    join: 'Join',
    badCode: 'Invalid code',
    invite: 'Invite code',
    copied: 'Copied',
    copy: 'Copy',
    connecting: 'Connecting…',
    connected: 'Online',
    error: 'Network error',
    members: 'Members',
    you: 'You',
    files: 'Files',
    indexing: 'Indexing files…',
    noFiles: 'No files in this hub to share',
    have: 'You have it',
    downloaded: 'Downloaded',
    get: 'Download',
    offline: 'Owner offline',
    leave: 'Leave room',
  },
}

interface RoomCfg {
  roomId: string
  secret: string
}
const cfgKey = (projectId: number) => `wist.hubRoom.${projectId}`
function loadCfg(projectId: number): RoomCfg | null {
  try {
    const raw = localStorage.getItem(cfgKey(projectId))
    return raw ? (JSON.parse(raw) as RoomCfg) : null
  } catch {
    return null
  }
}
function saveCfg(projectId: number, cfg: RoomCfg) {
  try {
    localStorage.setItem(cfgKey(projectId), JSON.stringify(cfg))
  } catch {
    /* storage unavailable */
  }
}
function genRoom(): RoomCfg {
  const rid = crypto.randomUUID().replace(/-/g, '').slice(0, 16)
  const arr = new Uint8Array(12)
  crypto.getRandomValues(arr)
  const secret = Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('')
  return { roomId: rid, secret }
}
function encodeInvite(c: RoomCfg): string {
  return btoa(`${c.roomId}:${c.secret}`).replace(/=+$/, '')
}
function decodeInvite(code: string): RoomCfg | null {
  try {
    const s = atob(code.trim())
    const i = s.indexOf(':')
    if (i < 1) return null
    return { roomId: s.slice(0, i), secret: s.slice(i + 1) }
  } catch {
    return null
  }
}
function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`
  const u = ['KB', 'MB', 'GB', 'TB']
  let v = n
  let i = -1
  do {
    v /= 1024
    i++
  } while (v >= 1024 && i < u.length - 1)
  return `${v.toFixed(v < 10 ? 1 : 0)} ${u[i]}`
}

export default function HubShareModal({ projectId, projectName, onClose }: { projectId: number; projectName: string; onClose: () => void }) {
  const { lang } = useI18n()
  const tr = STR[lang === 'ru' ? 'ru' : 'en']
  const settings = useSettingsStore((s) => s.settings)
  const displayName = settings?.profileName?.trim() || tr.you

  const [cfg, setCfg] = useState<RoomCfg | null>(() => loadCfg(projectId))
  const [joinCode, setJoinCode] = useState('')
  const [joinErr, setJoinErr] = useState(false)
  const [copied, setCopied] = useState(false)
  const [paths, setPaths] = useState<string[]>([])

  // shareable files = hub assets that are real local files (not URLs / folders)
  useEffect(() => {
    window.wist.projects
      .assets(projectId)
      .then((assets: ProjectAsset[]) => {
        setPaths(assets.filter((a) => (a.kind === 'file' || a.kind === 'image') && a.path).map((a) => a.path as string))
      })
      .catch(() => setPaths([]))
  }, [projectId])

  const { status, peers, files, progress, downloaded, indexing, download } = useHubRoom({
    roomId: cfg?.roomId ?? null,
    secret: cfg?.secret ?? '',
    displayName,
    localPaths: paths,
  })

  const startRoom = () => {
    const c = genRoom()
    saveCfg(projectId, c)
    setCfg(c)
  }
  const doJoin = () => {
    const c = decodeInvite(joinCode)
    if (!c) {
      setJoinErr(true)
      return
    }
    saveCfg(projectId, c)
    setCfg(c)
  }
  const leave = () => {
    localStorage.removeItem(cfgKey(projectId))
    setCfg(null)
    setJoinCode('')
  }
  const invite = useMemo(() => (cfg ? encodeInvite(cfg) : ''), [cfg])
  const copyInvite = () => {
    navigator.clipboard?.writeText(invite).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    })
  }

  const peerList = Object.entries(peers)
  const StatusIcon = status === 'connected' ? Wifi : status === 'error' ? WifiOff : Loader2
  const statusLabel = status === 'connected' ? tr.connected : status === 'error' ? tr.error : tr.connecting

  return (
    <Modal title={tr.title(projectName)} onClose={onClose} width="max-w-lg">
      {!cfg ? (
        // ── setup: create a room or join with a code ──
        <div className="space-y-4">
          <p className="text-[13px] leading-relaxed text-zinc-400">{tr.intro}</p>
          <Button variant="accent" onClick={startRoom} className="w-full">
            <Plus size={15} /> {tr.create}
          </Button>
          <div className="flex items-center gap-2">
            <input
              value={joinCode}
              onChange={(e) => {
                setJoinCode(e.target.value)
                setJoinErr(false)
              }}
              onKeyDown={(e) => e.key === 'Enter' && doJoin()}
              placeholder={tr.joinPh}
              className={`input flex-1 ${joinErr ? 'border-danger' : ''}`}
            />
            <Button onClick={doJoin}>
              <FolderInput size={15} /> {tr.join}
            </Button>
          </div>
          {joinErr && <p className="text-[12px] text-danger">{tr.badCode}</p>}
        </div>
      ) : (
        <div className="space-y-5">
          {/* status + invite code */}
          <div className="flex items-center gap-2 text-[12.5px]">
            <StatusIcon size={14} className={`${status === 'connecting' ? 'animate-spin' : ''} ${status === 'connected' ? 'text-[color:var(--c-green-text)]' : status === 'error' ? 'text-danger' : 'text-zinc-500'}`} />
            <span className="font-medium text-zinc-300">{statusLabel}</span>
            <button onClick={leave} className="ml-auto rounded px-2 py-1 text-[12px] text-zinc-500 transition-colors hover:bg-highlight hover:text-zinc-300">
              {tr.leave}
            </button>
          </div>
          <div>
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{tr.invite}</div>
            <div className="flex items-center gap-2 rounded-lg border border-edge bg-field px-3 py-2">
              <code className="selectable flex-1 truncate font-mono text-[12.5px] text-zinc-300">{invite}</code>
              <button onClick={copyInvite} className="flex items-center gap-1 rounded px-2 py-1 text-[12px] text-zinc-400 transition-colors hover:bg-highlight hover:text-zinc-200">
                {copied ? <Check size={13} className="text-[color:var(--c-green-text)]" /> : <Copy size={13} />}
                {copied ? tr.copied : tr.copy}
              </button>
            </div>
          </div>

          {/* members */}
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              <Users size={12} /> {tr.members} · {peerList.length + 1}
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="flex items-center gap-1.5 rounded-full bg-raised py-1 pl-1 pr-2.5">
                <Avatar name={displayName} src={settings?.profileAvatar} size={22} />
                <span className="text-[12.5px] text-zinc-200">{displayName} · {tr.you}</span>
              </span>
              {peerList.map(([id, info]) => (
                <span key={id} className="flex items-center gap-1.5 rounded-full bg-raised py-1 pl-1 pr-2.5">
                  <Avatar name={info.name} size={22} />
                  <span className="text-[12.5px] text-zinc-300">{info.name}</span>
                </span>
              ))}
            </div>
          </div>

          {/* files */}
          <div>
            <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              {tr.files}
              {indexing && (
                <span className="flex items-center gap-1 normal-case tracking-normal text-zinc-600">
                  <Loader2 size={11} className="animate-spin" /> {tr.indexing}
                </span>
              )}
            </div>
            {files.length === 0 ? (
              <p className="py-6 text-center text-[12.5px] text-zinc-500">{tr.noFiles}</p>
            ) : (
              <div className="max-h-64 space-y-1 overflow-y-auto">
                {files.map((f) => {
                  const pct = progress[f.fileId]
                  const got = downloaded[f.fileId]
                  return (
                    <div key={f.fileId} className="flex items-center gap-2.5 rounded-lg border border-edge bg-card px-3 py-2">
                      <FileIcon size={15} className="shrink-0 text-zinc-500" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] text-zinc-100">{f.name}</div>
                        <div className="text-[11px] text-zinc-500">{fmtSize(f.size)}</div>
                      </div>
                      {f.haveLocally ? (
                        <span className="shrink-0 text-[11.5px] text-zinc-500">{tr.have}</span>
                      ) : got ? (
                        <span className="shrink-0 text-[11.5px] text-[color:var(--c-green-text)]">{tr.downloaded}</span>
                      ) : pct != null ? (
                        <div className="flex w-24 shrink-0 items-center gap-1.5">
                          <div className="h-1 flex-1 overflow-hidden rounded-full bg-edge">
                            <div className="h-full bg-accent transition-all" style={{ width: `${Math.round(pct * 100)}%` }} />
                          </div>
                          <span className="w-8 text-right text-[11px] tabular-nums text-zinc-500">{Math.round(pct * 100)}%</span>
                        </div>
                      ) : f.owners.length ? (
                        <Button size="sm" variant="accent" onClick={() => download(f.fileId)}>
                          <Download size={13} /> {tr.get}
                        </Button>
                      ) : (
                        <span className="shrink-0 text-[11.5px] text-zinc-600">{tr.offline}</span>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}
