import Select from './Select'

const HOUR_OPTS = [{ value: '', label: '--' }, ...Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')).map((x) => ({ value: x, label: x }))]
const MINUTE_OPTS = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'].map((x) => ({ value: x, label: x }))

/** Themed time picker (hour + minute selects) — avoids the unstyleable native <input type="time">. */
export default function TimeSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [h, m] = value ? value.split(':') : ['', '']
  return (
    <div className="flex items-center gap-1">
      <Select
        size="sm"
        className="w-[62px]"
        value={h}
        options={HOUR_OPTS}
        onChange={(v) => onChange(v ? `${v}:${m || '00'}` : '')}
      />
      <span className="text-zinc-500">:</span>
      <Select
        size="sm"
        className="w-[62px]"
        value={m || '00'}
        disabled={!h}
        options={MINUTE_OPTS}
        onChange={(v) => onChange(h ? `${h}:${v}` : '')}
      />
    </div>
  )
}
