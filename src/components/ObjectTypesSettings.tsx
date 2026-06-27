import { useEffect, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import type { ObjectType, PropField } from '../types/models'
import { objColor, OBJ_HUES, type ObjHue } from '../lib/objectColors'
import { typeIcon, TYPE_ICON_KEYS } from './TypePicker'
import PropertyEditor from './PropertyEditor'
import Modal from './ui/Modal'
import ConfirmDialog from './ui/ConfirmDialog'
import { toast } from '../store/toastStore'
import { useI18n } from '../i18n'

// strip per-object values so a type stores clean templates (defaults only)
const templateFields = (fields: PropField[]): PropField[] =>
  fields.map((f) => ({ ...f, value: f.type === 'checkbox' ? false : f.type === 'number' ? null : '' }))

function TypeEditor({ type, onClose, onSaved }: { type: ObjectType | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n()
  const [name, setName] = useState(type?.name ?? '')
  const [icon, setIcon] = useState(type?.icon || 'Box')
  const [hue, setHue] = useState<ObjHue>((type?.hue as ObjHue) || 'blue')
  const [fields, setFields] = useState<PropField[]>(type?.fields ?? [])
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (saving) return
    setSaving(true)
    const payload = { name: name.trim() || t('types.untitled'), icon, hue, fields: templateFields(fields) }
    try {
      if (type) await window.wist.objectTypes.update(type.id, payload)
      else await window.wist.objectTypes.create(payload)
      onSaved()
      onClose()
    } catch {
      toast(t('types.saveError'))
      setSaving(false)
    }
  }

  return (
    <Modal title={type ? t('types.editTitle') : t('types.add')} onClose={onClose} width="max-w-lg">
      <div className="space-y-5">
        <div>
          <label className="mb-1.5 block text-[12px] font-medium text-zinc-500">{t('types.name')}</label>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={t('types.namePh')} className="input" />
        </div>

        <div>
          <label className="mb-1.5 block text-[12px] font-medium text-zinc-500">{t('types.icon')}</label>
          <div className="flex flex-wrap gap-1.5">
            {TYPE_ICON_KEYS.map((key) => {
              const Ic = typeIcon(key)
              const on = key === icon
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setIcon(key)}
                  className={`flex h-9 w-9 items-center justify-center rounded-lg border transition-colors ${on ? 'border-transparent' : 'border-edge text-zinc-400 hover:bg-highlight'}`}
                  style={on ? { color: objColor(hue), background: `color-mix(in srgb, ${objColor(hue)} 16%, transparent)` } : undefined}
                >
                  <Ic size={17} />
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-[12px] font-medium text-zinc-500">{t('types.color')}</label>
          <div className="flex flex-wrap gap-2">
            {OBJ_HUES.map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => setHue(h)}
                className={`h-6 w-6 rounded-full transition-transform hover:scale-110 ${h === hue ? 'ring-2 ring-offset-2 ring-offset-card' : ''}`}
                style={{ background: objColor(h), ...(h === hue ? { boxShadow: `0 0 0 2px ${objColor(h)}` } : {}) }}
                aria-label={h}
              />
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-[12px] font-medium text-zinc-500">{t('types.fields')}</label>
          <PropertyEditor fields={fields} onChange={setFields} className="-ml-1" />
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="rounded-lg px-3.5 py-2 text-[13px] font-medium text-zinc-400 transition-colors hover:bg-highlight hover:text-zinc-200">
            {t('common.cancel')}
          </button>
          <button onClick={save} disabled={saving} className="rounded-lg bg-accent px-3.5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50">
            {t('common.save')}
          </button>
        </div>
      </div>
    </Modal>
  )
}

/** Settings panel: manage Capacities-style object types (icon, colour, preset props). */
export default function ObjectTypesSettings() {
  const { t } = useI18n()
  const [types, setTypes] = useState<ObjectType[]>([])
  const [editing, setEditing] = useState<ObjectType | 'new' | null>(null)
  const [confirm, setConfirm] = useState<ObjectType | null>(null)

  const load = () => window.wist.objectTypes.list().then(setTypes).catch(() => setTypes([]))
  useEffect(() => {
    load()
    return window.wist.events.onDataChanged((kind: string) => { if (kind === 'objectTypes') load() })
  }, [])

  const del = async (tp: ObjectType) => {
    setConfirm(null)
    await window.wist.objectTypes.remove(tp.id)
    load()
  }

  return (
    <>
      <div className="card divide-y divide-edge px-2">
        {types.length === 0 && <div className="px-3 py-6 text-center text-[13px] text-zinc-600">{t('types.empty')}</div>}
        {types.map((tp) => {
          const Ic = typeIcon(tp.icon)
          const c = objColor(tp.hue as ObjHue)
          return (
            <div key={tp.id} className="group flex items-center gap-3 px-2 py-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ color: c, background: `color-mix(in srgb, ${c} 16%, transparent)` }}>
                <Ic size={17} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-zinc-200">{tp.name}</div>
                <div className="text-[12px] text-zinc-600">{t('types.propCount', { n: tp.fields.length })}</div>
              </div>
              <button onClick={() => setEditing(tp)} className="rounded-lg p-1.5 text-zinc-500 opacity-0 transition-all hover:bg-highlight hover:text-zinc-200 group-hover:opacity-100" title={t('types.editTitle')}>
                <Pencil size={15} />
              </button>
              <button onClick={() => setConfirm(tp)} className="rounded-lg p-1.5 text-zinc-500 opacity-0 transition-all hover:bg-highlight hover:text-danger group-hover:opacity-100" title={t('common.delete')}>
                <Trash2 size={15} />
              </button>
            </div>
          )
        })}
      </div>

      <button onClick={() => setEditing('new')} className="mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-medium text-zinc-400 transition-colors hover:bg-highlight hover:text-zinc-200">
        <Plus size={16} /> {t('types.add')}
      </button>

      {editing && <TypeEditor type={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={load} />}
      {confirm && (
        <ConfirmDialog
          title={t('types.deleteTitle')}
          message={t('types.deleteConfirm', { name: confirm.name })}
          confirmLabel={t('common.delete')}
          danger
          onConfirm={() => del(confirm)}
          onCancel={() => setConfirm(null)}
        />
      )}
    </>
  )
}
