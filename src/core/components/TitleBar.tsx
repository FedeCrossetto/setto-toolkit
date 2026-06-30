import { Minus, X, Square } from 'lucide-react'

export function TitleBar(): JSX.Element {
  const minimize = (): void => window.api.send('window:minimize')
  const maximize = (): void => window.api.send('window:maximize')
  const close = (): void => window.api.send('window:close')

  return (
    <div
      className="fixed top-0 left-0 right-0 h-8 z-[200] flex items-center justify-end px-3 gap-2 group/titlebar"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div
        className="flex items-center gap-2"
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
    </div>
  )
}
