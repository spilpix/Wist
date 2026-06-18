import React from 'react'
import ReactDOM from 'react-dom/client'
import '@fontsource-variable/inter'
import './index.css'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import { initScrollbars } from './lib/scrollbars'

// never let a stray rejected promise (e.g. a failed IPC call) bubble up as a crash
window.addEventListener('unhandledrejection', (e) => {
  console.error('Unhandled promise rejection:', e.reason)
  e.preventDefault()
})

// custom overlay scrollbars: reveal on scroll, fade out when idle
initScrollbars()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
)
