export const VIDEO_EXTENSIONS = ['.mkv', '.mp4', '.avi', '.mov', '.webm']

interface ParsedFile {
  path: string
  fileName: string
  parsedTitle: string
  episode: number | null
  season: number | null
}

/**
 * Extracts title / episode / season from common anime & series file naming
 * patterns. Patterns handled (in priority order):
 *  1. [Group] Title - 14 [1080p].mkv
 *  2. Title.S02E07.mkv  /  Title S2 E7
 *  3. Title 2x07.mkv
 *  4. Title - Episode 14.mkv / Title ep14 / Title_ep14 / Title E14
 *  5. Title - 14 [tags].mkv
 *  6. Title 14.mkv (trailing number)
 *  7. fallback: whole name, no episode (movies)
 */
export function parseFilename(filePath: string): ParsedFile {
  const fileName = filePath.replace(/\\/g, '/').split('/').pop() ?? filePath
  let name = fileName.replace(/\.[a-z0-9]{2,4}$/i, '') // strip extension

  let group: string | null = null
  const groupMatch = /^\[([^\]]+)\]\s*/.exec(name)
  if (groupMatch) {
    group = groupMatch[1]
    name = name.slice(groupMatch[0].length)
  }

  // Drop trailing bracketed/parenthesized tags: [1080p] (BD) [ABCD1234] ...
  name = name.replace(/(\s*[\[(][^\])]*[\])])+\s*$/g, '').trim()

  const result = matchPatterns(name)
  return {
    path: filePath,
    fileName,
    parsedTitle: cleanTitle(result.title) || cleanTitle(name) || fileName,
    episode: result.episode,
    season: result.season,
  }
}

function matchPatterns(name: string): { title: string; episode: number | null; season: number | null } {
  // Normalize dots/underscores used as separators for some patterns
  const spaced = name.replace(/[._]+/g, ' ').replace(/\s+/g, ' ').trim()

  // 2. SxxExx
  let m = /^(?<title>.+?)[\s.&_-]+S(?<season>\d{1,2})\s*[._\s-]?\s*E[Pp]?(?<ep>\d{1,4})/i.exec(name)
  if (m?.groups) {
    return { title: m.groups.title, episode: num(m.groups.ep), season: num(m.groups.season) }
  }

  // 3. 2x07
  m = /^(?<title>.+?)[\s._-]+(?<season>\d{1,2})x(?<ep>\d{1,4})(?:\D|$)/i.exec(name)
  if (m?.groups) {
    return { title: m.groups.title, episode: num(m.groups.ep), season: num(m.groups.season) }
  }

  // 4a. "Episode 14" / "Ep 14" / "ep.14" markers (underscore-normalized form)
  m = /^(?<title>.+?)[\s._-]+(?:episode|ep\.?)\s*(?<ep>\d{1,4})(?:v\d+)?\s*$/i.exec(spaced)
  if (m?.groups && m.groups.title.trim().length > 0) {
    return { title: m.groups.title, episode: num(m.groups.ep), season: null }
  }

  // 4b. bare "E14" — digits must follow immediately so words ending in "e" don't match
  m = /^(?<title>.+?)[\s._-]+e(?<ep>\d{1,4})(?:v\d+)?\s*$/i.exec(spaced)
  if (m?.groups && m.groups.title.trim().length > 0) {
    return { title: m.groups.title, episode: num(m.groups.ep), season: null }
  }

  // 1/5. Title - 14  (typical fansub form, group already stripped)
  m = /^(?<title>.+?)\s+-\s+(?<ep>\d{1,4})(?:v\d+)?\s*$/.exec(spaced)
  if (m?.groups) {
    return { title: m.groups.title, episode: num(m.groups.ep), season: null }
  }

  // 6. Trailing bare number (avoid matching years like "Movie 1999")
  m = /^(?<title>.+?)\s+(?<ep>\d{1,3})\s*$/.exec(spaced)
  if (m?.groups) {
    const ep = num(m.groups.ep)
    if (ep !== null && ep < 1900) {
      return { title: m.groups.title, episode: ep, season: null }
    }
  }

  // 7. Fallback — movie / single file
  return { title: spaced, episode: null, season: null }
}

function num(v: string | undefined): number | null {
  if (!v) return null
  const n = parseInt(v, 10)
  return Number.isFinite(n) ? n : null
}

export function cleanTitle(raw: string): string {
  return raw
    .replace(/[._]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[\s\-–—]+$/g, '')
    .replace(/^[\s\-–—]+/g, '')
    .trim()
}

/** Dice coefficient over character bigrams — used to auto-match parsed titles to library entries. */
export function similarity(a: string, b: string): number {
  const s1 = a.toLowerCase().trim()
  const s2 = b.toLowerCase().trim()
  if (!s1.length || !s2.length) return 0
  if (s1 === s2) return 1
  if (s1.length < 2 || s2.length < 2) return s1 === s2 ? 1 : 0

  const bigrams = new Map<string, number>()
  for (let i = 0; i < s1.length - 1; i++) {
    const bg = s1.substring(i, i + 2)
    bigrams.set(bg, (bigrams.get(bg) ?? 0) + 1)
  }
  let intersection = 0
  for (let i = 0; i < s2.length - 1; i++) {
    const bg = s2.substring(i, i + 2)
    const count = bigrams.get(bg) ?? 0
    if (count > 0) {
      bigrams.set(bg, count - 1)
      intersection++
    }
  }
  return (2 * intersection) / (s1.length - 1 + (s2.length - 1))
}
