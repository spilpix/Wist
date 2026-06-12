import { execFile } from 'node:child_process'
import { getSettings } from '../settings'
import type { YoutubeVideo } from '../../src/types/models'

/** Fetch video metadata for a channel/playlist/video URL via yt-dlp (no API key). */
export function fetchVideos(url: string): Promise<YoutubeVideo[]> {
  const bin = getSettings().ytDlpPath || 'yt-dlp'
  return new Promise((resolve, reject) => {
    execFile(
      bin,
      ['-J', '--flat-playlist', '--no-warnings', url],
      { maxBuffer: 128 * 1024 * 1024, timeout: 180000, windowsHide: true },
      (err, stdout) => {
        if (err) {
          if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
            reject(new Error('yt-dlp not found. Install it (winget install yt-dlp) or set its path in Settings.'))
          } else {
            reject(new Error(`yt-dlp failed: ${err.message.slice(0, 300)}`))
          }
          return
        }
        try {
          resolve(parseOutput(JSON.parse(stdout)))
        } catch {
          reject(new Error('Could not parse yt-dlp output.'))
        }
      }
    )
  })
}

function parseOutput(json: any): YoutubeVideo[] {
  const toVideo = (e: any): YoutubeVideo | null => {
    if (!e) return null
    const id = e.id ?? e.url
    if (!id) return null
    const url = typeof e.url === 'string' && e.url.startsWith('http') ? e.url : `https://www.youtube.com/watch?v=${id}`
    return {
      id: String(id),
      title: e.title ?? '(untitled)',
      url,
      duration: typeof e.duration === 'number' ? e.duration : null,
    }
  }

  if (Array.isArray(json?.entries)) {
    const out: YoutubeVideo[] = []
    for (const entry of json.entries) {
      // channels nest playlists (Videos / Shorts / Live tabs)
      if (Array.isArray(entry?.entries)) {
        for (const sub of entry.entries) {
          const v = toVideo(sub)
          if (v) out.push(v)
        }
      } else {
        const v = toVideo(entry)
        if (v) out.push(v)
      }
    }
    return out
  }
  const single = toVideo(json)
  return single ? [single] : []
}
