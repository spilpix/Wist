import { useEffect } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import Home from './pages/Home'
import Library from './pages/Library'
import TitleDetail from './pages/TitleDetail'
import ContinueWatching from './pages/ContinueWatching'
import Favorites from './pages/Favorites'
import Moments from './pages/Moments'
import Notes from './pages/Notes'
import MemoryTree from './pages/MemoryTree'
import LocalFiles from './pages/LocalFiles'
import YouTubeSources from './pages/YouTubeSources'
import Statistics from './pages/Statistics'
import SettingsPage from './pages/Settings'
import Player from './pages/Player'
import { useSettingsStore } from './store/settingsStore'

export default function App() {
  const loadSettings = useSettingsStore((s) => s.load)

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

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
          <Route path="/tree" element={<MemoryTree />} />
          <Route path="/local" element={<LocalFiles />} />
          <Route path="/youtube" element={<YouTubeSources />} />
          <Route path="/stats" element={<Statistics />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
        <Route path="/player/:episodeId" element={<Player />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  )
}
