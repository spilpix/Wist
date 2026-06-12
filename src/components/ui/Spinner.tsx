export default function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-edge border-t-accent" />
      {label && <div className="text-sm text-zinc-500">{label}</div>}
    </div>
  )
}
