import { useRef, useState } from 'react'
import TaskPeek from './TaskPeek'
import type { Task } from '../types/models'

/**
 * The task detail as a resizable panel docked on the RIGHT (Notion "peek"). It opens
 * on click, takes about half the screen, and a drag handle on its left edge lets you
 * change the width (persisted). The list to its left simply shrinks to make room.
 */
export default function TaskPeekDock({ task, onClose, onChanged }: { task: Task; onClose: () => void; onChanged: () => void }) {
  const [width, setWidth] = useState(() => {
    const s = Number(localStorage.getItem('wist.peekWidth'))
    return s >= 360 ? s : 560
  })
  const wRef = useRef(width)

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startW = wRef.current
    const onMove = (ev: MouseEvent) => {
      const max = Math.min(window.innerWidth * 0.72, 920)
      const w = Math.max(380, Math.min(startW - (ev.clientX - startX), max))
      wRef.current = w
      setWidth(w)
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      try {
        localStorage.setItem('wist.peekWidth', String(Math.round(wRef.current)))
      } catch {
        /* storage unavailable */
      }
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  return (
    <div className="relative flex h-full shrink-0 animate-slide-in-right" style={{ width }}>
      {/* drag handle on the left edge */}
      <div onMouseDown={startResize} className="group absolute -left-1.5 top-0 z-10 flex h-full w-3 cursor-col-resize items-center justify-center" data-tip-cursor>
        <span className="h-full w-px bg-edge transition-colors group-hover:bg-accent" />
      </div>
      <div className="h-full w-full overflow-hidden border-l border-edge bg-card">
        <TaskPeek key={task.id} task={task} onClose={onClose} onChanged={onChanged} />
      </div>
    </div>
  )
}
