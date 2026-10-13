import { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import type { IconComponent } from '../../../core/types'

export interface MenuItem {
  label: string
  icon?: IconComponent
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
    <motion.div
      ref={ref}
      className="ui-menu fixed z-[200] min-w-[200px]"
      style={{ left: safeX, top: safeY }}
      initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.1, ease: 'easeOut' }}
    >
      {items.map((item, i) =>
        item.divider ? (
          <div key={i} className="hairline-t my-1 mx-1.5" />
        ) : (
          <button
            key={i}
            onClick={() => { item.action(); onClose() }}
            className={`ui-menu-item w-full text-left ${item.danger ? '!text-error hover:!text-on-primary' : ''}`}
          >
            {item.icon && (
              <item.icon size={14} className="flex-shrink-0 opacity-80" />
            )}
            {item.label}
          </button>
        )
      )}
    </motion.div>
  )
}
