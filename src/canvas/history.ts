import { useCallback, useReducer, useRef } from 'react'
import type { CanvasData } from '../types/models'

// Snapshot-based undo/redo. The board's live edits go through here; the camera
// (viewport) is kept OUT of history so panning/zooming never pollutes undo.
const LIMIT = 50

interface HistState {
  past: CanvasData[]
  present: CanvasData
  future: CanvasData[]
}

type Action =
  | { t: 'live'; data: CanvasData } // update present, no history entry (mid-gesture)
  | { t: 'commit'; data: CanvasData } // discrete change → push prev, set new
  | { t: 'commitFrom'; snapshot: CanvasData; data: CanvasData } // end gesture → push snapshot
  | { t: 'undo' }
  | { t: 'redo' }
  | { t: 'reset'; data: CanvasData }

function reducer(s: HistState, a: Action): HistState {
  switch (a.t) {
    case 'live':
      return { ...s, present: a.data }
    case 'commit':
      return { past: [...s.past, s.present].slice(-LIMIT), present: a.data, future: [] }
    case 'commitFrom':
      return { past: [...s.past, a.snapshot].slice(-LIMIT), present: a.data, future: [] }
    case 'undo': {
      if (!s.past.length) return s
      const prev = s.past[s.past.length - 1]
      return { past: s.past.slice(0, -1), present: prev, future: [s.present, ...s.future].slice(0, LIMIT) }
    }
    case 'redo': {
      if (!s.future.length) return s
      const next = s.future[0]
      return { past: [...s.past, s.present].slice(-LIMIT), present: next, future: s.future.slice(1) }
    }
    case 'reset':
      return { past: [], present: a.data, future: [] }
  }
}

export function useHistory(initial: CanvasData) {
  const [state, dispatch] = useReducer(reducer, { past: [], present: initial, future: [] })
  const ref = useRef(state)
  ref.current = state
  const gesture = useRef<CanvasData | null>(null)

  // read the freshest present synchronously inside pointer handlers
  const get = useCallback(() => ref.current.present, [])

  // discrete change — records history immediately
  const commit = useCallback((fn: (d: CanvasData) => CanvasData) => {
    dispatch({ t: 'commit', data: fn(ref.current.present) })
  }, [])

  // begin a continuous gesture (move / resize / rotate / text-edit): snapshot the
  // start. If a gesture is already open (e.g. grabbing a resize handle mid-edit),
  // flush it first as its own history entry instead of silently dropping the
  // snapshot — otherwise the in-flight edit becomes un-undoable.
  const begin = useCallback(() => {
    if (gesture.current != null && gesture.current !== ref.current.present) {
      dispatch({ t: 'commitFrom', snapshot: gesture.current, data: ref.current.present })
    }
    gesture.current = ref.current.present
  }, [])

  // live update during a gesture — no history entry yet
  const live = useCallback((fn: (d: CanvasData) => CanvasData) => {
    dispatch({ t: 'live', data: fn(ref.current.present) })
  }, [])

  // end a gesture — record the pre-gesture snapshot iff anything actually changed
  const end = useCallback(() => {
    const snap = gesture.current
    gesture.current = null
    if (snap && snap !== ref.current.present) {
      dispatch({ t: 'commitFrom', snapshot: snap, data: ref.current.present })
    }
  }, [])

  const undo = useCallback(() => dispatch({ t: 'undo' }), [])
  const redo = useCallback(() => dispatch({ t: 'redo' }), [])
  const reset = useCallback((data: CanvasData) => dispatch({ t: 'reset', data }), [])

  return {
    data: state.present,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    get,
    commit,
    begin,
    live,
    end,
    undo,
    redo,
    reset,
  }
}
