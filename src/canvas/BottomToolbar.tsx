import { useState } from 'react'
import {
  Brush,
  ChevronUp,
  Eraser,
  Frame as FrameIcon,
  Hand,
  Highlighter,
  Image as ImageIcon,
  Lasso,
  MessageCircle,
  MousePointer2,
  PenLine,
  Redo2,
  Spline,
  StickyNote,
  Type,
  Undo2,
  Wand2,
} from 'lucide-react'
import type { CanvasConnectorType, CanvasShape } from '../types/models'
import type { TKey, TParams } from '../i18n'
import { SHAPE_LIST, STICKY_COLORS, type ToolKey } from './constants'
import { shapePath } from './geometry'

type TFn = (key: TKey, params?: TParams) => string

export type PenStyle = { kind: 'pen' | 'marker' | 'highlighter' | 'eraser'; size: number; color: string; smart?: boolean }

interface Props {
  tool: ToolKey
  setTool: (t: ToolKey) => void
  shape: CanvasShape
  setShape: (s: CanvasShape) => void
  connType: CanvasConnectorType
  setConnType: (c: CanvasConnectorType) => void
  penStyle: PenStyle
  setPenStyle: (p: PenStyle) => void
  stickyFill: string
  setStickyFill: (c: string) => void
  onAddImage: () => void
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
  t: TFn
}

type Tool = { key: ToolKey | 'image'; icon: typeof Type; label: string; hint: string }

// the eight shapes shown by default; the rest appear behind "More shapes"
const COMMON: CanvasShape[] = ['rect', 'roundRect', 'ellipse', 'diamond', 'triangle', 'arrowRight', 'cylinder', 'hexagon']
// draw-tool kinds (each seeds a default size); sizes + colours pickable in the flyout
const PEN_KINDS: { kind: PenStyle['kind']; icon: typeof PenLine; key: TKey; size: number }[] = [
  { kind: 'pen', icon: PenLine, key: 'canvas.draw.pen', size: 3 },
  { kind: 'marker', icon: Brush, key: 'canvas.draw.marker', size: 8 },
  { kind: 'highlighter', icon: Highlighter, key: 'canvas.draw.highlighter', size: 22 },
  { kind: 'eraser', icon: Eraser, key: 'canvas.draw.eraser', size: 16 },
]
const PEN_SIZES = [2, 4, 8, 14, 22]
const PEN_COLORS = ['', '#E5484D', '#E67D22', '#F5C518', '#46A758', '#2383E1', '#8A4FD8', '#FFFFFF'] // '' = theme ink
// connector style presets (mini path previews, drawn in a 24×24 box)
const CONNS: { type: CanvasConnectorType; d: string; key: TKey }[] = [
  { type: 'straight', d: 'M4,20 L20,4', key: 'canvas.conn.straight' },
  { type: 'elbow', d: 'M4,20 L4,9 L20,9', key: 'canvas.conn.elbow' },
  { type: 'curve', d: 'M4,20 C4,9 20,15 20,4', key: 'canvas.conn.curve' },
]

// Miro-style: legible dark icons; the active tool is a calm soft-blue square
// (same active treatment used by every other toolbar → one consistent signal).
const btnCls = (active: boolean) =>
  `relative flex h-11 w-11 items-center justify-center rounded-xl transition-all duration-150 active:scale-90 ${
    active
      ? 'bg-accent-subtle text-accent-bright'
      : 'text-[rgb(var(--ink-200))] hover:bg-highlight hover:text-[rgb(var(--ink-0))]'
  }`
// items inside a flyout (shapes / connectors)
const pickCls = (active: boolean) =>
  `flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
    active ? 'bg-accent-subtle text-accent-bright' : 'text-[rgb(var(--ink-200))] hover:bg-highlight hover:text-[rgb(var(--ink-0))]'
  }`

export default function BottomToolbar({ tool, setTool, shape, setShape, connType, setConnType, penStyle, setPenStyle, stickyFill, setStickyFill, onAddImage, onUndo, onRedo, canUndo, canRedo, t }: Props) {
  const [shapeOpen, setShapeOpen] = useState(false)
  const [stickyOpen, setStickyOpen] = useState(false)
  const [penOpen, setPenOpen] = useState(false)
  const [more, setMore] = useState(false)
  const PenIcon = (PEN_KINDS.find((k) => k.kind === penStyle.kind) ?? PEN_KINDS[0]).icon

  const Divider = () => <div className="mx-1 h-6 w-px bg-edge" />

  const renderTool = (tl: Tool) => (
    <button key={tl.key} className={btnCls(tool === tl.key)} data-tip={tl.label} data-tip-kbd={tl.hint} onClick={() => (tl.key === 'image' ? onAddImage() : setTool(tl.key))}>
      <tl.icon size={20} />
    </button>
  )

  return (
    <div
      className="pointer-events-auto flex items-center gap-1 rounded-2xl border border-edge bg-card p-2 ring-1 ring-black/5"
      style={{ boxShadow: 'var(--float-shadow)' }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {renderTool({ key: 'select', icon: MousePointer2, label: t('canvas.tool.select'), hint: 'V' })}
      {renderTool({ key: 'lasso', icon: Lasso, label: t('canvas.tool.lasso'), hint: 'O' })}
      {renderTool({ key: 'hand', icon: Hand, label: t('canvas.tool.hand'), hint: 'H' })}
      <Divider />

      {/* draw tool — pen / marker / highlighter, with sizes + colours */}
      <div className="relative">
        <button
          data-tool="pen"
          className={btnCls(tool === 'pen')}
          data-tip={t('canvas.tool.pen')}
          data-tip-kbd="P"
          onClick={() => {
            setTool('pen')
            setPenOpen((v) => !v)
          }}
        >
          <PenIcon size={20} />
          <span
            className="absolute bottom-1 right-1 h-1.5 w-1.5 rounded-full border border-edge"
            style={{ background: penStyle.color || 'currentColor' }}
          />
        </button>
        {penOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setPenOpen(false)} />
            <div className="absolute bottom-[calc(100%+12px)] left-1/2 z-20 w-56 -translate-x-1/2 space-y-2 rounded-2xl border border-edge bg-card p-2.5" style={{ boxShadow: 'var(--float-shadow)' }}>
              <div className="flex gap-1">
                {PEN_KINDS.map((k) => (
                  <button
                    key={k.kind}
                    title={t(k.key)}
                    onClick={() => {
                      setTool('pen')
                      setPenStyle({
                        kind: k.kind,
                        size: k.size,
                        color: k.kind === 'highlighter' && !penStyle.color ? '#F5C518' : penStyle.color,
                      })
                    }}
                    className={`flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg text-xs font-medium transition-colors ${
                      penStyle.kind === k.kind ? 'bg-accent-subtle text-accent-bright' : 'text-[rgb(var(--ink-200))] hover:bg-highlight hover:text-[rgb(var(--ink-0))]'
                    }`}
                  >
                    <k.icon size={15} />
                  </button>
                ))}
              </div>
              {/* smart drawing toggle — only for pen/marker, not eraser/highlighter */}
              {(penStyle.kind === 'pen' || penStyle.kind === 'marker') && (
                <button
                  onClick={() => setPenStyle({ ...penStyle, smart: !penStyle.smart })}
                  className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    penStyle.smart ? 'bg-accent-subtle text-accent-bright' : 'text-[rgb(var(--ink-200))] hover:bg-highlight hover:text-[rgb(var(--ink-0))]'
                  }`}
                >
                  <span className="flex items-center gap-1.5"><Wand2 size={13} /> Умное выравнивание</span>
                  <span className={`h-4 w-7 rounded-full transition-colors ${penStyle.smart ? 'bg-accent' : 'bg-[rgb(var(--ink-0)/0.22)]'}`}>
                    <span className={`block h-4 w-4 rounded-full bg-white shadow transition-transform ${penStyle.smart ? 'translate-x-3' : 'translate-x-0'}`} />
                  </span>
                </button>
              )}
              <div className="flex items-center gap-1">
                {PEN_SIZES.map((s) => (
                  <button
                    key={s}
                    title={String(s)}
                    onClick={() => setPenStyle({ ...penStyle, size: s })}
                    className={`flex h-8 flex-1 items-center justify-center rounded-lg transition-colors ${
                      penStyle.size === s ? 'bg-accent-subtle' : 'hover:bg-highlight'
                    }`}
                  >
                    <span className="rounded-full bg-[rgb(var(--ink-0))]" style={{ width: Math.min(16, 3 + s / 2), height: Math.min(16, 3 + s / 2) }} />
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {PEN_COLORS.map((c) => (
                  <button
                    key={c || 'ink'}
                    title={c || t('canvas.auto')}
                    onClick={() => setPenStyle({ ...penStyle, color: c })}
                    className={`h-6 w-6 rounded-full border border-edge transition-transform hover:scale-110 ${penStyle.color === c ? 'ring-2 ring-accent ring-offset-1' : ''}`}
                    style={c ? { background: c } : { background: 'rgb(var(--ink-0))' }}
                  />
                ))}
              </div>
            </div>
          </>
        )}
      </div>
      <Divider />

      {/* shape tool + horizontal picker (connectors + shapes + More) */}
      <div className="relative">
        <button
          className={btnCls(tool === 'shape')}
          data-tip={t('canvas.tool.shape')}
          data-tip-kbd="S"
          onClick={() => {
            setTool('shape')
            setShapeOpen((v) => !v)
          }}
        >
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-5 w-5">
            <path d={shapePath(shape)} fill="currentColor" />
          </svg>
          <ChevronUp size={9} className="absolute bottom-0.5 right-0.5 opacity-50" />
        </button>
        {shapeOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setShapeOpen(false)} />
            <div className="absolute bottom-[calc(100%+12px)] left-1/2 z-20 flex max-w-[92vw] -translate-x-1/2 items-center gap-1 rounded-2xl border border-edge bg-card p-2" style={{ boxShadow: 'var(--float-shadow)' }}>
              {CONNS.map((c) => (
                <button
                  key={c.type}
                  title={t(c.key)}
                  onClick={() => {
                    setConnType(c.type)
                    setTool('connector')
                    setShapeOpen(false)
                  }}
                  className={pickCls(tool === 'connector' && connType === c.type)}
                >
                  <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                    <path d={c.d} />
                    <path d="M20,4 l0,5 M20,4 l-5,0" />
                  </svg>
                </button>
              ))}
              <div className="mx-1 h-8 w-px bg-edge" />
              {(more ? SHAPE_LIST : COMMON).map((s) => (
                <button
                  key={s}
                  title={t(`canvas.shape.${s}`)}
                  onClick={() => {
                    setShape(s)
                    setTool('shape')
                    setShapeOpen(false)
                  }}
                  className={pickCls(shape === s && tool === 'shape')}
                >
                  <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-[22px] w-[22px]">
                    <path d={shapePath(s)} fill="currentColor" />
                  </svg>
                </button>
              ))}
              <button
                onClick={() => setMore((v) => !v)}
                className="ml-1 h-9 whitespace-nowrap rounded-lg px-2.5 text-xs font-medium text-[rgb(var(--ink-200))] transition-colors hover:bg-highlight hover:text-[rgb(var(--ink-0))]"
              >
                {more ? t('canvas.lessShapes') : t('canvas.moreShapes')}
              </button>
            </div>
          </>
        )}
      </div>

      {/* connector tool */}
      <button className={btnCls(tool === 'connector')} data-tip={t('canvas.tool.connector')} data-tip-kbd="L" onClick={() => setTool('connector')}>
        <Spline size={20} />
      </button>
      <Divider />

      {renderTool({ key: 'text', icon: Type, label: t('canvas.tool.text'), hint: 'T' })}

      {/* sticky tool — pick a colour first (Miro/FigJam-style) */}
      <div className="relative">
        <button
          className={btnCls(tool === 'sticky')}
          data-tip={t('canvas.tool.sticky')}
          data-tip-kbd="N"
          onClick={() => {
            setTool('sticky')
            setStickyOpen((v) => !v)
          }}
        >
          <StickyNote size={20} />
          <span className="absolute bottom-1 right-1 h-1.5 w-1.5 rounded-full border border-edge" style={{ background: stickyFill }} />
        </button>
        {stickyOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setStickyOpen(false)} />
            <div className="absolute bottom-[calc(100%+12px)] left-1/2 z-20 grid w-[104px] -translate-x-1/2 grid-cols-2 gap-1.5 rounded-2xl border border-edge bg-card p-2" style={{ boxShadow: 'var(--float-shadow)' }}>
              {STICKY_COLORS.map((c) => (
                <button
                  key={c}
                  title={t('canvas.tool.sticky')}
                  onClick={() => {
                    setStickyFill(c)
                    setTool('sticky')
                    setStickyOpen(false)
                  }}
                  className={`h-9 w-9 rounded-lg border border-edge transition-transform hover:scale-110 ${stickyFill === c ? 'ring-2 ring-accent ring-offset-1' : ''}`}
                  style={{ background: c }}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {renderTool({ key: 'frame', icon: FrameIcon, label: t('canvas.tool.frame'), hint: 'F' })}
      {renderTool({ key: 'image', icon: ImageIcon, label: t('canvas.tool.image'), hint: 'I' })}
      {renderTool({ key: 'comment', icon: MessageCircle, label: t('canvas.tool.comment'), hint: 'C' })}

      <Divider />
      <button className={btnCls(false)} data-tip={t('canvas.undo')} data-tip-kbd="Ctrl Z" disabled={!canUndo} onClick={onUndo}>
        <Undo2 size={19} className={canUndo ? '' : 'opacity-30'} />
      </button>
      <button className={btnCls(false)} data-tip={t('canvas.redo')} data-tip-kbd="Ctrl Y" disabled={!canRedo} onClick={onRedo}>
        <Redo2 size={19} className={canRedo ? '' : 'opacity-30'} />
      </button>
    </div>
  )
}
