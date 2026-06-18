import { useState } from 'react'
import { Check, Trash2 } from 'lucide-react'
import type { CanvasNode } from '../types/models'
import type { TKey, TParams } from '../i18n'

type TFn = (key: TKey, params?: TParams) => string

interface Props {
  node: CanvasNode
  x: number
  y: number
  t: TFn
  onAdd: (text: string) => void
  onResolve: () => void
  onDelete: () => void
  onClose: () => void
}

export default function CommentThread({ node, x, y, t, onAdd, onResolve, onDelete, onClose }: Props) {
  const [text, setText] = useState('')
  const thread = node.thread ?? []
  const submit = () => {
    const v = text.trim()
    if (!v) return
    onAdd(v)
    setText('')
  }
  return (
    <>
      <div className="fixed inset-0 z-40" onPointerDown={(e) => { e.stopPropagation(); onClose() }} />
      <div
        className="absolute z-50 w-64 rounded-2xl border border-edge bg-surface p-2"
        style={{ left: x, top: y, boxShadow: 'var(--float-shadow)' }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="mb-1.5 flex items-center gap-1">
          <span className="text-xs font-semibold text-zinc-300">{t('canvas.comment')}</span>
          <div className="ml-auto flex gap-0.5">
            <button className="rounded-lg p-1 text-zinc-400 hover:bg-highlight hover:text-success" title={t('canvas.resolve')} onClick={onResolve}>
              <Check size={14} />
            </button>
            <button className="rounded-lg p-1 text-zinc-400 hover:bg-highlight hover:text-danger" title={t('common.delete')} onClick={onDelete}>
              <Trash2 size={14} />
            </button>
          </div>
        </div>
        <div className="max-h-44 space-y-1.5 overflow-y-auto">
          {thread.length === 0 && <div className="py-2 text-center text-[11px] text-zinc-500">{t('canvas.commentEmpty')}</div>}
          {thread.map((m, i) => (
            <div key={i} className="rounded-lg bg-raised px-2 py-1.5 text-[12px] text-zinc-200">
              {m.text}
            </div>
          ))}
        </div>
        <div className="mt-2 flex gap-1">
          <input
            autoFocus
            className="input !py-1.5 !text-xs"
            placeholder={t('canvas.commentPh')}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit()
              e.stopPropagation()
            }}
          />
          <button className="rounded-lg bg-accent px-2 text-xs font-medium text-[#fff] hover:bg-accent-hover" onClick={submit}>
            {t('canvas.send')}
          </button>
        </div>
      </div>
    </>
  )
}
