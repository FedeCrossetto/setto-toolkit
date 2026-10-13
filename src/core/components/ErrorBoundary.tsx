import { Component, type ReactNode } from 'react'
import { TriangleAlert } from 'lucide-react'

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
 * the rest of the app (sidebar, tabs) stays usable.
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
        <div className="ui-card max-w-sm w-full px-6 py-6 text-center flex flex-col items-center">
          <span className="w-10 h-10 rounded-[var(--radius-lg)] flex items-center justify-center bg-warning/[0.14] text-warning mb-3">
            <TriangleAlert size={20} />
          </span>
          <h2 className="t-headline text-on-surface">
            {this.props.label ? `${this.props.label} tuvo un problema` : 'Algo salió mal'}
          </h2>
          <p className="t-footnote text-on-surface-variant mt-1">
            No se perdió nada del resto de la app. Probá de nuevo; si sigue fallando, exportá los logs desde Ajustes.
          </p>
          {error.message && (
            <p className="t-caption text-on-surface-variant/80 font-mono mt-3 px-2 py-1.5 rounded-[var(--radius-xs)] bg-on-surface/[0.05] w-full break-words">
              {error.message}
            </p>
          )}
          <button onClick={this.handleReset} className="ui-btn ui-btn-primary mt-4">
            Reintentar
          </button>
        </div>
      </div>
    )
  }
}
