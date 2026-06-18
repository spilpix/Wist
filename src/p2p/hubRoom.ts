import { useEffect, useMemo, useRef, useState } from 'react'
import { joinRoom, selfId } from 'trystero'

/**
 * Hub P2P file sharing — renderer side. Establishes a free, serverless WebRTC mesh
 * via Trystero (public relays for signaling, direct peer connections for data) and:
 *   • announces who we are (display name) + who's online (presence)
 *   • gossips a MANIFEST of the files we can share (content-addressed by sha-256)
 *   • lets a peer REQUEST a file it lacks; the owner reads bytes (main IPC) and streams
 *     them straight over the data channel; the requester saves them to disk.
 *
 * Caveats (inherent to free P2P): both peers must be online at the same time, and a
 * minority of strict-NAT pairs may fail to connect (no free TURN relay).
 */

export interface PeerInfo {
  name: string
}
export interface ManifestFile {
  fileId: string // sha-256 — content address, so the same file dedups across peers
  name: string
  size: number
  // index signature: the wire type must satisfy Trystero's JsonValue payload constraint
  [k: string]: string | number
}
export interface SharedFile {
  fileId: string
  name: string
  size: number
  owners: string[] // peerIds that have it (empty when we already have it locally)
  haveLocally: boolean
}
export type RoomStatus = 'idle' | 'connecting' | 'connected' | 'error'

interface LocalFile {
  path: string
  fileId: string
  name: string
  size: number
}

const APP_ID = 'bard-hub-share-v1'

export function useHubRoom(opts: { roomId: string | null; secret: string; displayName: string; localPaths: string[] }) {
  const { roomId, secret, displayName, localPaths } = opts

  const [status, setStatus] = useState<RoomStatus>('idle')
  const [peers, setPeers] = useState<Record<string, PeerInfo>>({})
  const [remoteManifests, setRemoteManifests] = useState<Record<string, ManifestFile[]>>({})
  const [localFiles, setLocalFiles] = useState<LocalFile[]>([])
  const [indexing, setIndexing] = useState(false)
  const [progress, setProgress] = useState<Record<string, number>>({}) // fileId → 0..1
  const [downloaded, setDownloaded] = useState<Record<string, string>>({}) // fileId → saved path

  // refs let the trystero callbacks (bound once on join) read the latest values
  const localFilesRef = useRef<LocalFile[]>([])
  const displayNameRef = useRef(displayName)
  displayNameRef.current = displayName
  const actionsRef = useRef<{
    broadcastManifest: (files: ManifestFile[]) => void
    requestFile: (fileId: string, to: string) => void
  } | null>(null)

  const pathsKey = localPaths.join('|')

  // ─── room lifecycle ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!roomId) {
      setStatus('idle')
      return
    }
    let room: ReturnType<typeof joinRoom> | null = null
    setStatus('connecting')
    try {
      room = joinRoom({ appId: APP_ID, password: secret || undefined }, roomId)
    } catch (e) {
      console.error('p2p joinRoom failed', e)
      setStatus('error')
      return
    }

    const infoAction = room.makeAction<{ name: string }>('info')
    const manifestAction = room.makeAction<ManifestFile[]>('manifest')
    const reqAction = room.makeAction<{ fileId: string }>('req')
    const fileAction = room.makeAction<ArrayBuffer>('file')
    actionsRef.current = {
      broadcastManifest: (files) => void manifestAction.send(files),
      requestFile: (fileId, to) => void reqAction.send({ fileId }, { target: to }),
    }
    setStatus('connected')

    infoAction.onMessage = (data, ctx) => {
      setPeers((p) => ({ ...p, [ctx.peerId]: { name: String(data?.name || 'Гость') } }))
    }
    manifestAction.onMessage = (data, ctx) => {
      setRemoteManifests((m) => ({ ...m, [ctx.peerId]: Array.isArray(data) ? data : [] }))
    }
    // a peer asks for a file we hold → read its bytes and send them straight over
    reqAction.onMessage = async (data, ctx) => {
      const fileId = String(data?.fileId || '')
      const lf = localFilesRef.current.find((f) => f.fileId === fileId)
      if (!lf) return
      try {
        const bytes = await window.wist.p2p.readFile(lf.path)
        await fileAction.send(bytes, { target: ctx.peerId, metadata: { fileId, name: lf.name } })
      } catch (e) {
        console.error('p2p file send failed', e)
      }
    }
    // bytes of a file we requested arrive → save to disk
    fileAction.onMessage = async (data, ctx) => {
      const meta = (ctx.metadata ?? {}) as { fileId?: string; name?: string }
      const fileId = String(meta.fileId || '')
      try {
        const saved = await window.wist.p2p.saveIncoming(String(meta.name || 'file'), data)
        if (saved) setDownloaded((d) => ({ ...d, [fileId]: saved }))
      } catch (e) {
        console.error('p2p save failed', e)
      } finally {
        setProgress((p) => {
          const n = { ...p }
          delete n[fileId]
          return n
        })
      }
    }
    fileAction.onReceiveProgress = (progress, ctx) => {
      const fileId = String(((ctx.metadata ?? {}) as { fileId?: string }).fileId || '')
      if (fileId) setProgress((p) => ({ ...p, [fileId]: progress }))
    }

    room.onPeerJoin = (peerId) => {
      // introduce ourselves + hand the newcomer our current manifest
      void infoAction.send({ name: displayNameRef.current }, { target: peerId })
      void manifestAction.send(localFilesRef.current.map(({ fileId, name, size }) => ({ fileId, name, size })), { target: peerId })
    }
    room.onPeerLeave = (peerId) => {
      setPeers((p) => {
        const n = { ...p }
        delete n[peerId]
        return n
      })
      setRemoteManifests((m) => {
        const n = { ...m }
        delete n[peerId]
        return n
      })
    }

    return () => {
      room?.leave()
      actionsRef.current = null
      setPeers({})
      setRemoteManifests({})
      setProgress({})
      setStatus('idle')
    }
  }, [roomId, secret])

  // ─── index our shareable files (hash them) + broadcast the manifest ─────────
  useEffect(() => {
    let cancelled = false
    if (!localPaths.length) {
      setLocalFiles([])
      localFilesRef.current = []
      actionsRef.current?.broadcastManifest([])
      return
    }
    setIndexing(true)
    ;(async () => {
      const metas = await Promise.all(localPaths.map((p) => window.wist.p2p.fileMeta(p).catch(() => null)))
      if (cancelled) return
      const files: LocalFile[] = metas
        .filter((m): m is NonNullable<typeof m> => !!m)
        .map((m) => ({ path: m.path, fileId: m.sha256, name: m.name, size: m.size }))
      setLocalFiles(files)
      localFilesRef.current = files
      setIndexing(false)
      actionsRef.current?.broadcastManifest(files.map(({ fileId, name, size }) => ({ fileId, name, size })))
    })()
    return () => {
      cancelled = true
    }
  }, [pathsKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── merge local + remote manifests into one deduped list ───────────────────
  const files = useMemo(() => {
    const localIds = new Set(localFiles.map((f) => f.fileId))
    const map = new Map<string, SharedFile>()
    for (const f of localFiles) map.set(f.fileId, { fileId: f.fileId, name: f.name, size: f.size, owners: [], haveLocally: true })
    for (const [peerId, list] of Object.entries(remoteManifests)) {
      for (const f of list) {
        const have = localIds.has(f.fileId)
        const e = map.get(f.fileId) ?? { fileId: f.fileId, name: f.name, size: f.size, owners: [], haveLocally: have }
        if (!have && !e.owners.includes(peerId)) e.owners = [...e.owners, peerId]
        map.set(f.fileId, e)
      }
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [localFiles, remoteManifests])

  const download = (fileId: string) => {
    const entry = files.find((f) => f.fileId === fileId)
    const owner = entry?.owners[0]
    if (!owner) return
    setProgress((p) => ({ ...p, [fileId]: 0 }))
    actionsRef.current?.requestFile(fileId, owner)
  }

  return { status, selfId, peers, files, progress, downloaded, indexing, download }
}
