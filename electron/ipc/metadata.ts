import https from 'node:https'
import http from 'node:http'
import path from 'node:path'
import fs from 'node:fs'
import { coversDir } from '../settings'
import type { MetaCandidate, TitleType } from '../../src/types/models'

/** Fetch metadata from free, key-less public APIs. */

function fetchJson(url: string, redirects = 3): Promise<any> {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http
    const req = mod.get(url, { headers: { 'User-Agent': 'Wist/0.4 (personal media hub)' }, timeout: 12000 }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
        res.resume()
        resolve(fetchJson(new URL(res.headers.location, url).toString(), redirects - 1))
        return
      }
      if (res.statusCode !== 200) {
        res.resume()
        reject(new Error(`HTTP ${res.statusCode} from ${new URL(url).hostname}`))
        return
      }
      let data = ''
      res.on('data', (c) => (data += c))
      res.on('end', () => {
        try {
          resolve(JSON.parse(data))
        } catch {
          reject(new Error('Invalid JSON response'))
        }
      })
    })
    req.on('timeout', () => req.destroy(new Error('Request timed out')))
    req.on('error', reject)
  })
}

const stripHtml = (s: string | null | undefined): string =>
  (s ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()

const yearOf = (s: string | null | undefined): number | null => {
  const m = /\d{4}/.exec(s ?? '')
  return m ? Number(m[0]) : null
}

async function searchAnime(q: string): Promise<MetaCandidate[]> {
  const res = await fetchJson(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(q)}&limit=6&sfw=true`)
  return (res.data ?? []).map((a: any) => ({
    title: a.title_english || a.title,
    original_title: a.title_japanese ?? a.title,
    year: a.year ?? yearOf(a.aired?.from),
    episodes: a.episodes ?? null,
    genres: (a.genres ?? []).map((g: any) => g.name),
    description: (a.synopsis ?? '').slice(0, 600),
    imageUrl: a.images?.jpg?.large_image_url ?? a.images?.jpg?.image_url ?? null,
    source: 'MyAnimeList',
  }))
}

async function searchShows(q: string): Promise<MetaCandidate[]> {
  const res = await fetchJson(`https://api.tvmaze.com/search/shows?q=${encodeURIComponent(q)}`)
  return (res ?? []).slice(0, 6).map((r: any) => ({
    title: r.show?.name,
    original_title: null,
    year: yearOf(r.show?.premiered),
    episodes: null,
    genres: r.show?.genres ?? [],
    description: stripHtml(r.show?.summary).slice(0, 600),
    imageUrl: r.show?.image?.original ?? r.show?.image?.medium ?? null,
    source: 'TVMaze',
  }))
}

async function searchMovies(q: string): Promise<MetaCandidate[]> {
  const res = await fetchJson(
    `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=movie&limit=6`
  )
  return (res.results ?? []).map((m: any) => ({
    title: m.trackName,
    original_title: null,
    year: yearOf(m.releaseDate),
    episodes: 1,
    genres: m.primaryGenreName ? [m.primaryGenreName] : [],
    description: (m.longDescription ?? m.shortDescription ?? '').slice(0, 600),
    imageUrl: m.artworkUrl100 ? m.artworkUrl100.replace('100x100', '600x600') : null,
    source: 'iTunes',
  }))
}

async function searchBooks(q: string): Promise<MetaCandidate[]> {
  const res = await fetchJson(
    `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=6`
  )
  return (res.items ?? []).map((b: any) => {
    const v = b.volumeInfo ?? {}
    return {
      title: v.title,
      original_title: (v.authors ?? []).join(', ') || null, // authors land in "original title"
      year: yearOf(v.publishedDate),
      episodes: v.pageCount ? Math.max(1, Math.round(v.pageCount / 20)) : null, // rough chapters
      genres: v.categories ?? [],
      description: stripHtml(v.description).slice(0, 600),
      imageUrl: v.imageLinks?.thumbnail ? String(v.imageLinks.thumbnail).replace('http://', 'https://') : null,
      source: 'Google Books',
    }
  })
}

export async function searchTitleMeta(type: TitleType, query: string): Promise<MetaCandidate[]> {
  const q = query.trim()
  if (!q) return []
  let candidates: MetaCandidate[]
  switch (type) {
    case 'anime':
      candidates = await searchAnime(q)
      break
    case 'series':
    case 'cartoon':
    case 'youtube':
      candidates = await searchShows(q)
      break
    case 'movie':
      candidates = await searchMovies(q)
      if (!candidates.length) candidates = await searchShows(q)
      break
    case 'book':
      candidates = await searchBooks(q)
      break
  }
  return candidates.filter((c) => c.title)
}

/** Download a remote image into the covers dir, return the local path. */
export function downloadCover(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const ext = /\.(png|webp|gif)(\?|$)/i.exec(url)?.[1]?.toLowerCase() ?? 'jpg'
    const file = path.join(coversDir(), `cover-${Date.now()}.${ext}`)
    const mod = url.startsWith('https') ? https : http
    const req = mod.get(url, { headers: { 'User-Agent': 'Wist/0.4' }, timeout: 15000 }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume()
        resolve(downloadCover(new URL(res.headers.location, url).toString()))
        return
      }
      if (res.statusCode !== 200) {
        res.resume()
        reject(new Error(`HTTP ${res.statusCode} while downloading cover`))
        return
      }
      const out = fs.createWriteStream(file)
      res.pipe(out)
      out.on('finish', () => out.close(() => resolve(file)))
      out.on('error', reject)
    })
    req.on('timeout', () => req.destroy(new Error('Cover download timed out')))
    req.on('error', reject)
  })
}

/** oEmbed lookup for music/video links (Spotify, YouTube, SoundCloud) — no API keys. */
export async function fetchOembed(url: string): Promise<{ title: string | null; thumbnail: string | null }> {
  let endpoint: string | null = null
  try {
    const host = new URL(url).hostname.toLowerCase()
    if (host.includes('spotify')) endpoint = `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`
    else if (host.includes('youtu')) endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`
    else if (host.includes('soundcloud')) endpoint = `https://soundcloud.com/oembed?url=${encodeURIComponent(url)}&format=json`
  } catch {
    return { title: null, thumbnail: null }
  }
  if (!endpoint) return { title: null, thumbnail: null }
  try {
    const res = await fetchJson(endpoint)
    return { title: res.title ?? null, thumbnail: res.thumbnail_url ?? null }
  } catch {
    return { title: null, thumbnail: null }
  }
}
