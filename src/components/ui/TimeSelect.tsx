const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const MINUTES = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55']

/** Themed time picker (hour + minute selects) — avoids the unstyleable native <input type="time">. */
export default function TimeSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [h, m] = value ? value.split(':') : ['', '']
  return (
    <div className="flex items-center gap-1">
      <select
        className="select !w-auto !py-1.5"
        value={h}
        onChange={(e) => onChange(e.target.value ? `${e.target.value}:${m || '00'}` : '')}
      >
        <option value="">--</option>
        {HOURS.map((x) => (
          <option key={x} value={x}>
            {x}
          </option>
        ))}
      </select>
      <span className="text-zinc-500">:</span>
      <select
        className="select !w-auto !py-1.5"
        value={m || '00'}
        disabled={!h}
        onChange={(e) => onChange(h ? `${h}:${e.target.value}` : '')}
      >
        {MINUTES.map((x) => (
          <option key={x} value={x}>
            {x}
          </option>
        ))}
      </select>
    </div>
  )
}
