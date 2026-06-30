import { Minus, X, Square } from 'lucide-react'

export function TitleBar(): JSX.Element {
  const minimize = (): void => window.api.send('window:minimize')
  const maximize = (): void => window.api.send('window:maximize')
  const close = (): void => window.api.send('window:close')

  const isWindows = window.api.platform === 'win32' || window.api.platform === 'linux'

  return (
    <div
      className="fixed top-0 left-0 right-0 h-8 z-[200] flex items-center justify-end group/titlebar"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {isWindows ? (
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
      ) : (
        <div
          className="flex items-center gap-2 px-3"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <button
            onClick={minimize}
            title="Minimizar"
            className="w-3 h-3 rounded-full bg-[#FEBC2E] flex items-center justify-center text-black/60 transition-transform hover:scale-110"
          >
            <Minus size={8} strokeWidth={3} className="opacity-0 group-hover/titlebar:opacity-100 transition-opacity" />
          </button>
          <button
            onClick={maximize}
            title="Maximizar"
            className="w-3 h-3 rounded-full bg-[#28C840] flex items-center justify-center text-black/60 transition-transform hover:scale-110"
          >
            <Square size={6} strokeWidth={3} className="opacity-0 group-hover/titlebar:opacity-100 transition-opacity" />
          </button>
          <button
            onClick={close}
            title="Cerrar"
            className="w-3 h-3 rounded-full bg-[#FF5F57] flex items-center justify-center text-black/60 transition-transform hover:scale-110"
          >
            <X size={8} strokeWidth={3} className="opacity-0 group-hover/titlebar:opacity-100 transition-opacity" />
          </button>
        </div>
      )}
    </div>
  )
}
