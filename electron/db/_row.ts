import type { ObjectProps } from '../../src/types/models'

/**
 * Shared row-mapping helpers for the db layer. Tags are stored in a TEXT column as a
 * JSON string-array; props as a JSON object. These coerce a raw column value into a
 * safe shape (bad/legacy/missing JSON → empty), so every repository maps rows the
 * same way instead of copy-pasting the same guards. See [[bard-notion-overhaul-roadmap]].
 */

/** Parse a JSON string-array column (e.g. `tags`) → string[]; anything invalid → []. */
export function safeParse(v: unknown): string[] {
  if (typeof v !== 'string') return []
  try {
    const parsed = JSON.parse(v)
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

/** Parse a JSON object column (`props`) → ObjectProps; arrays/invalid → {}. */
export function safeParseObject(v: unknown): ObjectProps {
  if (typeof v !== 'string') return {}
  try {
    const p = JSON.parse(v)
    return p && typeof p === 'object' && !Array.isArray(p) ? p : {}
  } catch {
    return {}
  }
}

/** Serialize a props bag for storage; non-objects / arrays → '{}'. */
export const stringifyProps = (v: unknown): string =>
  JSON.stringify(v && typeof v === 'object' && !Array.isArray(v) ? v : {})
