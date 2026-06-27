import { CalendarDays, Check, Hash, Link2, ListChecks, Plus, Trash2, Type as TypeIcon } from 'lucide-react'
import type { PropField, PropType } from '../types/models'
import DatePicker from './ui/DatePicker'
import { usePopover } from '../lib/usePopover'
import { useI18n } from '../i18n'

const uid = () => Math.random().toString(36).slice(2, 10)

// Capacities-style colour-coded property types: each type carries its own soft hue
// (icon + tint chip) so a glance reads the shape of an object's metadata.
const TYPE_META: Record<PropType, { icon: typeof TypeIcon; color: string }> = {
  text: { icon: TypeIcon, color: '#6B7280' },
  number: { icon: Hash, color: '#3A8BE0' },
  date: { icon: CalendarDays, color: '#8453E8' },
  checkbox: { icon: ListChecks, color: '#46A758' },
  url: { icon: Link2, color: '#1FAD9F' },
  select: { icon: ListChecks, color: '#EC7E22' },
}
// types offered in v1 (select needs an options editor → deferred to object-types step)
const OFFERED: PropType[] = ['text', 'number', 'date', 'checkbox', 'url']

const defaultValue = (t: PropType): PropField['value'] => (t === 'checkbox' ? false : t === 'number' ? null : '')

function ValueEditor({ field, onChange }: { field: PropField; onChange: (v: PropField['value']) => void }) {
  const { t } = useI18n()
  const cls = 'w-full rounded-md bg-transparent px-2 py-1 text-[13px] text-zinc-200 outline-none transition-colors hover:bg-highlight focus:bg-field placeholder:text-zinc-600'

  if (field.type === 'checkbox') {
    const on = field.value === true
    return (
      <button
        type="button"
        onClick={() => onChange(!on)}
        className={`flex h-[26px] items-center gap-2 rounded-md px-2 text-[13px] transition-colors hover:bg-highlight ${on ? 'text-zinc-200' : 'text-zinc-500'}`}
      >
        <span className={`flex h-4 w-4 items-center justify-center rounded border ${on ? 'border-accent bg-accent text-white' : 'border-zinc-600'}`}>
          {on ? <Check size={11} strokeWidth={3} /> : null}
        </span>
        {on ? t('props.checkboxYes') : t('props.checkboxNo')}
      </button>
    )
  }
  if (field.type === 'date') {
    return <DatePicker value={typeof field.value === 'string' ? field.value : ''} onChange={(v) => onChange(v)} variant="inline" placeholder={t('props.empty')} />
  }
  if (field.type === 'number') {
    return (
      <input
        type="number"
        className={`${cls} tabular-nums`}
        value={field.value === null || field.value === undefined ? '' : String(field.value)}
        placeholder={t('props.empty')}
        onChange={(e) => {
          const v = e.target.value
          onChange(v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null)
        }}
      />
    )
  }
  if (field.type === 'url') {
    const v = typeof field.value === 'string' ? field.value : ''
    return (
      <div className="flex items-center gap-1">
        <input className={cls} inputMode="url" value={v} placeholder={t('props.empty')} onChange={(e) => onChange(e.target.value)} />
        {v ? (
          <a href={/^https?:\/\//.test(v) ? v : `https://${v}`} target="_blank" rel="noreferrer" className="shrink-0 rounded-md p-1 text-zinc-500 hover:bg-highlight hover:text-accent-bright" title={t('props.open')}>
            <Link2 size={13} />
          </a>
        ) : null}
      </div>
    )
  }
  // text (default)
  return <input className={cls} value={typeof field.value === 'string' ? field.value : String(field.value ?? '')} placeholder={t('props.empty')} onChange={(e) => onChange(e.target.value)} />
}

function PropertyRow({ field, onChange, onRemove }: { field: PropField; onChange: (patch: Partial<PropField>) => void; onRemove: () => void }) {
  const { t } = useI18n()
  const menu = usePopover<HTMLDivElement>()
  const meta = TYPE_META[field.type] ?? TYPE_META.text

  return (
    <div className="group flex items-center gap-1.5 rounded-lg px-1 py-0.5 hover:bg-highlight/40">
      {/* type chip → opens the type menu */}
      <div ref={menu.ref} className="relative shrink-0">
        <button
          type="button"
          onClick={() => menu.setOpen((o) => !o)}
          title={t('props.changeType')}
          className="flex h-[26px] w-[26px] items-center justify-center rounded-md transition-colors hover:brightness-110"
          style={{ background: `${meta.color}22`, color: meta.color }}
        >
          <meta.icon size={14} />
        </button>
        {menu.open && (
          <div className="absolute left-0 top-full z-50 mt-1 w-44 rounded-lg border border-edge bg-raised p-1 shadow-lg">
            {OFFERED.map((pt) => {
              const m = TYPE_META[pt]
              return (
                <button
                  key={pt}
                  type="button"
                  onClick={() => {
                    if (pt !== field.type) onChange({ type: pt, value: defaultValue(pt) })
                    menu.setOpen(false)
                  }}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-highlight ${pt === field.type ? 'text-zinc-100' : 'text-zinc-300'}`}
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded" style={{ background: `${m.color}22`, color: m.color }}>
                    <m.icon size={12} />
                  </span>
                  {t(`props.type.${pt}` as Parameters<typeof t>[0])}
                  {pt === field.type && <Check size={13} className="ml-auto text-accent-bright" />}
                </button>
              )
            })}
            <div className="my-1 h-px bg-edge" />
            <button
              type="button"
              onClick={() => {
                menu.setOpen(false)
                onRemove()
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-danger hover:bg-highlight"
            >
              <Trash2 size={13} /> {t('props.delete')}
            </button>
          </div>
        )}
      </div>

      {/* name */}
      <input
        value={field.name}
        placeholder={t('props.namePlaceholder')}
        onChange={(e) => onChange({ name: e.target.value })}
        className="w-[140px] shrink-0 rounded-md bg-transparent px-1.5 py-1 text-[13px] font-medium text-zinc-400 outline-none transition-colors hover:bg-highlight focus:bg-field focus:text-zinc-200 placeholder:text-zinc-600"
      />

      {/* value */}
      <div className="min-w-0 flex-1 max-w-[340px]">
        <ValueEditor field={field} onChange={(value) => onChange({ value })} />
      </div>

      {/* quick delete (hover) */}
      <button
        type="button"
        onClick={onRemove}
        title={t('props.delete')}
        className="shrink-0 rounded-md p-1 text-zinc-600 opacity-0 transition-all hover:bg-highlight hover:text-danger group-hover:opacity-100"
      >
        <Trash2 size={13} />
      </button>
    </div>
  )
}

/**
 * Capacities-style typed properties editor for an object's `props.fields`.
 * Pure controlled component: parent owns the array + persistence (debounced in Notes,
 * immediate in TaskPeek). Add / rename / retype / set value / remove.
 */
export default function PropertyEditor({ fields, onChange, className = '' }: { fields: PropField[]; onChange: (fields: PropField[]) => void; className?: string }) {
  const { t } = useI18n()
  const update = (id: string, patch: Partial<PropField>) => onChange(fields.map((f) => (f.id === id ? { ...f, ...patch } : f)))
  const remove = (id: string) => onChange(fields.filter((f) => f.id !== id))
  const add = () => onChange([...fields, { id: uid(), name: '', type: 'text', value: '' }])

  return (
    <div className={className}>
      {fields.length > 0 && (
        <div className="flex flex-col gap-0.5">
          {fields.map((f) => (
            <PropertyRow key={f.id} field={f} onChange={(patch) => update(f.id, patch)} onRemove={() => remove(f.id)} />
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={add}
        className="mt-0.5 flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-[12.5px] font-medium text-zinc-500 transition-colors hover:bg-highlight hover:text-zinc-300"
      >
        <Plus size={14} /> {t('props.add')}
      </button>
    </div>
  )
}
