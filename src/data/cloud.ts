// THE cloud (Supabase) boundary — the ONLY module that imports lib/supabase. Workspace
// components get the client + the realtime helper from here, so collaborative cloud access
// has a single typed seam (mirrors how src/data wraps the local window.wist surface).
// ⚠️ anon key is in source + RLS is off (pre-existing, see [[bard-notion-overhaul-roadmap]]).
import { supabase } from '../lib/supabase'

export { supabase }

/**
 * Subscribe to row changes on a workspace/canvas-scoped table; returns an unsubscribe fn.
 * Collapses the channel → on(postgres_changes) → subscribe → removeChannel boilerplate that
 * was copy-pasted in every workspace component (and the store). The handler optionally
 * receives the realtime payload (a plain `reload` callback just ignores it).
 */
export interface ChangePayload {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE'
  new: any // eslint-disable-line @typescript-eslint/no-explicit-any
  old: any // eslint-disable-line @typescript-eslint/no-explicit-any
}

export function subscribe(
  channel: string,
  table: string,
  filter: string,
  onChange: (payload: ChangePayload) => void
): () => void {
  const ch = supabase
    .channel(channel)
    .on('postgres_changes', { event: '*', schema: 'public', table, filter }, (payload) => onChange(payload as ChangePayload))
    .subscribe()
  return () => {
    supabase.removeChannel(ch)
  }
}
