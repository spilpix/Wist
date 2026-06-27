import { useEffect, useState } from 'react'
import { Book, BookOpen, Box, Briefcase, CalendarClock, CalendarDays, Check, CircleDot, Code, Coffee, Film, Flag, FolderKanban, Globe, Heart, Image, Lightbulb, Link as LinkIcon, ListTodo, type LucideIcon, MapPin, Music, PenLine, Plus, Star, Tag, User, Users, X, Zap } from 'lucide-react'
import type { ObjectType, PropField } from '../types/models'
import { objColor, type ObjHue } from '../lib/objectColors'
import { usePopover } from '../lib/usePopover'
import { useI18n } from '../i18n'

const uid = () => Math.random().toString(36).slice(2, 10)

// lucide icon by the type's stored key (seed presets + a palette for the type editor); Box fallback
const TYPE_ICONS: Record<string, LucideIcon> = { BookOpen, Book, User, Users, CalendarClock, CalendarDays, Lightbulb, Link: LinkIcon, Film, FolderKanban, PenLine, ListTodo, Tag, Briefcase, Code, Coffee, Globe, Heart, Image, MapPin, Music, Star, Flag, Zap, CircleDot, Box }
export const typeIcon = (key: string): LucideIcon => TYPE_ICONS[key] ?? Box
export const TYPE_ICON_KEYS = Object.keys(TYPE_ICONS)

/** Merge a type's preset fields into an object's current fields (skip names already
 *  present, give fresh ids). Used when a type is assigned. */
export function mergeTypeFields(existing: PropField[], type: ObjectType): PropField[] {
  const have = new Set(existing.map((f) => f.name.trim().toLowerCase()))
  const add = (type.fields || []).filter((f) => !have.has(f.name.trim().toLowerCase())).map((f) => ({ ...f, id: uid() }))
  return [...existing, ...add]
}

/**
 * Capacities-style object-type chip + picker. Shows the current type (coloured icon +
 * name) or a subtle "add type" affordance; the menu lists all types (+ "no type").
 * Picking a type is reported to the parent, which applies the preset + persists.
 */
export default function TypePicker({ typeId, onPick, className = '' }: { typeId?: number; onPick: (type: ObjectType | null) => void; className?: string }) {
  const { t } = useI18n()
  const [types, setTypes] = useState<ObjectType[]>([])
  const menu = usePopover<HTMLDivElement>()

  const load = () => window.wist.objectTypes.list().then(setTypes).catch(() => setTypes([]))
  useEffect(() => {
    load()
    return window.wist.events.onDataChanged((kind: string) => { if (kind === 'objectTypes') load() })
  }, [])

  const current = typeId != null ? types.find((x) => x.id === typeId) : undefined
  const Icon = current ? typeIcon(current.icon) : null
  const color = current ? objColor(current.hue as ObjHue) : undefined

  return (
    <div ref={menu.ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => menu.setOpen((o) => !o)}
        className={`flex items-center gap-1.5 rounded-full py-1 text-[12.5px] font-medium transition-colors ${
          current ? 'pl-2 pr-2.5' : 'px-2 text-zinc-500 hover:text-zinc-300'
        }`}
        style={current ? { color, background: `color-mix(in srgb, ${color} 14%, transparent)` } : undefined}
        title={t('props.pickType')}
      >
        {Icon && color ? <Icon size={13} /> : <Plus size={13} />}
        <span>{current ? current.name : t('props.addType')}</span>
      </button>

      {menu.open && (
        <div className="absolute left-0 top-full z-50 mt-1 max-h-72 w-52 overflow-y-auto rounded-lg border border-edge bg-raised p-1 shadow-lg">
          {types.map((tp) => {
            const TIcon = typeIcon(tp.icon)
            const c = objColor(tp.hue as ObjHue)
            const sel = tp.id === typeId
            return (
              <button
                key={tp.id}
                type="button"
                onClick={() => { onPick(tp); menu.setOpen(false) }}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-highlight ${sel ? 'text-zinc-100' : 'text-zinc-300'}`}
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded" style={{ color: c, background: `color-mix(in srgb, ${c} 16%, transparent)` }}>
                  <TIcon size={12} />
                </span>
                <span className="min-w-0 flex-1 truncate">{tp.name}</span>
                {sel && <Check size={13} className="shrink-0 text-accent-bright" />}
              </button>
            )
          })}
          {typeId != null && (
            <>
              <div className="my-1 h-px bg-edge" />
              <button
                type="button"
                onClick={() => { onPick(null); menu.setOpen(false) }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-zinc-400 hover:bg-highlight"
              >
                <X size={13} /> {t('props.noType')}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
