import { Component, type ReactNode } from 'react'
import { RotateCcw } from 'lucide-react'
import { t } from '../i18n'

interface Props {
  children: ReactNode
  /** changing this (e.g. the route path) auto-clears a caught error */
  resetKey?: string
}
interface State {
  error: Error | null
}

/**
 * Catches render-time throws so a single bad page never white-screens the whole app.
 * Wrapped around the routed <Outlet/> (keyed by pathname → navigating clears the error)
 * and again around the root as a backstop.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error('Render error caught by boundary:', error, info)
  }

  componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null })
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-4 px-10 py-16 text-center animate-fade-in">
          <div className="text-[15px] font-semibold text-white">{t('error.title')}</div>
          <p className="max-w-sm text-sm leading-relaxed text-zinc-500">{t('error.body')}</p>
          <button className="btn-ghost mt-1" onClick={() => this.setState({ error: null })}>
            <RotateCcw size={15} /> {t('error.retry')}
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
