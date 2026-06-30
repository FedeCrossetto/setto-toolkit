import { Minus, X, Square } from 'lucide-react'

export function TitleBar(): JSX.Element {
  const minimize = (): void => window.api.send('window:minimize')
  const maximize = (): void => window.api.send('window:maximize')
  const close = (): void => window.api.send('window:close')

  const isWindows = window.api.platform === 'win32' || window.api.platform === 'linux'

  return (
    <div
      className="fixed top-0 left-0 right-0 h-8 z-[200] flex items-center justify-end"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* macOS already has native traffic lights (left side, via titleBarStyle: 'hidden')
          — only draw our own custom min/max/close on Windows/Linux, which have none. */}
      {isWindows && (
        <div
          className="flex items-stretch h-full"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <button
            onClick={minimize}
            title="Minimizar"
            className="w-11 h-full flex items-center justify-center text-on-surface-variant/70 hover:bg-on-surface/10 hover:text-on-surface transition-colors"
          >
            <Minus size={13} strokeWidth={1.5} />
          </button>
          <button
            onClick={maximize}
            title="Maximizar"
            className="w-11 h-full flex items-center justify-center text-on-surface-variant/70 hover:bg-on-surface/10 hover:text-on-surface transition-colors"
          >
            <Square size={10} strokeWidth={1.5} />
          </button>
          <button
            onClick={close}
            title="Cerrar"
            className="w-11 h-full flex items-center justify-center text-on-surface-variant/70 hover:bg-error hover:text-white transition-colors"
          >
            <X size={14} strokeWidth={1.5} />
          </button>
        </div>
      )}
    </div>
  )
}
