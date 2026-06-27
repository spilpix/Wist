import { useState, type ReactNode } from 'react'
import Modal from '../components/ui/Modal'
import Button from '../components/ui/Button'
import { useI18n } from '../i18n'
import type { CanvasNode } from '../types/models'
import { ACTIVE, ACTIVE_RGB, ROUND_RECT_RADIUS } from './constants'
import { HANDLES, SIDE_HANDLES, type Sign } from './boardGeometry'

// Presentational leaves of the canvas board — extracted from CanvasBoard.tsx so the page
// file holds only its (large) board function, not these stateless widgets too.

export function TopBtn({ active, title, onClick, children }: { active?: boolean; title: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`flex h-9 w-9 items-center justify-center rounded-xl transition-all duration-150 active:scale-90 ${
        active ? 'bg-accent-subtle text-accent-bright' : 'text-[rgb(var(--ink-200))] hover:bg-highlight hover:text-[rgb(var(--ink-0))]'
      }`}
    >
      {children}
    </button>
  )
}

export function MenuItem({ label, onClick, danger, disabled }: { label: string; onClick: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={`block w-full rounded-lg px-3 py-1.5 text-left transition-colors disabled:opacity-40 ${
        danger ? 'text-danger hover:bg-highlight' : 'text-zinc-300 hover:bg-raised hover:text-white'
      }`}
    >
      {label}
    </button>
  )
}

export function SelectionFrame({
  n,
  cam,
  resizable,
  rotatable,
  roundable,
  onResize,
  onRotate,
  onRadius,
}: {
  n: CanvasNode
  cam: { x: number; y: number; k: number }
  resizable: boolean
  rotatable: boolean
  roundable: boolean
  onResize: (e: React.PointerEvent, n: CanvasNode, sign: Sign) => void
  onRotate: (e: React.PointerEvent, n: CanvasNode) => void
  onRadius: (e: React.PointerEvent, n: CanvasNode, corner: Sign) => void
}) {
  const sx = cam.x + n.x * cam.k
  const sy = cam.y + n.y * cam.k
  const w = n.w * cam.k
  const h = n.h * cam.k
  // current corner radius (screen px) → place the round handles just inside each corner
  const rWorld = n.radius ?? (n.type === 'shape' && n.shape === 'roundRect' ? ROUND_RECT_RADIUS : n.type === 'sticky' || n.type === 'image' ? 6 : 0)
  const inset = Math.min(Math.max(rWorld * cam.k, 14), Math.min(w, h) / 2 - 2)
  const showRound = roundable && !n.locked && Math.min(w, h) > 48
  // text grows its own height (auto-height) → expose width handles only
  const widthOnly = n.type === 'text'
  const sideHandles = widthOnly ? SIDE_HANDLES.filter((hd) => hd.sign[1] === 0) : SIDE_HANDLES
  const cornerHandles = widthOnly ? [] : HANDLES
  return (
    <div
      className="pointer-events-none absolute"
      style={{ left: sx, top: sy, width: w, height: h, transform: n.rotation ? `rotate(${n.rotation}deg)` : undefined, transformOrigin: 'center' }}
    >
      <div className="absolute inset-0 border" style={{ borderColor: ACTIVE }} />

      {/* corner-radius handles (Figma): small circles inset from each corner */}
      {showRound &&
        HANDLES.map((hd) => {
          const cx = hd.sign[0] < 0 ? inset : w - inset
          const cy = hd.sign[1] < 0 ? inset : h - inset
          return (
            <div
              key={`r-${hd.key}`}
              className="pointer-events-auto absolute h-2 w-2 rounded-full border bg-[#fff]"
              style={{ borderColor: ACTIVE, left: cx, top: cy, transform: 'translate(-50%, -50%)', cursor: 'pointer' }}
              title="Radius"
              onPointerDown={(e) => onRadius(e, n, hd.sign)}
            />
          )
        })}

      {!n.locked && resizable && (
        <>
          {/* side-midpoint handles — single-axis resize */}
          {sideHandles.map((hd) => {
            const px = hd.sign[0] < 0 ? 0 : hd.sign[0] > 0 ? w : w / 2
            const py = hd.sign[1] < 0 ? 0 : hd.sign[1] > 0 ? h : h / 2
            return (
              <div
                key={hd.key}
                data-resize-handle={hd.key}
                className="pointer-events-auto absolute h-2.5 w-2.5 rounded-[3px] border bg-[#fff] shadow-sm"
                style={{ borderColor: ACTIVE, left: px, top: py, transform: 'translate(-50%, -50%)', cursor: hd.cursor }}
                onPointerDown={(e) => onResize(e, n, hd.sign)}
              />
            )
          })}
          {/* corner handles — two-axis resize */}
          {cornerHandles.map((hd) => {
            const px = hd.sign[0] < 0 ? 0 : w
            const py = hd.sign[1] < 0 ? 0 : h
            return (
              <div
                key={hd.key}
                data-resize-handle={hd.key}
                className="pointer-events-auto absolute h-2.5 w-2.5 rounded-[3px] border bg-[#fff] shadow"
                style={{ borderColor: ACTIVE, left: px, top: py, transform: 'translate(-50%, -50%)', cursor: hd.cursor }}
                onPointerDown={(e) => onResize(e, n, hd.sign)}
              />
            )
          })}
        </>
      )}
      {!n.locked && rotatable && (
        <>
          <div
            data-rotate-handle="1"
            className="pointer-events-auto absolute h-3 w-3 rounded-full border bg-[#fff]"
            style={{ borderColor: ACTIVE, left: w / 2, top: -24, transform: 'translate(-50%, -50%)', cursor: 'grab' }}
            onPointerDown={(e) => onRotate(e, n)}
          />
          <div className="absolute" style={{ background: `rgb(${ACTIVE_RGB} / 0.6)`, left: w / 2 - 0.5, top: -24, width: 1, height: 24 }} />
        </>
      )}
    </div>
  )
}

export function LinkModal({ initial, onClose, onSave }: { initial: string; onClose: () => void; onSave: (href: string) => void }) {
  const { t } = useI18n()
  const [v, setV] = useState(initial)
  return (
    <Modal title={t('canvas.link')} onClose={onClose} width="max-w-sm">
      <input
        autoFocus
        className="input mb-4"
        placeholder="https://…"
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onSave(v.trim())}
      />
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>{t('common.cancel')}</Button>
        <Button variant="accent" onClick={() => onSave(v.trim())}>
          {t('common.save')}
        </Button>
      </div>
    </Modal>
  )
}
