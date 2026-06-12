import { Outlet } from 'react-router-dom'
import { Play } from 'lucide-react'
import Sidebar from './Sidebar'
import Toaster from './ui/Toaster'

/** Slim draggable title bar; native Windows window controls overlay the right edge. */
function TitleBar() {
  return (
    <header className="app-drag flex h-9 shrink-0 items-center gap-2 border-b border-edge/60 bg-surface px-4">
      <span className="flex h-5 w-5 items-center justify-center rounded-md bg-accent">
        <Play size={10} className="fill-white text-white" />
      </span>
      <span className="text-[13px] font-semibold tracking-tight text-zinc-300">Wist</span>
    </header>
  )
}

export default function Layout() {
  return (
    <div className="flex h-full flex-col">
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="min-w-0 flex-1 bg-bg">
          <Outlet />
        </main>
        <Toaster />
      </div>
    </div>
  )
}
