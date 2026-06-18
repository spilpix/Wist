import { useState, type ReactNode } from 'react'
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalSpaceAround,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalSpaceAround,
  Bold,
  ChevronDown,
  ChevronsDown,
  ChevronsUp,
  ChevronUp,
  Columns3,
  Copy,
  Crop,
  Italic,
  LayoutGrid,
  Link2,
  Lock,
  Rows3,
  Strikethrough,
  Trash2,
  Underline,
  Unlock,
  User,
  Wand2,
} from 'lucide-react'
import type { CanvasAlign, CanvasEdge, CanvasNode } from '../types/models'
import type { TKey, TParams } from '../i18n'
import { FONTS, fontCss, getCanvasAuthor, PAINT_COLORS, setCanvasAuthor, STICKY_COLORS, maxRadius, supportsRadius } from './constants'

type TFn = (key: TKey, params?: TParams) => string

interface Props {
  nodes: CanvasNode[]
  edge: CanvasEdge | null
  t: TFn
  onPatch: (patch: Partial<CanvasNode>) => void
  onPatchEdge: (patch: Partial<CanvasEdge>) => void
  onLayer: (op: 'front' | 'back' | 'forward' | 'backward') => void
  onDuplicate: () => void
  onLock: () => void
  onDelete: () => void
  onLink: () => void
  onCrop: () => void
  onAlign: (dir: 'l' | 'cx' | 'r' | 't' | 'cy' | 'b') => void
  onDistribute: (axis: 'h' | 'v') => void
  onWrapAutoLayout: () => void
  onTidy: () => void
}

// ── FigJam-style dark pill palette ───────────────────────────────────────────
// IMPORTANT: this toolbar is a FIXED dark surface on BOTH themes, so every colour
// must be a LITERAL white ([#fff]). Tailwind's `white` is remapped to --ink-0,
// which is DARK in light theme — using it here makes the icons vanish on light.
const PILL = 'flex items-center gap-0.5 rounded-2xl bg-[#26282d] p-1.5 ring-1 ring-[#fff]/10 shadow-[var(--float-shadow)]'
const icoBase = 'flex h-8 w-8 items-center justify-center rounded-lg transition-colors'
const INK = 'text-[#fff]/65 hover:bg-[#fff]/10 hover:text-[#fff]'
const ACT = 'bg-[#fff]/20 text-[#fff]'
const ico = `${icoBase} ${INK}`
const selCls = 'cursor-pointer rounded-lg border-0 bg-[#fff]/10 px-2.5 py-1.5 text-xs text-[#fff] outline-none transition-colors hover:bg-[#fff]/15'
const Sep = () => <div className="mx-1 h-6 w-px bg-[#fff]/15" />

function Pop({ label, children, panel }: { label: string; children: ReactNode; panel: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button className={ico} title={label} onClick={() => setOpen((v) => !v)}>
        {children}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute bottom-[calc(100%+10px)] left-1/2 z-20 -translate-x-1/2 rounded-2xl bg-[#26282d] p-2.5 ring-1 ring-[#fff]/10 shadow-[var(--float-shadow)]">
            {panel}
          </div>
        </>
      )}
    </div>
  )
}

// custom dark dropdown — native <select> renders its option list white-on-white
// in this dark pill (the OS popup ignores our colours), so we roll our own.
function Menu<T extends string | number>({ value, options, onChange, min }: { value: T; options: { value: T; label: string; font?: string }[]; onChange: (v: T) => void; min?: number }) {
  const [open, setOpen] = useState(false)
  const cur = options.find((o) => o.value === value)
  return (
    <div className="relative">
      <button className={`${selCls} flex items-center gap-1`} style={min ? { minWidth: min } : undefined} onClick={() => setOpen((v) => !v)}>
        <span className="truncate" style={{ fontFamily: cur?.font }}>
          {cur?.label ?? String(value)}
        </span>
        <ChevronDown size={13} className="-mr-0.5 opacity-60" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-[calc(100%+8px)] z-20 max-h-64 min-w-full overflow-auto rounded-xl bg-[#26282d] p-1 ring-1 ring-[#fff]/10 shadow-[var(--float-shadow)]">
            {options.map((o) => (
              <button
                key={String(o.value)}
                style={{ fontFamily: o.font }}
                onClick={() => {
                  onChange(o.value)
                  setOpen(false)
                }}
                className={`block w-full whitespace-nowrap rounded-lg px-3 py-1.5 text-left text-xs transition-colors ${
                  o.value === value ? 'bg-[#fff]/15 text-[#fff]' : 'text-[#fff]/70 hover:bg-[#fff]/10 hover:text-[#fff]'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function Swatches({ colors, onPick, allowNone }: { colors: string[]; onPick: (c: string | null) => void; allowNone?: boolean }) {
  return (
    <div className="flex w-40 flex-wrap gap-1.5">
      {allowNone && (
        <button
          onClick={() => onPick(null)}
          className="flex h-6 w-6 items-center justify-center rounded-full border border-[#fff]/20 text-[9px] text-[#fff]/55"
          title="—"
        >
          ✕
        </button>
      )}
      {colors.map((c) => (
        <button key={c} onClick={() => onPick(c)} className="h-6 w-6 rounded-full ring-1 ring-[#fff]/15" style={{ background: c }} />
      ))}
      <label className="relative flex h-6 w-6 cursor-pointer items-center justify-center rounded-full border border-[#fff]/20 text-[11px] text-[#fff]/55" title="custom">
        +
        <input type="color" className="absolute h-0 w-0 opacity-0" onChange={(e) => onPick(e.target.value)} />
      </label>
    </div>
  )
}

// FigJam author control: stamp a name on the selected sticky and remember it for new ones
function AuthorPanel({ value, t, onPatch }: { value: string; t: TFn; onPatch: (p: Partial<CanvasNode>) => void }) {
  const [v, setV] = useState(value || getCanvasAuthor())
  return (
    <div className="w-44">
      <div className="mb-1.5 text-[11px] text-[#fff]/55">{t('canvas.authorName')}</div>
      <input
        autoFocus
        value={v}
        placeholder={t('canvas.authorPh')}
        onChange={(e) => {
          setV(e.target.value)
          setCanvasAuthor(e.target.value)
          onPatch({ author: e.target.value.trim() || undefined })
        }}
        onPointerDown={(e) => e.stopPropagation()}
        className="w-full rounded-lg border-0 bg-[#fff]/10 px-2.5 py-1.5 text-xs text-[#fff] outline-none ring-1 ring-[#fff]/10 placeholder:text-[#fff]/35 focus:ring-[#fff]/25"
      />
    </div>
  )
}

export default function ContextToolbar({
  nodes,
  edge,
  t,
  onPatch,
  onPatchEdge,
  onLayer,
  onDuplicate,
  onLock,
  onDelete,
  onLink,
  onCrop,
  onAlign,
  onDistribute,
  onWrapAutoLayout,
  onTidy,
}: Props) {
  const stop = (e: React.PointerEvent) => e.stopPropagation()

  // ── connector toolbar ───────────────────────────────────────────────────────
  if (edge) {
    return (
      <div onPointerDown={stop} className={PILL}>
        <Menu
          value={edge.type ?? 'curve'}
          onChange={(v) => onPatchEdge({ type: v as CanvasEdge['type'] })}
          options={[
            { value: 'straight', label: t('canvas.conn.straight') },
            { value: 'elbow', label: t('canvas.conn.elbow') },
            { value: 'curve', label: t('canvas.conn.curve') },
          ]}
        />
        <Menu
          value={edge.arrow ?? 'end'}
          onChange={(v) => onPatchEdge({ arrow: v as CanvasEdge['arrow'] })}
          options={[
            { value: 'none', label: t('canvas.conn.none') },
            { value: 'end', label: t('canvas.conn.end') },
            { value: 'both', label: t('canvas.conn.both') },
          ]}
        />
        <button className={`${icoBase} ${edge.dash ? ACT : INK}`} title={t('canvas.conn.dash')} onClick={() => onPatchEdge({ dash: !edge.dash })}>
          ┄
        </button>
        <Pop label={t('canvas.fill')} panel={<Swatches colors={PAINT_COLORS} onPick={(c) => onPatchEdge({ color: c })} />}>
          <span className="h-4 w-4 rounded-full ring-1 ring-[#fff]/25" style={{ background: edge.color || '#8a8a8a' }} />
        </Pop>
        <input
          className="w-28 rounded-lg border-0 bg-[#fff]/10 px-2.5 py-1.5 text-xs text-[#fff] outline-none placeholder:text-[#fff]/35"
          placeholder={t('canvas.conn.label')}
          value={edge.label ?? ''}
          onChange={(e) => onPatchEdge({ label: e.target.value })}
        />
        <Sep />
        <button className={ico} title={t('common.delete')} onClick={onDelete}>
          <Trash2 size={16} className="text-red-400" />
        </button>
      </div>
    )
  }

  // ── node toolbar ────────────────────────────────────────────────────────────
  const first = nodes[0]
  if (!first) return null
  const multi = nodes.length > 1
  const sticky = first.type === 'sticky'
  const hasText = nodes.some((n) => n.type === 'sticky' || n.type === 'text' || n.type === 'shape')
  const hasShapeOrSticky = nodes.some((n) => n.type === 'shape' || n.type === 'sticky')
  // border (stroke) + corner radius — shapes & text can be stroked; rect-ish / image / sticky / text can be rounded
  const strokeable = nodes.some((n) => n.type === 'shape' || n.type === 'text')
  const roundable = nodes.every((n) => supportsRadius(n))
  const allLocked = nodes.every((n) => n.locked)
  const isFrame = nodes.length === 1 && first.type === 'frame'

  return (
    <div onPointerDown={stop} className={PILL}>
      {isFrame && (
        <>
          <Pop label={t('canvas.autoLayout')} panel={<AutoLayoutPanel node={first} t={t} onPatch={onPatch} />}>
            <LayoutGrid size={16} className={first.autoLayout ? 'text-accent-bright' : 'text-[#fff]/65'} />
          </Pop>
          <Sep />
        </>
      )}
      {hasShapeOrSticky && (
        <Pop
          label={t('canvas.fill')}
          panel={<Swatches colors={sticky ? STICKY_COLORS : PAINT_COLORS} allowNone={!sticky} onPick={(c) => onPatch({ fill: c })} />}
        >
          <span className="h-4 w-4 rounded-md ring-1 ring-[#fff]/25" style={{ background: first.fill || (sticky ? '#FCE8A6' : 'transparent') }} />
        </Pop>
      )}

      {strokeable && (
        <Pop
          label={t('canvas.stroke')}
          panel={
            <div className="w-40 space-y-2">
              <Swatches
                colors={PAINT_COLORS}
                allowNone
                onPick={(c) => onPatch({ stroke: c, strokeWidth: c ? (first.strokeWidth && first.strokeWidth > 0 ? first.strokeWidth : 2) : 0 })}
              />
              <div className="flex gap-1">
                {[1, 2, 3, 4, 6].map((wv) => (
                  <button
                    key={wv}
                    onClick={() => onPatch({ strokeWidth: wv, stroke: first.stroke || PAINT_COLORS[8] })}
                    className={`h-7 flex-1 rounded-lg text-[11px] tabular-nums transition-colors ${(first.strokeWidth ?? 0) === wv ? ACT : INK}`}
                  >
                    {wv}
                  </button>
                ))}
              </div>
              <div className="flex gap-1">
                {(['solid', 'dashed', 'dotted'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => onPatch({ strokeStyle: s })}
                    className={`h-7 flex-1 rounded-lg text-[11px] transition-colors ${(first.strokeStyle ?? 'solid') === s ? ACT : INK}`}
                  >
                    {t(`canvas.stroke.${s}`)}
                  </button>
                ))}
              </div>
            </div>
          }
        >
          <span className="h-4 w-4 rounded-md border-2" style={{ borderColor: first.stroke || 'rgb(255 255 255 / 0.55)' }} />
        </Pop>
      )}

      {roundable && (
        <Pop label={t('canvas.radius')} panel={<RadiusPanel node={first} max={maxRadius(first.w, first.h)} t={t} onPatch={onPatch} />}>
          <span className="flex h-4 w-4 items-end justify-start">
            <span className="h-3.5 w-3.5 rounded-tl-[7px] border-l-2 border-t-2 border-[#fff]/65" />
          </span>
        </Pop>
      )}

      {hasText && (
        <>
          <Pop label={t('canvas.textColor')} panel={<Swatches colors={PAINT_COLORS} onPick={(c) => onPatch({ textColor: c })} />}>
            <span className="text-[13px] font-bold" style={{ color: first.textColor || '#fff' }}>
              A
            </span>
          </Pop>
          <Menu
            value={first.fontFamily ?? 'default'}
            onChange={(v) => onPatch({ fontFamily: v === 'default' ? undefined : String(v) })}
            min={84}
            options={FONTS.map((f) => ({ value: f.key, label: f.label, font: fontCss(f.key) }))}
          />
          <Menu
            value={first.fontSize ?? (sticky ? 0 : 16)}
            onChange={(v) => onPatch({ fontSize: Number(v) || undefined })}
            min={64}
            options={[
              ...(sticky ? [{ value: 0, label: t('canvas.auto') }] : []),
              ...[12, 14, 16, 20, 24, 32, 48, 64].map((s) => ({ value: s, label: String(s) })),
            ]}
          />
          <button className={`${icoBase} ${first.bold ? ACT : INK}`} title={t('canvas.bold')} onClick={() => onPatch({ bold: !first.bold })}>
            <Bold size={16} />
          </button>
          <button className={`${icoBase} ${first.italic ? ACT : INK}`} title={t('canvas.italic')} onClick={() => onPatch({ italic: !first.italic })}>
            <Italic size={16} />
          </button>
          <button className={`${icoBase} ${first.underline ? ACT : INK}`} title={t('canvas.underline')} onClick={() => onPatch({ underline: !first.underline })}>
            <Underline size={16} />
          </button>
          <button className={`${icoBase} ${first.strike ? ACT : INK}`} title={t('canvas.strike')} onClick={() => onPatch({ strike: !first.strike })}>
            <Strikethrough size={16} />
          </button>
          {(['left', 'center', 'right'] as CanvasAlign[]).map((a) => (
            <button key={a} className={`${icoBase} ${(first.align ?? 'left') === a ? ACT : INK}`} title={a} onClick={() => onPatch({ align: a })}>
              {a === 'left' ? <AlignStartVertical size={16} /> : a === 'center' ? <AlignCenterVertical size={16} /> : <AlignEndVertical size={16} />}
            </button>
          ))}
        </>
      )}

      {sticky && !multi && (
        <Pop label={t('canvas.authorName')} panel={<AuthorPanel value={first.author ?? ''} t={t} onPatch={onPatch} />}>
          <User size={16} className={first.author ? 'text-accent-bright' : 'text-[#fff]/65'} />
        </Pop>
      )}

      {multi && (
        <>
          <Sep />
          <button className={ico} title={t('canvas.alignL')} onClick={() => onAlign('l')}>
            <AlignStartVertical size={16} />
          </button>
          <button className={ico} title={t('canvas.alignCx')} onClick={() => onAlign('cx')}>
            <AlignCenterVertical size={16} />
          </button>
          <button className={ico} title={t('canvas.alignR')} onClick={() => onAlign('r')}>
            <AlignEndVertical size={16} />
          </button>
          <button className={ico} title={t('canvas.alignT')} onClick={() => onAlign('t')}>
            <AlignStartHorizontal size={16} />
          </button>
          <button className={ico} title={t('canvas.alignCy')} onClick={() => onAlign('cy')}>
            <AlignCenterHorizontal size={16} />
          </button>
          <button className={ico} title={t('canvas.alignB')} onClick={() => onAlign('b')}>
            <AlignEndHorizontal size={16} />
          </button>
          {nodes.length > 2 && (
            <>
              <button className={ico} title={t('canvas.distH')} onClick={() => onDistribute('h')}>
                <AlignHorizontalSpaceAround size={16} />
              </button>
              <button className={ico} title={t('canvas.distV')} onClick={() => onDistribute('v')}>
                <AlignVerticalSpaceAround size={16} />
              </button>
            </>
          )}
          <button className={ico} title={`${t('canvas.tidy')} · Shift+T`} onClick={onTidy}>
            <Wand2 size={16} />
          </button>
          <button className={ico} title={`${t('canvas.wrapAutoLayout')} · Shift+A`} onClick={onWrapAutoLayout}>
            <LayoutGrid size={16} />
          </button>
        </>
      )}

      <Sep />
      <button className={ico} title={t('canvas.toFront')} onClick={() => onLayer('front')}>
        <ChevronsUp size={16} />
      </button>
      <button className={ico} title={t('canvas.forward')} onClick={() => onLayer('forward')}>
        <ChevronUp size={16} />
      </button>
      <button className={ico} title={t('canvas.backward')} onClick={() => onLayer('backward')}>
        <ChevronDown size={16} />
      </button>
      <button className={ico} title={t('canvas.toBack')} onClick={() => onLayer('back')}>
        <ChevronsDown size={16} />
      </button>

      <Sep />
      {nodes.length === 1 && first.type === 'image' && !first.rotation && (
        <button className={ico} title={t('canvas.crop')} onClick={onCrop}>
          <Crop size={16} />
        </button>
      )}
      <button className={ico} title={t('canvas.link')} onClick={onLink}>
        <Link2 size={16} />
      </button>
      <button className={`${icoBase} ${allLocked ? ACT : INK}`} title={t('canvas.lock')} onClick={onLock}>
        {allLocked ? <Lock size={16} /> : <Unlock size={16} />}
      </button>
      <button className={ico} title={`${t('canvas.duplicate')} · Ctrl+D`} onClick={onDuplicate}>
        <Copy size={16} />
      </button>
      <button className={ico} title={`${t('common.delete')} · Del`} onClick={onDelete}>
        <Trash2 size={16} className="text-red-400" />
      </button>
    </div>
  )
}

// Figma-style auto-layout controls for a frame: direction + gap + padding.
function AutoLayoutPanel({ node, t, onPatch }: { node: CanvasNode; t: TFn; onPatch: (p: Partial<CanvasNode>) => void }) {
  const al = node.autoLayout
  return (
    <div className="w-48 space-y-2.5">
      <div className="flex gap-1">
        <button
          onClick={() => onPatch({ autoLayout: undefined })}
          className={`h-8 flex-1 rounded-lg text-[11px] font-medium transition-colors ${!al ? ACT : INK}`}
        >
          {t('common.off')}
        </button>
        <button
          onClick={() => onPatch({ autoLayout: { dir: 'v', gap: al?.gap ?? 16, pad: al?.pad ?? 24 } })}
          className={`flex h-8 flex-1 items-center justify-center rounded-lg transition-colors ${al?.dir === 'v' ? ACT : INK}`}
          title={t('canvas.alDirV')}
        >
          <Rows3 size={15} />
        </button>
        <button
          onClick={() => onPatch({ autoLayout: { dir: 'h', gap: al?.gap ?? 16, pad: al?.pad ?? 24 } })}
          className={`flex h-8 flex-1 items-center justify-center rounded-lg transition-colors ${al?.dir === 'h' ? ACT : INK}`}
          title={t('canvas.alDirH')}
        >
          <Columns3 size={15} />
        </button>
      </div>
      {al && (
        <>
          <label className="block">
            <div className="mb-1 flex items-center justify-between text-[11px]">
              <span className="text-[#fff]/55">{t('canvas.alGap')}</span>
              <span className="tabular-nums text-[#fff]/90">{al.gap}</span>
            </div>
            <input type="range" min={0} max={80} value={al.gap} onChange={(e) => onPatch({ autoLayout: { ...al, gap: Number(e.target.value) } })} className="w-full cursor-pointer accent-[rgb(var(--accent-rgb))]" />
          </label>
          <label className="block">
            <div className="mb-1 flex items-center justify-between text-[11px]">
              <span className="text-[#fff]/55">{t('canvas.alPad')}</span>
              <span className="tabular-nums text-[#fff]/90">{al.pad}</span>
            </div>
            <input type="range" min={0} max={120} value={al.pad} onChange={(e) => onPatch({ autoLayout: { ...al, pad: Number(e.target.value) } })} className="w-full cursor-pointer accent-[rgb(var(--accent-rgb))]" />
          </label>
        </>
      )}
    </div>
  )
}

function defaultRadius(n: CanvasNode): number {
  if (n.radius != null) return n.radius
  if (n.type === 'shape' && n.shape === 'roundRect') return 16
  if (n.type === 'sticky' || n.type === 'image') return 6
  if (n.type === 'text') return 8
  return 0
}

function RadiusPanel({ node, max, t, onPatch }: { node: CanvasNode; max: number; t: TFn; onPatch: (p: Partial<CanvasNode>) => void }) {
  const cur = Math.min(defaultRadius(node), max)
  const stops = [0, Math.round(max * 0.33), Math.round(max * 0.66), max]
  return (
    <div className="w-44">
      <div className="mb-1.5 flex items-center justify-between text-[11px]">
        <span className="text-[#fff]/55">{t('canvas.radius')}</span>
        <span className="tabular-nums text-[#fff]/90">{Math.round(cur)}</span>
      </div>
      <input
        type="range"
        min={0}
        max={max}
        value={cur}
        onChange={(e) => onPatch({ radius: Number(e.target.value) })}
        className="w-full cursor-pointer accent-[rgb(var(--accent-rgb))]"
      />
      <div className="mt-2 flex gap-1">
        {stops.map((v, i) => (
          <button
            key={i}
            onClick={() => onPatch({ radius: v })}
            className={`h-6 flex-1 rounded-lg text-[10px] tabular-nums transition-colors ${Math.round(cur) === v ? ACT : INK}`}
          >
            {v}
          </button>
        ))}
      </div>
    </div>
  )
}
