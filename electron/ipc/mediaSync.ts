import { scanAudioFolders } from './music'
import { autoImportVideos } from './files'
import { getSettings, setSettings } from '../settings'

export interface MediaSyncResult {
  tracks: number
  titles: number
  episodes: number
}

/**
 * The "synchronise everything" core: scan each folder once and route its media
 * into the right section — audio → the Music library (tracks), video → the
 * Video/Library (titles + episodes). When `register` is set, a folder that turns
 * out to hold audio/video is also remembered as a music/media source, so a later
 * "Sync" (or the per-section scans) keeps picking up new files there.
 */
export async function syncMediaFolders(folders: string[], register = true): Promise<MediaSyncResult> {
  let tracks = 0
  let titles = 0
  let episodes = 0
  const music = new Set(getSettings().musicFolders)
  const media = new Set(getSettings().mediaFolders)

  for (const folder of folders) {
    const audio = await scanAudioFolders([folder])
    const video = autoImportVideos([folder])
    tracks += audio.added
    titles += video.createdTitles
    episodes += video.createdEpisodes
    if (register) {
      if (audio.scanned > 0) music.add(folder)
      if (video.scanned > 0) media.add(folder)
    }
  }

  if (register) setSettings({ musicFolders: [...music], mediaFolders: [...media] })
  return { tracks, titles, episodes }
}
