import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'

/**
 * Renderer data-access hooks — the thin layer between components and `window.wist`.
 *
 * They collapse the load → null-sentinel → `.catch` → `onDataChanged`-resubscribe
 * boilerplate that was copy-pasted across ~10 pages into one place, and they ALWAYS
 * `.catch` the loader: a Spinner-gated promise that rejects would otherwise hang the
 * page forever (the global unhandledrejection handler swallows it — see the
 * loader-catch rule).
 *
 * Mutations stay plain calls (see the per-domain modules): the main process emits
 * `data-changed` after every write, and `watch` re-fetches — so a write anywhere
 * (this window, the agent HTTP API, a backup restore) converges every mounted view.
 */

type Watch = string | string[]

// 'all' is broadcast by a backup-restore / clear-database — always re-read on it
function matches(watch: Watch | undefined, kind: string): boolean {
  if (kind === 'all') return true
  if (watch == null) return false
  return Array.isArray(watch) ? watch.includes(kind) : watch === kind
}

export interface ListResource<T> {
  /** null while the first load is in flight (matches the legacy `data === null` sentinel). */
  data: T[] | null
  loading: boolean
  error: unknown
  reload: () => Promise<void>
  /** Direct setter for optimistic updates; the next reload reconciles with the db. */
  setData: Dispatch<SetStateAction<T[] | null>>
}

/**
 * Subscribe a component to a live list from `window.wist`.
 * @param fetcher  returns the rows (re-created freely — captured by ref, never stale)
 * @param watch    data-changed kind(s) that should trigger a reload (e.g. 'tasks')
 * @param deps     re-fetch when these change (e.g. a filter / projectId)
 */
export function useList<T>(fetcher: () => Promise<T[]>, watch?: Watch, deps: unknown[] = []): ListResource<T> {
  const [data, setData] = useState<T[] | null>(null)
  const [error, setError] = useState<unknown>(null)
  const seq = useRef(0)
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

  const reload = useCallback(() => {
    const s = ++seq.current
    return fetcherRef
      .current()
      .then((r) => {
        if (s === seq.current) {
          setData(r)
          setError(null)
        }
      })
      .catch((e) => {
        // never let a rejected loader hang a Spinner-gated page — surface [] + the error
        if (s === seq.current) {
          console.error('[data] list load failed', e)
          setError(e)
          setData((p) => p ?? [])
        }
      })
  }, [])

  useEffect(() => {
    reload()
    return window.wist.events.onDataChanged((kind) => {
      if (matches(watch, kind)) reload()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return { data, loading: data === null, error, reload, setData }
}

export interface ItemResource<T> {
  data: T | null
  loading: boolean
  error: unknown
  reload: () => Promise<void>
  setData: Dispatch<SetStateAction<T | null>>
}

/** Single-item variant of {@link useList} (e.g. one project / canvas by id). */
export function useItem<T>(fetcher: () => Promise<T | null>, watch?: Watch, deps: unknown[] = []): ItemResource<T> {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [loaded, setLoaded] = useState(false)
  const seq = useRef(0)
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

  const reload = useCallback(() => {
    const s = ++seq.current
    return fetcherRef
      .current()
      .then((r) => {
        if (s === seq.current) {
          setData(r)
          setError(null)
          setLoaded(true)
        }
      })
      .catch((e) => {
        if (s === seq.current) {
          console.error('[data] item load failed', e)
          setError(e)
          setLoaded(true)
        }
      })
  }, [])

  useEffect(() => {
    reload()
    return window.wist.events.onDataChanged((kind) => {
      if (matches(watch, kind)) reload()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return { data, loading: !loaded, error, reload, setData }
}
