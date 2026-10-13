import { useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { Tooltip } from '../../../core/components/Tooltip'
import type { OpenFile } from '../types'
import type { EditorPaneId } from '../hooks/useSplitView'

const MIN_RATIO = 0.2
const MAX_RATIO = 0.8

/**
 * Contenedor de la vista dividida. El panel principal conserva siempre el mismo
 * nodo (no se remonta el editor al abrir/cerrar la división).
 */
export function SplitLayout({ secondary, ratio, onRatioChange, focused, onFocusPane, children }: {
  secondary: ReactNode | null
  ratio: number
  onRatioChange: (ratio: number) => void
  focused: EditorPaneId
  onFocusPane: (pane: EditorPaneId) => void
  children: ReactNode
}): JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null)
  const split = secondary !== null

  const onDividerDown = (e: React.PointerEvent): void => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    const rect = rootRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return
    const onMove = (ev: PointerEvent): void => {
      const r = (ev.clientX - rect.left) / rect.width
      onRatioChange(Math.max(MIN_RATIO, Math.min(MAX_RATIO, r)))
    }
    const onUp = (): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const focusBar = <span className="absolute top-0 inset-x-0 h-[2px] bg-primary z-10 pointer-events-none" aria-hidden />

  return (
    <div ref={rootRef} className="flex h-full min-w-0">
      <div
        className={`relative min-w-0 h-full ${split ? 'flex-shrink-0' : 'flex-1'}`}
        style={split ? { width: `${ratio * 100}%` } : undefined}
        onPointerDownCapture={split ? () => onFocusPane('main') : undefined}
        onFocusCapture={split ? () => onFocusPane('main') : undefined}
      >
        {split && focused === 'main' && focusBar}
        {children}
      </div>
      {split && (
        <>
          <div
            onPointerDown={onDividerDown}
            onDoubleClick={() => onRatioChange(0.5)}
            className="flex-shrink-0 w-[5px] -mx-[2px] z-10 cursor-col-resize group relative"
            style={{ touchAction: 'none' }}
            title="Arrastrar para redimensionar · doble clic para centrar"
            role="separator"
            aria-orientation="vertical"
          >
            <div className="absolute inset-y-0 left-[2px] w-[1px] bg-[var(--hairline)] group-hover:bg-primary/50 group-active:bg-primary/50 transition-colors duration-150" />
          </div>
          <div
            className="relative flex-1 min-w-0 h-full flex flex-col"
            onPointerDownCapture={() => onFocusPane('split')}
            onFocusCapture={() => onFocusPane('split')}
          >
            {focused === 'split' && focusBar}
            {secondary}
          </div>
        </>
      )}
    </div>
  )
}

/** Encabezado del panel derecho: selector de archivo + cerrar división. */
export function SplitPaneHeader({ tabs, tab, onPick, onClose }: {
  tabs: OpenFile[]
  tab: OpenFile
  onPick: (id: string) => void
  onClose: () => void
}): JSX.Element {
  return (
    <div className="flex items-center gap-1.5 h-8 px-2 hairline-b fe-chrome flex-shrink-0">
      <select
        value={tab.id}
        onChange={(e) => onPick(e.target.value)}
        aria-label="Archivo del panel derecho"
        title={tab.path ?? tab.name}
        className="ui-input !py-0.5 !px-2 t-footnote min-w-0 max-w-[70%] truncate"
      >
        {tabs.map((t) => (
          <option key={t.id} value={t.id}>{t.isDirty ? `● ${t.name}` : t.name}</option>
        ))}
      </select>
      {tab.isDirty && <span title="Sin guardar" className="w-1.5 h-1.5 rounded-full bg-on-surface-variant flex-shrink-0" />}
      <div className="ml-auto flex items-center">
        <Tooltip label="Cerrar división" shortcut="Ctrl+\">
          <button onClick={onClose} aria-label="Cerrar división" className="ui-btn ui-btn-ghost ui-btn-icon">
            <X size={14} />
          </button>
        </Tooltip>
      </div>
    </div>
  )
}
