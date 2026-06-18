import { ArrowLeftRight, X } from 'lucide-react'
import ErrorBoundary from './ErrorBoundary'
import PaneRouter from './PaneRouter'
import PaneRoutes from '../routes'
import { routeMeta } from '../lib/routeMeta'
import { useI18n } from '../i18n'

/**
 * The right-hand split pane. Runs an INDEPENDENT router (PaneRouter) seeded with
 * `path`, so it navigates fully on its own — links, back, params all stay in the
 * pane (the Chrome/Edge/Arc split model). Keyed by `path` upstream so picking a new
 * tab to split re-seeds it.
 */
export default function SplitPane({ path, onClose, onSwap }: { path: string; onClose: () => void; onSwap: () => void }) {
  const { t } = useI18n()
  const { icon: Icon, label } = routeMeta(path, t)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-edge bg-surface px-3">
        <Icon size={14} className="shrink-0 text-zinc-500" />
        <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-zinc-300">{label}</span>
        <button
          onClick={onSwap}
          title={t('split.swap')}
          className="flex h-6 w-6 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-highlight hover:text-zinc-200"
        >
          <ArrowLeftRight size={14} />
        </button>
        <button
          onClick={onClose}
          title={t('split.close')}
          className="flex h-6 w-6 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-highlight hover:text-zinc-200"
        >
          <X size={15} />
        </button>
      </div>
      <div className="min-h-0 flex-1 bg-bg">
        <ErrorBoundary resetKey={path}>
          <PaneRouter initialPath={path}>
            <PaneRoutes />
          </PaneRouter>
        </ErrorBoundary>
      </div>
    </div>
  )
}
