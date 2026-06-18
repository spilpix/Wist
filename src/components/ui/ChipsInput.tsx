import { useState } from 'react'
import { X } from 'lucide-react'

interface Props {
  value: string[]
  onChange: (value: string[]) => void
  placeholder?: string
}

export default function ChipsInput({ value, onChange, placeholder }: Props) {
  const [draft, setDraft] = useState('')

  const add = () => {
    const v = draft.trim()
    if (v && !value.includes(v)) onChange([...value, v])
    setDraft('')
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-edge bg-field px-2 py-1.5 focus-within:border-accent">
      {value.map((chip) => (
        <span key={chip} className="flex items-center gap-1 rounded-full bg-highlight px-2 py-0.5 text-xs font-medium text-zinc-300">
          {chip}
          <button onClick={() => onChange(value.filter((c) => c !== chip))} className="text-zinc-500 hover:text-white">
            <X size={11} />
          </button>
        </span>
      ))}
      <input
        className="min-w-[100px] flex-1 bg-transparent px-1 py-0.5 text-sm outline-none placeholder:text-zinc-600"
        value={draft}
        placeholder={value.length ? '' : placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault()
            add()
          } else if (e.key === 'Backspace' && !draft && value.length) {
            onChange(value.slice(0, -1))
          }
        }}
        onBlur={add}
      />
    </div>
  )
}
