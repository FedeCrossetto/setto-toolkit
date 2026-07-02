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
 * Tooltip propio, consistente con el dark theme de la app.
 * Renderiza por portal en <body> con position:fixed — nunca queda
 * clippeado por contenedores con overflow-hidden.
 * Reemplaza los title= nativos del browser en botones icon-only.
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
        y: side === 'bottom' ? rect.bottom + 8 : rect.top - 8,
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
          className="pointer-events-none fixed z-[500] flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-medium whitespace-nowrap"
          style={{
            left: pos.x,
            top: pos.y,
            transform: side === 'bottom' ? 'translateX(-50%)' : 'translate(-50%, -100%)',
            background: 'rgb(var(--c-surface-container-highest) / 0.95)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            border: '1px solid rgb(var(--c-outline-variant) / 0.3)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
            color: 'rgb(var(--c-on-surface))',
            animation: 'fadeSlideUp 0.12s ease-out',
          }}
        >
          {label}
          {shortcut && (
            <kbd className="text-[9px] px-1 py-px rounded border border-outline-variant/40 bg-surface-container text-on-surface-variant font-mono">
              {shortcut}
            </kbd>
          )}
        </div>,
        document.body
      )}
    </>
  )
}
