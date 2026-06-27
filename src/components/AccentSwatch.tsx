import { ChevronDown } from 'lucide-react'
import { useSettingsStore } from '../store/settingsStore'
import { useI18n } from '../i18n'
import { ACCENT_PRESETS, swatchStyle } from '../lib/accents'
import { usePopover } from '../lib/usePopover'

/** Top-bar accent picker: a single swatch of the current accent + chevron that opens a
 *  popover with the presets and a custom-colour input. Collapses the old row of five
 *  raw dots into one calm control next to the theme toggle. */
export default function AccentSwatch() {
  const { t } = useI18n()
  const settings = useSettingsStore((s) => s.settings)
  const update = useSettingsStore((s) => s.update)
  const { open, setOpen, ref } = usePopover<HTMLDivElement>()
  const current = settings?.accentColor ?? ''

  return (
    <div ref={ref} className="app-no-drag relative shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        data-accent-swatch
        data-tip={t('set.accent')}
        className="flex h-7 items-center gap-1 rounded-lg border border-edge px-1.5 text-zinc-500 transition-colors hover:bg-raised hover:text-zinc-300"
      >
        <span className="h-3.5 w-3.5 rounded-full ring-1 ring-black/10" style={swatchStyle(current)} />
        <ChevronDown size={12} />
      </button>
      {open && (
        <div
          className="absolute right-0 top-full z-50 mt-1.5 flex items-center gap-2 rounded-xl border border-edge bg-card p-2 shadow-[var(--float-shadow)] animate-scale-in"
          style={{ transformOrigin: 'top right' }}
        >
          {ACCENT_PRESETS.map((preset) => (
            <button
              key={preset.value}
              title={t(preset.nameKey)}
              onClick={() => {
                update({ accentColor: preset.value })
                setOpen(false)
              }}
              className={`h-6 w-6 rounded-full transition-transform hover:scale-110 ${
                current === preset.value ? 'ring-2 ring-accent ring-offset-2 ring-offset-card' : ''
              }`}
              style={swatchStyle(preset.value)}
            />
          ))}
          <label
            className="relative flex h-6 w-6 cursor-pointer items-center justify-center rounded-full border border-edge text-zinc-500"
            title={t('set.accentCustom')}
          >
            +
            <input
              type="color"
              value={current || getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#2383e1'}
              onChange={(e) => update({ accentColor: e.target.value })}
              className="absolute h-0 w-0 opacity-0"
            />
          </label>
        </div>
      )}
    </div>
  )
}
