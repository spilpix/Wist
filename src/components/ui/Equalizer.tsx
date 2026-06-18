/** Three animated bars that signal the currently-playing track. Inherits `currentColor`. */
export default function Equalizer({ className = '', paused = false }: { className?: string; paused?: boolean }) {
  return (
    <span className={`flex h-3.5 items-end gap-[2px] ${className}`} aria-hidden>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="eq-bar w-[2.5px] rounded-full bg-current"
          style={{ height: '100%', animationDelay: `${i * 0.18}s`, animationPlayState: paused ? 'paused' : 'running' }}
        />
      ))}
    </span>
  )
}
