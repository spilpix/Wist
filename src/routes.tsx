import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import Spinner from './components/ui/Spinner'
import Home from './pages/Home'
import Favorites from './pages/Favorites'
import Notes from './pages/Notes'
import Tasks from './pages/Tasks'
import Vault from './pages/Vault'
import Projects from './pages/Projects'
import ProjectDetail from './pages/ProjectDetail'
import Trash from './pages/Trash'
import Canvas from './pages/Canvas'
import CanvasBoard from './pages/CanvasBoard'
import SettingsPage from './pages/Settings'
import Profile from './pages/Profile'
import History from './pages/History'
import WorkspacePage from './pages/Workspace'

// heavy pages load on demand — keeps startup instant
const MemoryTree = lazy(() => import('./pages/MemoryTree'))

const lazyPage = (el: React.ReactNode) => <Suspense fallback={<Spinner />}>{el}</Suspense>

/**
 * The in-Layout page routes — shared by the main <Outlet> (App) and the split
 * pane's independent <MemoryRouter> (Layout).
 */
export function pageRouteElements() {
  return (
    <>
      <Route path="/" element={<Home />} />
      <Route path="/favorites" element={<Favorites />} />
      <Route path="/notes" element={<Notes />} />
      <Route path="/tasks" element={<Tasks />} />
      <Route path="/vault" element={<Vault />} />
      <Route path="/projects" element={<Projects />} />
      <Route path="/project/:id" element={<ProjectDetail />} />
      <Route path="/trash" element={<Trash />} />
      <Route path="/canvas" element={<Canvas />} />
      <Route path="/canvas/:id" element={<CanvasBoard />} />
      <Route path="/tree" element={lazyPage(<MemoryTree />)} />
      <Route path="/profile" element={<Profile />} />
      <Route path="/history" element={<History />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="/workspace" element={<WorkspacePage />} />
    </>
  )
}

export default function PaneRoutes() {
  return (
    <Routes>
      {pageRouteElements()}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
