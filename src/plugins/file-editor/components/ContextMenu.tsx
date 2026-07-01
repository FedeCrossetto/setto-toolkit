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
      className="fixed z-[200] py-1.5 min-w-[200px] rounded-xl overflow-hidden"
      style={{
        left: safeX, top: safeY,
        background: 'rgb(var(--c-surface-container) / 0.88)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid rgb(var(--c-outline-variant) / 0.25)',
        boxShadow: '0 16px 40px rgba(0,0,0,0.28), 0 4px 12px rgba(0,0,0,0.16)',
      }}
      initial={{ opacity: 0, scale: 0.95, y: -6 }} animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.13, ease: 'easeOut' }}
    >
      {items.map((item, i) =>
        item.divider ? (
          <div key={i} className="border-t border-outline-variant/15 my-1 mx-2" />
        ) : (
          <button
            key={i}
            onClick={() => { item.action(); onClose() }}
            className={`flex items-center gap-2.5 w-full px-3 py-1.5 text-[12px] text-left transition-colors ${
              item.danger
                ? 'text-error hover:bg-error/12'
                : 'text-on-surface-variant hover:text-on-surface hover:bg-on-surface/[0.06]'
            }`}
          >
            {item.icon && (
              <item.icon
                size={13}
                className={`flex-shrink-0 ${item.danger ? 'text-error/80' : 'text-on-surface-variant/60'}`}
              />
            )}
            {item.label}
          </button>
        )
      )}
    </motion.div>
  )
}
