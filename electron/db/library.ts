import { db } from './database'
import type { LibraryCategorySummary, LibrarySummary } from '../../src/types/models'

/**
 * One authoritative roll-up of EVERYTHING in Bard, grouped into the Library hub's
 * categories. Counts/cover-previews are read straight from the source tables — NOT
 * from whatever the UI happens to have loaded — so the "Мои файлы" tiles always
 * reflect the real data no matter where it was added:
 *   - videos / books → the `titles` table (the /video page + Library both write here)
 *   - music          → the local `tracks` table (the /music library)
 *   - images/docs/files → the whole `vault_files` tree (every nesting level)
 */
export function librarySummary(): LibrarySummary {
  const d = db()
  const num = (sql: string, ...p: unknown[]) => (d.prepare(sql).get(...p) as { c: number } | undefined)?.c ?? 0
  const list = (sql: string, ...p: unknown[]) => (d.prepare(sql).all(...p) as Array<{ x: string }>).map((r) => r.x)

  const titleCat = (book: boolean): LibraryCategorySummary => {
    const op = book ? '=' : '!='
    return {
      count: num(`SELECT COUNT(*) c FROM titles WHERE type ${op} 'book'`),
      covers: list(`SELECT cover_path x FROM titles WHERE type ${op} 'book' AND cover_path IS NOT NULL ORDER BY date_added DESC LIMIT 4`),
    }
  }

  return {
    videos: titleCat(false),
    books: titleCat(true),
    music: {
      count: num('SELECT COUNT(*) c FROM tracks'),
      // one cover per distinct album (art repeats across a record), newest first
      covers: list('SELECT cover_path x FROM tracks WHERE cover_path IS NOT NULL GROUP BY cover_path ORDER BY MAX(added_at) DESC LIMIT 4'),
    },
    documents: {
      count: num("SELECT COUNT(*) c FROM vault_files WHERE kind = 'doc'"),
      covers: [],
    },
    images: {
      count: num("SELECT COUNT(*) c FROM vault_files WHERE kind = 'image'"),
      covers: list("SELECT path x FROM vault_files WHERE kind = 'image' AND path IS NOT NULL ORDER BY created_at DESC LIMIT 4"),
    },
    files: {
      // the catch-all: every Vault entry that isn't an image (docs, audio, video,
      // archives, other, and folders/links — matches what the Files view shows)
      count: num("SELECT COUNT(*) c FROM vault_files WHERE kind != 'image'"),
      covers: [],
    },
  }
}
