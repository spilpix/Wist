import fs from 'node:fs'
import path from 'node:path'
import type { SubtitleTrack } from '../../src/types/models'

const SUB_EXTENSIONS = ['.srt', '.vtt', '.ass', '.ssa']

const LANG_HINTS: Array<{ re: RegExp; lang: string; label: string }> = [
  { re: /\b(ru|rus|russian)\b/i, lang: 'ru', label: 'RU' },
  { re: /\b(en|eng|english)\b/i, lang: 'en', label: 'EN' },
  { re: /\b(ja|jp|jpn|japanese)\b/i, lang: 'ja', label: 'JA' },
]

/** Find .srt/.ass/.vtt files next to the video and convert them to WebVTT text. */
export function detectSubtitles(videoPath: string): SubtitleTrack[] {
  const dir = path.dirname(videoPath)
  const base = path.basename(videoPath, path.extname(videoPath))
  let entries: string[]
  try {
    entries = fs.readdirSync(dir)
  } catch {
    return []
  }

  const candidates = entries.filter((f) => {
    const ext = path.extname(f).toLowerCase()
    if (!SUB_EXTENSIONS.includes(ext)) return false
    return path.basename(f, ext).toLowerCase().startsWith(base.toLowerCase())
  })

  const tracks: SubtitleTrack[] = []
  for (const file of candidates) {
    const full = path.join(dir, file)
    try {
      const raw = fs.readFileSync(full, 'utf-8')
      const ext = path.extname(file).toLowerCase()
      const vtt = ext === '.vtt' ? raw : ext === '.srt' ? srtToVtt(raw) : assToVtt(raw)
      if (!vtt.trim()) continue
      const suffix = path.basename(file, ext).slice(base.length)
      const hint = LANG_HINTS.find((h) => h.re.test(suffix))
      tracks.push({
        lang: hint?.lang ?? 'und',
        label: hint?.label ?? (suffix.replace(/^[._\s-]+/, '') || 'Subtitles'),
        vtt,
      })
    } catch {
      // unreadable subtitle file — skip
    }
  }
  return tracks
}

export function srtToVtt(srt: string): string {
  const body = srt
    .replace(/^﻿/, '')
    .replace(/\r/g, '')
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')
  return 'WEBVTT\n\n' + body
}

/** Minimal ASS/SSA -> VTT: keeps dialogue text and timing, strips style override tags. */
export function assToVtt(ass: string): string {
  const lines = ass.replace(/\r/g, '').split('\n')
  let format: string[] | null = null
  const cues: string[] = []
  for (const line of lines) {
    if (/^Format:/i.test(line) && line.toLowerCase().includes('start')) {
      format = line.slice(line.indexOf(':') + 1).split(',').map((s) => s.trim().toLowerCase())
    } else if (/^Dialogue:/i.test(line) && format) {
      const parts = line.slice(line.indexOf(':') + 1).split(',')
      const startIdx = format.indexOf('start')
      const endIdx = format.indexOf('end')
      const textIdx = format.indexOf('text')
      if (startIdx < 0 || endIdx < 0 || textIdx < 0) continue
      const start = assTime(parts[startIdx]?.trim())
      const end = assTime(parts[endIdx]?.trim())
      if (!start || !end) continue
      const text = parts
        .slice(textIdx)
        .join(',')
        .replace(/\{[^}]*\}/g, '')
        .replace(/\\N/gi, '\n')
        .trim()
      if (!text) continue
      cues.push(`${start} --> ${end}\n${text}`)
    }
  }
  return cues.length ? 'WEBVTT\n\n' + cues.join('\n\n') : ''
}

function assTime(t: string | undefined): string | null {
  if (!t) return null
  const m = /^(\d+):(\d{2}):(\d{2})\.(\d{2})$/.exec(t)
  if (!m) return null
  return `${m[1].padStart(2, '0')}:${m[2]}:${m[3]}.${m[4]}0`
}
