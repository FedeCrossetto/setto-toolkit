import { useEffect, useRef, type ComponentType } from 'react'
import { motion } from 'framer-motion'

export interface MenuItem {
  label: string
  icon?: ComponentType<{ size?: number; className?: string }>
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
      className="ui-menu fixed z-[200] py-1.5 min-w-[190px]"
      style={{ left: safeX, top: safeY }}
      initial={{ opacity: 0, scale: 0.96, y: -4 }} animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
    >
      {items.map((item, i) =>
        item.divider ? (
          <div key={i} className="border-t border-outline-variant/20 my-1" />
        ) : (
          <button
            key={i}
            onClick={() => { item.action(); onClose() }}
            className={`ui-menu-item w-full px-3 py-1.5 text-[12px] text-left ${
              item.danger ? 'text-error hover:bg-error/10' : 'text-on-surface-variant'
            }`}
          >
            {item.icon && <item.icon size={15} className="flex-shrink-0" />}
            {item.label}
          </button>
        )
      )}
    </motion.div>
  )
}
