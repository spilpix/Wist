import { useMemo, useRef, useState } from 'react'
import {
  UNSAFE_LocationContext as LocationContext,
  UNSAFE_NavigationContext as NavigationContext,
  UNSAFE_RouteContext as RouteContext,
} from 'react-router-dom'

/**
 * An INDEPENDENT in-app router for the split pane. React Router v6 forbids nesting
 * a real `<Router>` (MemoryRouter/RouterProvider both render one → "You cannot
 * render a <Router> inside another <Router>"), so this replicates exactly what
 * `<Router>` provides — NavigationContext + LocationContext over a tiny in-memory
 * history — minus that nesting guard. Result: `useNavigate`, `<Link>`, `navigate(-1)`,
 * `useParams`, `useSearchParams` inside the pane all operate on the PANE's own
 * history, fully independent of the main window (the Chrome/Edge/Arc split model).
 */

type Loc = { pathname: string; search: string; hash: string; state: unknown; key: string }

const NavCtx = NavigationContext as unknown as React.Context<unknown>
const LocCtx = LocationContext as unknown as React.Context<unknown>
// reset the matched-route context so the pane's <Routes> matches from a clean root
// (it's rendered deep inside the app's route tree, where this context is NOT empty)
const RouteCtx = RouteContext as unknown as React.Context<unknown>
const ROOT_ROUTE = { outlet: null, matches: [], isDataRoute: false }

const rkey = () => Math.random().toString(36).slice(2, 10)

function parsePath(p: string): { pathname: string; search: string; hash: string } {
  let pathname = p
  let hash = ''
  let search = ''
  const h = pathname.indexOf('#')
  if (h >= 0) {
    hash = pathname.slice(h)
    pathname = pathname.slice(0, h)
  }
  const q = pathname.indexOf('?')
  if (q >= 0) {
    search = pathname.slice(q)
    pathname = pathname.slice(0, q)
  }
  return { pathname: pathname || '/', search, hash }
}

function toLoc(to: unknown, state?: unknown): Loc {
  const pp = typeof to === 'string' ? parsePath(to) : (to as Partial<Loc>)
  return {
    pathname: pp.pathname || '/',
    search: pp.search || '',
    hash: pp.hash || '',
    state: state ?? (typeof to === 'object' && to ? (to as { state?: unknown }).state : null) ?? null,
    key: rkey(),
  }
}

export default function PaneRouter({ initialPath, children }: { initialPath: string; children: React.ReactNode }) {
  const [stack, setStack] = useState(() => ({ entries: [toLoc(initialPath)], index: 0 }))
  const action = useRef<'POP' | 'PUSH' | 'REPLACE'>('POP')
  const location = stack.entries[stack.index]

  const navigator = useMemo(
    () => ({
      createHref: (to: unknown) =>
        typeof to === 'string' ? to : `${(to as Partial<Loc>).pathname ?? ''}${(to as Partial<Loc>).search ?? ''}${(to as Partial<Loc>).hash ?? ''}`,
      encodeLocation: (to: unknown) => {
        const pp = typeof to === 'string' ? parsePath(to) : (to as Partial<Loc>)
        return { pathname: pp.pathname ?? '', search: pp.search ?? '', hash: pp.hash ?? '' }
      },
      push: (to: unknown, state?: unknown) => {
        action.current = 'PUSH'
        setStack((s) => {
          const entries = s.entries.slice(0, s.index + 1)
          entries.push(toLoc(to, state))
          return { entries, index: entries.length - 1 }
        })
      },
      replace: (to: unknown, state?: unknown) => {
        action.current = 'REPLACE'
        setStack((s) => {
          const entries = s.entries.slice()
          entries[s.index] = toLoc(to, state)
          return { entries, index: s.index }
        })
      },
      go: (delta: number) => {
        action.current = 'POP'
        setStack((s) => ({ entries: s.entries, index: Math.min(s.entries.length - 1, Math.max(0, s.index + delta)) }))
      },
    }),
    []
  )

  const navigationValue = useMemo(
    () => ({ basename: '/', navigator, static: false, future: { v7_relativeSplatPath: false } }),
    [navigator]
  )
  const locationValue = useMemo(() => ({ location, navigationType: action.current }), [location])

  return (
    <NavCtx.Provider value={navigationValue}>
      <LocCtx.Provider value={locationValue}>
        <RouteCtx.Provider value={ROOT_ROUTE}>{children}</RouteCtx.Provider>
      </LocCtx.Provider>
    </NavCtx.Provider>
  )
}
