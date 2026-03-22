import { useEffect, useRef } from 'react'

export interface MenuItem {
  label: string
  icon: string
  action: () => void
  danger?: boolean
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

  useEffect(() => {
    const onMouse = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose() }
    const onKey   = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', onMouse)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onMouse); document.removeEventListener('keydown', onKey) }
  }, [onClose])

  // Keep menu inside the viewport
  const safeX = Math.min(x, window.innerWidth  - 210)
  const safeY = Math.min(y, window.innerHeight - items.length * 34 - 20)

  return (
    <div
      ref={ref}
      className="fixed z-[200] bg-surface-container border border-outline-variant/30 rounded-xl shadow-2xl py-1.5 min-w-[190px]"
      style={{ left: safeX, top: safeY }}
    >
      {items.map((item, i) =>
        item.divider ? (
          <div key={i} className="border-t border-outline-variant/20 my-1" />
        ) : (
          <button
            key={i}
            onClick={() => { item.action(); onClose() }}
            className={`flex items-center gap-2.5 w-full px-3 py-1.5 text-[12px] text-left transition-colors ${
              item.danger
                ? 'text-error hover:bg-error/10'
                : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
            }`}
          >
            <span className="material-symbols-outlined flex-shrink-0" style={{ fontSize: '15px' }}>{item.icon}</span>
            {item.label}
          </button>
        )
      )}
    </div>
  )
}
