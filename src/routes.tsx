import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import Spinner from './components/ui/Spinner'
import Home from './pages/Home'
import Library from './pages/Library'
import TitleDetail from './pages/TitleDetail'
import ContinueWatching from './pages/ContinueWatching'
import Favorites from './pages/Favorites'
import Moments from './pages/Moments'
import Notes from './pages/Notes'
import Tasks from './pages/Tasks'
import Music from './pages/Music'
import Video from './pages/Video'
import Vault from './pages/Vault'
import Projects from './pages/Projects'
import ProjectDetail from './pages/ProjectDetail'
import Trash from './pages/Trash'
import Canvas from './pages/Canvas'
import CanvasBoard from './pages/CanvasBoard'
import LocalFiles from './pages/LocalFiles'
import YouTubeSources from './pages/YouTubeSources'
import SettingsPage from './pages/Settings'
import Profile from './pages/Profile'
import History from './pages/History'
import WorkspacePage from './pages/Workspace'

// heavy pages load on demand — keeps startup instant (recharts stays out of the main chunk)
const Statistics = lazy(() => import('./pages/Statistics'))
const MemoryTree = lazy(() => import('./pages/MemoryTree'))

const lazyPage = (el: React.ReactNode) => <Suspense fallback={<Spinner />}>{el}</Suspense>

/**
 * The in-Layout page routes — the single source of truth shared by the main
 * `<Outlet>` (App) and the split pane's independent `<MemoryRouter>` (Layout).
 * Returned as a fragment of <Route>s so it works both as nested-route children
 * and inside a standalone <Routes>.
 */
export function pageRouteElements() {
  return (
    <>
      <Route path="/" element={<Home />} />
      <Route path="/library" element={<Library />} />
      <Route path="/title/:id" element={<TitleDetail />} />
      <Route path="/continue" element={<ContinueWatching />} />
      <Route path="/favorites" element={<Favorites />} />
      <Route path="/moments" element={<Moments />} />
      <Route path="/notes" element={<Notes />} />
      <Route path="/tasks" element={<Tasks />} />
      <Route path="/music" element={<Music />} />
      <Route path="/video" element={<Video />} />
      <Route path="/vault" element={<Vault />} />
      <Route path="/projects" element={<Projects />} />
      <Route path="/project/:id" element={<ProjectDetail />} />
      <Route path="/trash" element={<Trash />} />
      <Route path="/canvas" element={<Canvas />} />
      <Route path="/canvas/:id" element={<CanvasBoard />} />
      <Route path="/tree" element={lazyPage(<MemoryTree />)} />
      <Route path="/local" element={<LocalFiles />} />
      <Route path="/youtube" element={<YouTubeSources />} />
      <Route path="/stats" element={lazyPage(<Statistics />)} />
      <Route path="/profile" element={<Profile />} />
      <Route path="/history" element={<History />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="/workspace" element={<WorkspacePage />} />
    </>
  )
}

/**
 * Route table for the split pane. Rendered inside `<PaneRouter>` (its own location
 * context — NOT a nested <Router>, which RR v6 forbids), so navigation here stays
 * in the pane. The catch-all <Navigate> is safe (it drives the pane's own router).
 */
export default function PaneRoutes() {
  return (
    <Routes>
      {pageRouteElements()}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
