import { Minimize2 } from 'lucide-react'
import { WindowControls } from './TitleBar'

/**
 * Modo foco (F11): la barra lateral y el encabezado se ocultan. Arriba queda una franja
 * invisible que, al pasar el mouse, muestra cómo salir y los controles de ventana
 * (la ventana no tiene marco: sin esto no se podría mover ni cerrar).
 */
export function FocusBar({ onExit }: { onExit: () => void }): JSX.Element {
  return (
    <div className="group absolute inset-x-0 top-0 z-40 h-[10px] hover:h-[40px] transition-[height] duration-150">
      <div className="drag-region h-full flex items-center justify-center gap-2 px-3 bg-surface/95 hairline-b opacity-0 group-hover:opacity-100 transition-opacity duration-150">
        <button type="button" onClick={onExit} title="Salir del modo foco (F11)"
          className="no-drag ui-btn ui-btn-outline ui-btn-sm h-[26px] px-3">
          <Minimize2 size={13} /> Salir del modo foco
        </button>
        <span className="absolute right-3 top-1/2 -translate-y-1/2 no-drag"><WindowControls /></span>
      </div>
    </div>
  )
}
