import { useToastStore } from '../../store/toastStore'

const KIND_STYLES = {
  info: 'border-edge bg-raised text-zinc-200',
  success: 'border-green-500/30 bg-raised text-success',
  error: 'border-red-500/30 bg-raised text-danger',
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
          className={`animate-slide-up rounded-lg border px-4 py-3 text-left text-sm shadow-none ${KIND_STYLES[t.kind]}`}
        >
          {t.message}
        </button>
      ))}
    </div>
  )
}
