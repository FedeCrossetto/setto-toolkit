import { useState, useRef, cloneElement, isValidElement } from 'react'
import { createPortal } from 'react-dom'

interface TooltipProps {
  /** Texto del tooltip. Si está vacío, no se muestra nada. */
  label: string
  /** Atajo de teclado opcional, mostrado como chip al lado del texto */
  shortcut?: string
  /** Posición preferida (default: bottom) */
  side?: 'top' | 'bottom'
  children: React.ReactElement
}

/**
 * Tooltip oscuro (color de la barra superior), chico y redondeado.
 * Renderiza por portal en <body> con position:fixed — nunca queda
 * clippeado por contenedores con overflow-hidden.
 */
export function Tooltip({ label, shortcut, side = 'bottom', children }: TooltipProps): JSX.Element {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  if (!isValidElement(children)) return children

  const show = (e: React.MouseEvent<HTMLElement>): void => {
    const rect = e.currentTarget.getBoundingClientRect()
    timerRef.current = setTimeout(() => {
      setPos({
        x: rect.left + rect.width / 2,
        y: side === 'bottom' ? rect.bottom + 6 : rect.top - 6,
      })
    }, 450)
  }

  const hide = (): void => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setPos(null)
  }

  const child = cloneElement(children as React.ReactElement<Record<string, unknown>>, {
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
      show(e)
      ;(children.props as { onMouseEnter?: (e: React.MouseEvent<HTMLElement>) => void }).onMouseEnter?.(e)
    },
    onMouseLeave: (e: React.MouseEvent<HTMLElement>) => {
      hide()
      ;(children.props as { onMouseLeave?: (e: React.MouseEvent<HTMLElement>) => void }).onMouseLeave?.(e)
    },
    onMouseDown: (e: React.MouseEvent<HTMLElement>) => {
      hide()
      ;(children.props as { onMouseDown?: (e: React.MouseEvent<HTMLElement>) => void }).onMouseDown?.(e)
    },
  })

  return (
    <>
      {child}
      {pos && label && createPortal(
        <div
          role="tooltip"
          className="pointer-events-none fixed z-700 flex items-center gap-1.5 px-2 py-[5px] rounded-[7px] bg-[rgb(var(--c-topbar))] text-white text-[12px] font-medium leading-none whitespace-nowrap shadow-[0_4px_12px_-2px_rgb(0_0_0/0.18)] border border-white/8"
          style={{
            left: pos.x,
            top: pos.y,
            transform: side === 'bottom' ? 'translateX(-50%)' : 'translate(-50%, -100%)',
            animation: 'fadeIn 0.12s ease both',
          }}
        >
          {label}
          {shortcut && (
            <span className="px-1 py-[2px] rounded-[4px] border border-white/15 text-white/70 text-[11px] font-medium">{shortcut}</span>
          )}
        </div>,
        document.body
      )}
    </>
  )
}
