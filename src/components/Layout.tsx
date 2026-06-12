import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Toaster from './ui/Toaster'

export default function Layout() {
  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="min-w-0 flex-1 bg-bg">
        <Outlet />
      </main>
      <Toaster />
    </div>
  )
}
