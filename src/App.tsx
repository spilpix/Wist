import { lazy, Suspense, useEffect } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import Spinner from './components/ui/Spinner'
import Home from './pages/Home'
import Library from './pages/Library'
import TitleDetail from './pages/TitleDetail'
import ContinueWatching from './pages/ContinueWatching'
import Favorites from './pages/Favorites'
import Moments from './pages/Moments'
import Notes from './pages/Notes'
import Journal from './pages/Journal'
import Tasks from './pages/Tasks'
import Music from './pages/Music'
import Vault from './pages/Vault'
import Projects from './pages/Projects'
import ProjectDetail from './pages/ProjectDetail'
import League from './pages/League'
import LocalFiles from './pages/LocalFiles'
import YouTubeSources from './pages/YouTubeSources'
import SettingsPage from './pages/Settings'
import { useSettingsStore } from './store/settingsStore'

// heavy pages load on demand — keeps startup instant (recharts stays out of the main chunk)
const Statistics = lazy(() => import('./pages/Statistics'))
const MemoryTree = lazy(() => import('./pages/MemoryTree'))
const Player = lazy(() => import('./pages/Player'))

export default function App() {
  const loadSettings = useSettingsStore((s) => s.load)

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  // per-route Suspense keeps the sidebar mounted while a lazy chunk loads
  const lazyPage = (el: React.ReactNode) => <Suspense fallback={<Spinner />}>{el}</Suspense>

  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/library" element={<Library />} />
          <Route path="/title/:id" element={<TitleDetail />} />
          <Route path="/continue" element={<ContinueWatching />} />
          <Route path="/favorites" element={<Favorites />} />
          <Route path="/moments" element={<Moments />} />
          <Route path="/notes" element={<Notes />} />
          <Route path="/journal" element={<Journal />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/music" element={<Music />} />
          <Route path="/vault" element={<Vault />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/project/:id" element={<ProjectDetail />} />
          <Route path="/league" element={<League />} />
          <Route path="/tree" element={lazyPage(<MemoryTree />)} />
          <Route path="/local" element={<LocalFiles />} />
          <Route path="/youtube" element={<YouTubeSources />} />
          <Route path="/stats" element={lazyPage(<Statistics />)} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
        <Route
          path="/player/:episodeId"
          element={
            <Suspense fallback={<div className="force-dark flex h-full items-center justify-center bg-black"><Spinner /></div>}>
              <Player />
            </Suspense>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  )
}
