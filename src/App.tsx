import { useEffect } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import { pageRouteElements } from './routes'
import { physKey } from './lib/keyboard'
import { useSettingsStore } from './store/settingsStore'
import { useWorkspaceStore } from './store/workspaceStore'

export default function App() {
  const loadSettings = useSettingsStore((s) => s.load)
  const initWorkspace = useWorkspaceStore((s) => s.init)

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  useEffect(() => {
    initWorkspace()
  }, [initWorkspace])

  // Ctrl/Cmd+A must never "select all the page" — only act inside a real text field.
  // Page-specific handlers (e.g. the canvas "select all nodes") still run; we only
  // suppress the browser's native select-all default when focus isn't in an input.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || physKey(e) !== 'a') return
      const el = e.target as HTMLElement | null
      const editable = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
      if (!editable) e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>{pageRouteElements()}</Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  )
}
