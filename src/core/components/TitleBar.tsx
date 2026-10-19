import { Minus, X, Square } from 'lucide-react'

/**
 * Window controls for Windows/Linux (macOS draws its own traffic lights via
 * titleBarStyle: 'hidden'). Rendered at the right end of the dark top bar.
 */
export function WindowControls(): JSX.Element | null {
  const isMac = window.api.platform === 'darwin'
  if (isMac) return null

  const btn = 'w-[44px] h-full flex items-center justify-center text-on-surface-variant hover:text-on-surface transition-colors no-drag'
  return (
    <div className="flex items-stretch self-stretch -mr-1 ml-1 gap-0.5">
      <button onClick={() => window.api.send('window:minimize')} title="Minimizar" className={`${btn} hover:bg-on-surface/6`}>
        <Minus size={14} strokeWidth={1.4} />
      </button>
      <button onClick={() => window.api.send('window:maximize')} title="Maximizar" className={`${btn} hover:bg-on-surface/6`}>
        <Square size={11} strokeWidth={1.4} />
      </button>
      <button onClick={() => window.api.send('window:close')} title="Cerrar" className={`${btn} hover:bg-[#e81123]! hover:text-white!`}>
        <X size={15} strokeWidth={1.4} />
      </button>
    </div>
  )
}
