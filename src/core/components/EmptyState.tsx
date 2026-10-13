import type { ReactNode } from 'react'
import type { IconComponent } from '../types'

/** Estado vacío tranquilo: ícono en tile lila, título, descripción y acción opcional. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  compact = false,
}: {
  icon: IconComponent
  title: string
  description?: string
  action?: ReactNode
  /** @deprecated Ignored — the app no longer shows mascots. Kept for API compatibility. */
  mascot?: boolean
  /** Less vertical padding (for cards/widgets). */
  compact?: boolean
}): JSX.Element {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center px-6 max-w-sm mx-auto ${compact ? 'py-6' : 'py-12'}`}
      style={{ animation: 'fadeIn 0.2s ease both' }}
    >
      <div
        className={`rounded-xl flex items-center justify-center bg-selected text-primary ${
          compact ? 'w-9 h-9 mb-2.5' : 'w-11 h-11 mb-3.5'
        }`}
      >
        <Icon size={compact ? 18 : 21} aria-hidden />
      </div>
      <p className="t-headline text-on-surface">{title}</p>
      {description && (
        <p className="t-body text-on-surface-variant whitespace-pre-line mt-1 max-w-[300px]">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
