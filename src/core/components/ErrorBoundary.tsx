import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  /** Optional label shown in the error card (e.g. the plugin name) */
  label?: string
}

interface State {
  error: Error | null
}

/**
 * ErrorBoundary wraps any subtree and catches render-time errors.
 * If a plugin crashes, only that plugin's panel shows the error card —
 * the rest of the app (sidebar, tab bar, status bar) stays functional.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[ErrorBoundary]', this.props.label ?? 'unknown', error, info.componentStack)
  }

  private handleReset = (): void => {
    this.setState({ error: null })
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="flex items-center justify-center h-full w-full p-8">
        <div className="max-w-md w-full bg-error-container/20 border border-error/25 rounded-2xl p-6 text-center">
          <span
            className="material-symbols-outlined text-error mb-3 block"
            style={{ fontSize: '36px', fontVariationSettings: "'FILL' 1" }}
          >
            error
          </span>
          <h2 className="text-sm font-bold text-on-surface mb-1">
            {this.props.label ? `${this.props.label} crashed` : 'Something went wrong'}
          </h2>
          <p className="text-xs text-on-surface-variant/70 mb-4 leading-relaxed">
            {error.message || 'An unexpected error occurred in this panel.'}
          </p>
          <button
            onClick={this.handleReset}
            className="px-4 py-2 rounded-lg text-xs font-semibold bg-error/10 text-error border border-error/20 hover:bg-error/20 transition-colors"
          >
            Try again
          </button>
        </div>
      </div>
    )
  }
}
