import { useCallback, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { Columns2, Plus, X } from 'lucide-react'
import { useTabStore } from '../store/tabStore'
import { useUiStore } from '../store/uiStore'
import { usePreviewStore } from '../store/previewStore'
import { routeMeta } from '../lib/routeMeta'
import { dragHasDroppable } from '../lib/mediaDrag'
import { useSpringNav } from '../lib/useSpringNav'
import { useI18n } from '../i18n'

const GAP = 4 // px — matches the flex `gap-1` between tabs

type DragData = {
  id: string
  index: number
  path: string
  startX: number
  items: { id: string; left: number; width: number }[] // rest geometry, captured once
  moved: boolean
  order: string[] | null
}

/**
 * Browser-style workspace tabs. Dragging uses POINTER events (not HTML5 dnd, which is
 * both ugly — the ghost image — and suppressed inside Electron app-region strips): the
 * grabbed tab follows the cursor while every other tab slides (CSS transition) to open a
 * gap exactly where it will land. A drag under 5px is treated as a click → navigate.
 */
export default function TabBar() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const tabs = useTabStore((s) => s.tabs)
  const activeId = useTabStore((s) => s.activeId)
  const closeTab = useTabStore((s) => s.closeTab)
  const reorder = useTabStore((s) => s.reorder)
  const split = useUiStore((s) => s.split)
  const setSplit = useUiStore((s) => s.setSplit)

  // spring-loaded tabs: pausing a media/file drag over a tab switches to it — so you can
  // drag an item from one section onto a board/hub that's open in another tab, then drop
  const spring = useSpringNav((id) => {
    const tab = useTabStore.getState().tabs.find((tb) => tb.id === id)
    if (tab) navigate(tab.path)
  })

  const stripRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragData | null>(null)
  const [view, setView] = useState<{ id: string; dx: number; shift: Record<string, number> } | null>(null)

  // browser-style hover preview: a thumbnail popover anchored under the hovered tab
  const previews = usePreviewStore((s) => s.previews)
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [hover, setHover] = useState<{ id: string; left: number; top: number } | null>(null)
  const clearHover = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current)
    setHover(null)
  }
  const armHover = (e: React.PointerEvent, id: string) => {
    if (e.pointerType !== 'mouse') return
    if (id === activeId) return // the active tab is already on screen — no preview for it
    const el = e.currentTarget as HTMLElement
    if (hoverTimer.current) clearTimeout(hoverTimer.current)
    hoverTimer.current = setTimeout(() => {
      const r = el.getBoundingClientRect()
      setHover({ id, left: Math.min(r.left, window.innerWidth - 272), top: r.bottom + 6 })
    }, 320)
  }

  const onMove = useCallback((e: PointerEvent) => {
    const d = dragRef.current
    if (!d) return
    const dx = e.clientX - d.startX
    if (!d.moved && Math.abs(dx) < 5) return // a real drag only past a small threshold
    d.moved = true
    // Opera/Vivaldi model: dragging a tab DOWN into the page area (below the tab
    // strip) arms the split-screen drop — far more discoverable than a right-edge zone
    useUiStore.getState().setSplitArmed(e.clientY > 64)
    const { items, index: di } = d
    if (!items[di]) return
    const draggedCenter = items[di].left + items[di].width / 2 + dx
    // where it would be inserted among the OTHER tabs
    let target = 0
    for (let i = 0; i < items.length; i++) {
      if (i === di) continue
      if (items[i].left + items[i].width / 2 < draggedCenter) target++
    }
    const order = items.map((it) => it.id)
    order.splice(di, 1)
    order.splice(target, 0, d.id)
    d.order = order
    // lay the new order out left-to-right from the first tab's rest position
    const widthById = new Map(items.map((it) => [it.id, it.width]))
    let cursor = items[0].left
    const newLeft: Record<string, number> = {}
    for (const id of order) {
      newLeft[id] = cursor
      cursor += (widthById.get(id) ?? 0) + GAP
    }
    const shift: Record<string, number> = {}
    for (const it of items) if (it.id !== d.id) shift[it.id] = newLeft[it.id] - it.left
    setView({ id: d.id, dx, shift })
  }, [])

  const endDrag = useCallback(() => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', endDrag)
    window.removeEventListener('pointercancel', endDrag)
    const d = dragRef.current
    dragRef.current = null
    setView(null)
    const armed = useUiStore.getState().splitArmed
    useUiStore.getState().setSplitArmed(false)
    if (!d) return
    if (d.moved && armed) {
      useUiStore.getState().setSplit(d.path) // dropped in the split zone → open it on the right
      return
    }
    if (d.moved && d.order) {
      // keep the tiled "island" pair pinned to the front (they're excluded from the drag)
      const s = useUiStore.getState().split
      const { tabs: cur, activeId: aid } = useTabStore.getState()
      const act = cur.find((tb) => tb.id === aid)
      const spl = s ? cur.find((tb) => tb.path === s) : undefined
      const front = s && spl && act && spl.id !== act.id ? [act.id, spl.id] : []
      reorder(front.length ? [...front, ...d.order.filter((id) => !front.includes(id))] : d.order)
    } else navigate(d.path) // it was a click, not a drag
  }, [onMove, reorder, navigate])

  const beginDrag = (e: React.PointerEvent, index: number) => {
    if (e.button !== 0) return
    if ((e.target as HTMLElement).closest('[data-tab-close]')) return // let the × handle itself
    clearHover() // dragging — hide any open preview
    const strip = stripRef.current
    if (!strip) return
    const els = Array.from(strip.querySelectorAll<HTMLElement>('[data-tab-id]'))
    const items = els.map((el) => {
      const r = el.getBoundingClientRect()
      return { id: el.dataset.tabId as string, left: r.left, width: r.width }
    })
    if (!items.length || !tabs[index]) return
    dragRef.current = { id: tabs[index].id, index, path: tabs[index].path, startX: e.clientX, items, moved: false, order: null }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', endDrag)
    window.addEventListener('pointercancel', endDrag)
  }

  // the two tiled tabs (active + split) merge into a single "island" chip
  const activeTab = tabs.find((tb) => tb.id === activeId)
  const splitTab = split ? tabs.find((tb) => tb.path === split) : undefined
  const tiled = !!(split && splitTab && activeTab && splitTab.id !== activeTab.id)
  const islandIds = tiled ? new Set([activeTab!.id, splitTab!.id]) : new Set<string>()
  const swap = () => {
    if (split && activeTab) {
      setSplit(activeTab.path)
      navigate(split)
    }
  }

  const hoverTab = hover ? tabs.find((tb) => tb.id === hover.id) : undefined
  const hoverMeta = hoverTab ? routeMeta(hoverTab.path, t) : null

  return (
    <>
    <div ref={stripRef} className="app-no-drag no-scrollbar flex min-w-0 shrink select-none items-center gap-1 overflow-x-auto">
      {/* tiled island: the two split tabs shown as one connected pill */}
      {tiled && activeTab && splitTab && (
        <div className="flex h-[34px] shrink-0 items-center gap-0.5 rounded-lg bg-accent/10 px-1 ring-1 ring-accent/40 animate-scale-in">
          <Columns2 size={13} className="ml-0.5 shrink-0 text-accent-bright" />
          {[activeTab, splitTab].map((tb, idx) => {
            const meta = routeMeta(tb.path, t)
            const ChipIcon = meta.icon
            const isMain = idx === 0
            return (
              <button
                key={tb.id}
                onClick={() => (isMain ? navigate(tb.path) : swap())}
                data-tip={tb.title || meta.label}
                className={`flex h-[28px] max-w-[140px] items-center gap-1.5 rounded-md px-2 text-[13px] transition-colors ${
                  isMain ? 'bg-bg font-medium text-zinc-100 shadow-[var(--card-shadow)]' : 'text-zinc-400 hover:bg-highlight hover:text-zinc-200'
                }`}
              >
                <ChipIcon size={14} className={`shrink-0 ${isMain ? 'text-accent-bright' : ''}`} />
                <span className="min-w-0 truncate">{tb.title || meta.label}</span>
              </button>
            )
          })}
          <button
            onClick={() => setSplit(null)}
            data-tip={t('split.close')}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-zinc-500 transition-colors hover:bg-highlight hover:text-zinc-200"
          >
            <X size={13} />
          </button>
        </div>
      )}
      {tabs.map((tab, i) => {
        if (islandIds.has(tab.id)) return null // shown inside the island instead
        const { icon: Icon, label } = routeMeta(tab.path, t)
        const active = tab.id === activeId
        const dragging = view?.id === tab.id
        const shift = view && !dragging ? view.shift[tab.id] ?? 0 : 0
        const style: React.CSSProperties = dragging
          ? { transform: `translateX(${view!.dx}px)`, zIndex: 30, transition: 'none', boxShadow: 'var(--float-shadow)' }
          : view
            ? { transform: `translateX(${shift}px)`, transition: 'transform 180ms cubic-bezier(.2,0,0,1)' }
            : {}
        return (
          <div
            key={tab.id}
            data-tab-id={tab.id}
            role="button"
            tabIndex={0}
            aria-label={tab.title || label}
            style={style}
            onPointerEnter={(e) => armHover(e, tab.id)}
            onPointerLeave={clearHover}
            onPointerDown={(e) => beginDrag(e, i)}
            onDragOver={(e) => {
              if (!dragHasDroppable(e)) return
              e.preventDefault()
              e.dataTransfer.dropEffect = 'copy'
              spring.enter(tab.id)
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) spring.cancel()
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                navigate(tab.path)
              } else if (e.key === 'Delete' || e.key === 'Backspace') {
                e.preventDefault()
                const to = closeTab(tab.id)
                if (to) navigate(to)
              }
            }}
            onAuxClick={(e) => {
              if (e.button === 1) {
                e.preventDefault()
                const to = closeTab(tab.id)
                if (to) navigate(to)
              }
            }}
            className={`group relative flex h-[34px] min-w-[3.25rem] max-w-[210px] shrink items-center gap-2 rounded-lg px-2.5 text-[13px] ${
              dragging ? 'cursor-grabbing ring-1 ring-edge' : 'cursor-pointer transition-colors duration-150'
            } ${active ? 'bg-bg font-medium text-zinc-100 ring-1 ring-edge shadow-[var(--card-shadow)]' : 'bg-raised/50 text-zinc-400 ring-1 ring-edge hover:bg-highlight hover:text-zinc-100'} ${
              spring.armed === tab.id ? '!bg-accent/10 !ring-1 !ring-accent/70' : ''
            }`}
          >
            {/* icon inherits the chip's ink (neutral) — the white pill + ring is the active
                signal, never a colour, just like Notion */}
            <Icon size={15} className="shrink-0" />
            <span className="min-w-0 flex-1 truncate">{tab.title || label}</span>
            <button
              data-tab-close
              onClick={(e) => {
                e.stopPropagation()
                const to = closeTab(tab.id)
                if (to) navigate(to)
              }}
              title={t('tabs.close')}
              className={`-mr-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-lg text-zinc-500 transition-all hover:bg-highlight hover:text-zinc-200 ${
                active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
              }`}
            >
              <X size={14} />
            </button>
          </div>
        )
      })}
      <button
        onClick={() => navigate('/')}
        data-tip={t('tabs.new')}
        data-tip-kbd="Ctrl T"
        className="app-no-drag ml-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-highlight hover:text-zinc-200"
      >
        <Plus size={17} />
      </button>
    </div>

    {/* browser-style hover preview — page thumbnail + title, in a portal so the
        overflow-x-auto strip can't clip it */}
    {hover && hoverTab && hoverMeta && !view && hover.id !== activeId &&
      createPortal(
        <div
          className="pointer-events-none fixed z-[70] w-64 overflow-hidden rounded-xl border border-edge bg-card animate-scale-in"
          style={{ left: hover.left, top: hover.top, transformOrigin: 'top left', boxShadow: 'var(--float-shadow)' }}
        >
          <div className="aspect-[16/10] w-full overflow-hidden border-b border-edge bg-raised">
            {previews[hoverTab.path.split('?')[0]] ? (
              <img src={previews[hoverTab.path.split('?')[0]]} alt="" className="h-full w-full object-cover object-top" />
            ) : (
              <div
                className="flex h-full w-full items-center justify-center"
                style={{ background: 'linear-gradient(135deg, rgb(var(--accent-rgb) / 0.18), rgb(var(--accent-rgb) / 0.04))' }}
              >
                <hoverMeta.icon size={34} className="text-accent-bright opacity-70" />
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 px-2.5 py-2">
            <hoverMeta.icon size={14} className="shrink-0 text-zinc-500" />
            <div className="min-w-0">
              <div className="truncate text-[12.5px] font-medium text-zinc-100">{hoverTab.title || hoverMeta.label}</div>
              <div className="truncate text-[11px] text-zinc-500">{hoverMeta.label}</div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
