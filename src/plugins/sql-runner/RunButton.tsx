import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Layers, Loader2, Play, Square, TextCursorInput } from 'lucide-react'

/**
 * Botón Ejecutar de Consultas: dividido (acción principal + menú). Dice qué va a
 * correr (todo o la selección), muestra el atajo y, mientras corre, se vuelve
 * "Detener" con el tiempo transcurrido.
 */
export type RunMode = 'auto' | 'all' | 'selection' | 'batch'

export function RunButton({ running, elapsed, hasSelection, disabled, onRun, onCancel }: {
  running: boolean
  /** Texto del tiempo transcurrido (p. ej. "2.3 s") */
  elapsed: string
  hasSelection: boolean
  disabled: boolean
  onRun: (mode: RunMode) => void
  onCancel: () => void
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false) } }
    window.addEventListener('mousedown', onDown); window.addEventListener('keydown', onKey, true)
    return () => { window.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey, true) }
  }, [open])

  if (running) {
    return (
      <button type="button" onClick={onCancel} title="Detener la consulta (Esc)"
        className="ui-btn-stop run-shimmer group flex items-center gap-2 h-[32px] pl-3 pr-3.5 rounded-[9px] text-[13px] transition-colors">
        <span className="relative grid place-items-center w-4 h-4">
          <Loader2 size={16} className="absolute animate-spin opacity-70" />
          <Square size={7} weight="fill" />
        </span>
        Detener
        <span className="tabular-nums font-medium text-white/80 min-w-[44px] text-right">{elapsed}</span>
      </button>
    )
  }

  const item = (mode: RunMode, Icon: typeof Play, label: string, keys: string | null, off = false): JSX.Element => (
    <button type="button" role="menuitem" disabled={off} onClick={() => { setOpen(false); onRun(mode) }}
      className="w-full flex items-center gap-2.5 h-[32px] px-2.5 rounded-[8px] text-left text-[12.5px] text-on-surface hover:bg-on-surface/6 disabled:opacity-40 disabled:pointer-events-none">
      <Icon size={14} className="text-on-surface-variant shrink-0" />
      <span className="flex-1">{label}</span>
      {keys && <kbd className="kbd-chip">{keys}</kbd>}
    </button>
  )

  return (
    <div ref={ref} className="relative flex">
      <div className={`ui-btn-run flex items-stretch h-[32px] rounded-[9px] overflow-hidden ${disabled ? 'opacity-45 pointer-events-none' : ''}`}>
        <button type="button" onClick={() => onRun('auto')} disabled={disabled}
          title={hasSelection ? 'Ejecutar sólo lo seleccionado (F5 o Ctrl+Enter)' : 'Ejecutar todo (F5 o Ctrl+Enter)'}
          className="flex items-center gap-2 pl-3 pr-2.5 text-[13px] font-semibold hover:bg-black/8 transition-colors">
          <Play size={13} weight="fill" />
          {hasSelection ? 'Ejecutar selección' : 'Ejecutar'}
          <span className="ml-0.5 px-1 rounded-[4px] bg-black/15 text-[10.5px] font-bold leading-[16px]">F5</span>
        </button>
        <span className="w-px my-1.5 bg-white/25" />
        <button type="button" onClick={() => setOpen((v) => !v)} disabled={disabled} aria-label="Más formas de ejecutar" aria-haspopup="menu" aria-expanded={open}
          className="grid place-items-center w-7 hover:bg-black/8 transition-colors">
          <ChevronDown size={13} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>
      {open && (
        <div role="menu" className="ui-menu absolute top-full left-0 mt-1.5 z-50 w-[300px] p-1!">
          {item('all', Play, 'Ejecutar todo', hasSelection ? null : 'F5')}
          {item('selection', TextCursorInput, 'Ejecutar selección', hasSelection ? 'F5' : null, !hasSelection)}
          {item('batch', Layers, 'Ejecutar lote actual (GO)', 'Ctrl Shift Enter')}
        </div>
      )}
    </div>
  )
}
