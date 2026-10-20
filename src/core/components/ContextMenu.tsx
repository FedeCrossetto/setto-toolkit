import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import type { IconComponent } from '../types'

/**
 * Menú contextual (clic derecho) de toda la app: ícono, texto, atajo alineado a la
 * derecha y separadores. Se maneja con flechas/Enter/Esc y nunca se sale de la ventana.
 */
export interface MenuItem {
  label: string
  icon?: IconComponent
  action: () => void
  /** Atajo para mostrar a la derecha, p. ej. "Ctrl+S" */
  shortcut?: string
  danger?: boolean
  disabled?: boolean
  /** Separador antes de este ítem */
  divider?: boolean
}

interface ContextMenuProps {
  x: number
  y: number
  items: MenuItem[]
  onClose: () => void
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x, top: y })
  const actionable = items.flatMap((it, i) => (it.label && !it.disabled ? [i] : []))
  const [hi, setHi] = useState<number>(-1)

  // Dentro de la ventana: medir y correr si no entra.
  useLayoutEffect(() => {
    const r = ref.current?.getBoundingClientRect()
    if (!r) return
    setPos({
      left: Math.max(6, Math.min(x, window.innerWidth - r.width - 6)),
      top: Math.max(6, y + r.height > window.innerHeight - 6 ? y - r.height : y),
    })
  }, [x, y])

  useEffect(() => {
    const onMouse = (e: MouseEvent): void => { if (!ref.current?.contains(e.target as Node)) onClose() }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const at = actionable.indexOf(hi)
        const next = e.key === 'ArrowDown' ? actionable[(at + 1) % actionable.length] : actionable[(at - 1 + actionable.length) % actionable.length]
        setHi(next ?? -1)
        return
      }
      if (e.key === 'Enter' && hi >= 0) {
        e.preventDefault()
        items[hi]!.action()
        onClose()
      }
    }
    document.addEventListener('mousedown', onMouse)
    document.addEventListener('keydown', onKey, true)
    window.addEventListener('blur', onClose)
    return () => {
      document.removeEventListener('mousedown', onMouse)
      document.removeEventListener('keydown', onKey, true)
      window.removeEventListener('blur', onClose)
    }
  }, [onClose, hi, items, actionable])

  return createPortal(
    <motion.div
      ref={ref}
      role="menu"
      className="ui-menu fixed z-200 min-w-[220px] max-w-[320px] p-1"
      style={{ left: pos.left, top: pos.top }}
      initial={{ opacity: 0, scale: 0.98, y: -2 }} animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.11, ease: 'easeOut' }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, i) => (
        <div key={i}>
          {item.divider && i > 0 && <div className="hairline-t my-1 mx-1" role="separator" />}
          {item.label && (
            <button
              role="menuitem"
              disabled={item.disabled}
              onMouseEnter={() => setHi(i)}
              onMouseLeave={() => setHi(-1)}
              onClick={() => { item.action(); onClose() }}
              className={`ctx-item w-full flex items-center gap-2.5 h-[30px] px-2.5 rounded-[7px] text-left text-[13px] transition-colors disabled:opacity-40 ${
                hi === i ? (item.danger ? 'bg-error/12 text-error' : 'bg-on-surface/7 text-on-surface') : item.danger ? 'text-error' : 'text-on-surface'}`}
            >
              {item.icon ? <item.icon size={14} className={`shrink-0 ${item.danger ? '' : 'text-on-surface-variant'}`} /> : <span className="w-[14px] shrink-0" />}
              <span className="flex-1 min-w-0 truncate">{item.label}</span>
              {item.shortcut && (
                <span className="flex items-center gap-0.5 shrink-0 pl-3">
                  {item.shortcut.split('+').map((k, j) => (
                    <kbd key={j} className="font-sans text-[10.5px] leading-none px-[5px] py-[3px] rounded-[4px] bg-on-surface/6 text-on-surface-variant">{k}</kbd>
                  ))}
                </span>
              )}
            </button>
          )}
        </div>
      ))}
    </motion.div>,
    document.body,
  )
}
