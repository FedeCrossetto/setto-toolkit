import { Component, type ReactNode } from 'react'
import { TriangleAlert } from 'lucide-react'
import { isChunkLoadError, reportRendererError } from './error-report'

interface Props {
  children: ReactNode
  /** Optional label shown in the error card (e.g. the plugin name) */
  label?: string
  /**
   * `root`: envuelve toda una ventana (shell, barra flotante, selector). Pantalla
   * completa con "Recargar" en vez de "Reintentar" (no hay nada alrededor que siga andando).
   */
  variant?: 'panel' | 'root'
}

interface State {
  error: Error | null
}

/**
 * ErrorBoundary wraps any subtree and catches render-time errors.
 * If a plugin crashes, only that plugin's panel shows the error card —
 * the rest of the app (sidebar, tabs) stays usable. Errors are logged to app.log.
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
    reportRendererError(`boundary:${this.props.label ?? this.props.variant ?? 'panel'}`, error, info.componentStack ?? undefined)
  }

  private handleReset = (): void => {
    this.setState({ error: null })
  }

  private handleReload = (): void => {
    window.location.reload()
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children

    const root = this.props.variant === 'root'
    // Un módulo que no cargó no se arregla re-renderizando: React.lazy guarda el fallo.
    const needsReload = root || isChunkLoadError(error)

    return (
      <div className={`flex items-center justify-center w-full p-8 ${root ? 'h-screen bg-background text-on-surface' : 'h-full'}`}>
        <div className="ui-card max-w-sm w-full px-6 py-6 text-center flex flex-col items-center">
          <span className="w-10 h-10 rounded-(--r-lg) flex items-center justify-center bg-warning/[0.14] text-warning mb-3">
            <TriangleAlert size={20} />
          </span>
          <h2 className="t-headline text-on-surface">
            {this.props.label ? `${this.props.label} tuvo un problema` : 'Algo salió mal'}
          </h2>
          <p className="t-footnote text-on-surface-variant mt-1">
            {root
              ? 'Tus datos están guardados. Recargá la ventana; si sigue fallando, exportá los logs desde Ajustes.'
              : 'No se perdió nada del resto de la app. Probá de nuevo; si sigue fallando, exportá los logs desde Ajustes.'}
          </p>
          {error.message && (
            <p className="t-caption text-on-surface-variant/80 font-mono mt-3 px-2 py-1.5 rounded-(--r-xs) bg-on-surface/5 w-full wrap-break-word">
              {error.message}
            </p>
          )}
          <div className="flex gap-2 mt-4">
            {needsReload ? (
              <button onClick={this.handleReload} className="ui-btn ui-btn-primary">Recargar</button>
            ) : (
              <button onClick={this.handleReset} className="ui-btn ui-btn-primary">Reintentar</button>
            )}
          </div>
        </div>
      </div>
    )
  }
}
