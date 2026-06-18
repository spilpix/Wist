import { useToastStore } from '../../store/toastStore'

// neutral card body in every case; the kind only tints the text/accent so the
// toast stays calm. Colours come from the theme-correct content-colour vars.
const KIND_STYLES = {
  info: 'text-zinc-200',
  success: 'text-[color:var(--c-green-text)]',
  error: 'text-[color:var(--c-red-text)]',
}

export default function Toaster() {
  const toasts = useToastStore((s) => s.toasts)
  const dismiss = useToastStore((s) => s.dismiss)
  if (!toasts.length) return null
  return (
    <div className="fixed bottom-5 right-5 z-[100] flex w-80 flex-col gap-2">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => dismiss(t.id)}
          style={{ boxShadow: 'var(--float-shadow)' }}
          className={`animate-slide-up rounded-lg border border-edge bg-card px-4 py-3 text-left text-sm font-medium ${KIND_STYLES[t.kind]}`}
        >
          {t.message}
        </button>
      ))}
    </div>
  )
}
